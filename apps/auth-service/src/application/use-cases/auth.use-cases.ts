import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { User } from "@prisma/client-auth";
import { RegisterDto } from "@shared-types";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { EmailService } from "../../infrastructure/messaging/email.service";
import { UserEventsProducer } from "../../infrastructure/messaging/user-events.producer";
import { validatePasswordPolicy } from "../utils/password-policy";

export interface GoogleProfile {
  email: string;
  googleId: string;
}

// Internal result of a successful login. The tokens are set as HttpOnly
// cookies by the controller and never sent in the HTTP body, so this is an
// internal transport shape rather than a public API response schema.
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  user: {
    id: string;
    email: string;
    username?: string;
    fullName?: string;
    avatarUrl?: string;
  };
}

const ACCESS_TTL_SECONDS = 15 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 7 * DAY_MS;
const SESSION_TTL_MS = 30 * DAY_MS;

const hashRefreshToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthUseCases {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private userEventsProducer: UserEventsProducer,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      if (existingUser.provider === "GOOGLE") {
        // Link account by adding password and updating provider
        validatePasswordPolicy(dto.password);
        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            provider: "BOTH",
          },
        });
        return { id: user.id, email: user.email };
      }
      throw new ConflictException("User already exists");
    }

    validatePasswordPolicy(dto.password);

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        provider: "LOCAL",
        isVerified: false,
      },
    });

    const verificationToken = await this.generateEmailVerificationToken(
      user.id,
    );
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        verificationToken,
      );
    } catch (error) {
      console.error("Failed to send verification email:", error);
    }

    await this.userEventsProducer.emitUserCreated({
      id: user.id,
      email: user.email,
    });

    return { id: user.id, email: user.email };
  }
  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Don't leak whether the account exists or is already verified
    if (!user || user.isVerified || user.provider === "GOOGLE") {
      return {
        message:
          "If an unverified account exists for this email, a new verification link has been sent.",
      };
    }
    const token = await this.generateEmailVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, token);
    return {
      message:
        "If an unverified account exists for this email, a new verification link has been sent.",
    };
  }

  async verifyEmail(token: string) {
    const verification = await this.prisma.emailVerification.findUnique({
      where: { token },
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    await this.prisma.user.update({
      where: { id: verification.userId },
      data: { isVerified: true },
    });

    await this.prisma.emailVerification.delete({
      where: { id: verification.id },
    });

    return { message: "Email verified successfully" };
  }

  async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // 24 hours

    await this.prisma.emailVerification.upsert({
      where: { userId },
      update: { token, expiresAt },
      create: { userId, token, expiresAt },
    });

    return token;
  }

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Partial<User> | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    if (user.provider === "GOOGLE" && !user.password) {
      throw new UnauthorizedException(
        'Please set your password first by clicking "Forgot?" or via the email we sent you',
      );
    }

    if (user.password && (await bcrypt.compare(pass, user.password))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: Partial<User>): Promise<AuthResponse> {
    const createdAt = new Date();
    const session = await this.issueTokens(user, createdAt);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(session.refreshToken),
        userId: session.user.id,
        expiresAt: session.refreshExpiresAt,
        createdAt,
      },
    });
    return session;
  }

  private async issueTokens(user: Partial<User>, createdAt: Date): Promise<AuthResponse> {
    if (!user.id || !user.email) {
      throw new UnauthorizedException("Invalid user data");
    }
    if (!user.isVerified && user.provider === "LOCAL") {
      throw new UnauthorizedException("Please verify your email first");
    }

    const now = Date.now();
    const refreshExpiresAt = new Date(
      Math.min(now + REFRESH_TTL_MS, createdAt.getTime() + SESSION_TTL_MS),
    );
    const iat = Math.floor(now / 1000);
    const exp = Math.min(iat + ACCESS_TTL_SECONDS, Math.floor(refreshExpiresAt.getTime() / 1000));
    if (exp <= iat) {
      throw new UnauthorizedException("Session has expired");
    }

    const accessToken = await this.jwtService.signAsync(
      { email: user.email, sub: user.id, iat },
      {
        secret: process.env.JWT_ACCESS_SECRET || "access-secret",
        expiresIn: exp - iat,
      },
    );
    return {
      accessToken,
      accessExpiresAt: new Date(exp * 1000),
      refreshToken: randomBytes(32).toString("hex"),
      refreshExpiresAt,
      user: { id: user.id, email: user.email },
    };
  }

  async validateGoogleUser(profile: GoogleProfile) {
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.googleId,
          provider: "GOOGLE",
          isVerified: true,
        },
      });

      await this.userEventsProducer.emitUserCreated({
        id: user.id,
        email: user.email,
      });
    } else {
      // Existing user signing in via Google — Google has verified the email,
      // so mark isVerified true and link Google identity if not already linked.
      const updates: {
        isVerified: boolean;
        googleId?: string;
        provider?: "GOOGLE" | "BOTH";
      } = {
        isVerified: true,
      };
      if (!user.googleId) updates.googleId = profile.googleId;
      if (user.provider === "LOCAL") updates.provider = "BOTH";

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: updates,
      });
    }

    if (!user.password) {
      const token = await this.generatePasswordResetToken(user.id);
      try {
        await this.emailService.sendPasswordSetupEmail(user.email, token);
      } catch (error) {
        console.error("Failed to send password setup email:", error);
      }
    }

    return this.login(user);
  }

  async generatePasswordResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes

    await this.prisma.passwordReset.upsert({
      where: { userId },
      update: { token, expiresAt },
      create: { userId, token, expiresAt },
    });

    return token;
  }

  async setPassword(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!reset || reset.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired password setup token");
    }

    validatePasswordPolicy(password);

    const hashedPassword = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          password: hashedPassword,
          provider: "BOTH",
        },
      }),
      this.prisma.passwordReset.delete({
        where: { id: reset.id },
      }),
    ]);

    return { message: "Password set successfully" };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't leak user existence info, just return success
      return {
        message:
          "If an account exists for this email, you will receive a password reset link shortly",
      };
    }

    const token = await this.generatePasswordResetToken(user.id);
    await this.emailService.sendPasswordResetEmail(user.email, token);

    return {
      message:
        "If an account exists for this email, you will receive a password reset link shortly",
    };
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!reset || reset.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired password reset token");
    }

    validatePasswordPolicy(password);

    const hashedPassword = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          password: hashedPassword,
        },
      }),
      this.prisma.passwordReset.delete({
        where: { id: reset.id },
      }),
    ]);

    return { message: "Password reset successfully" };
  }

  async refreshTokens(token: string) {
    const tokenHash = hashRefreshToken(token);
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!refreshToken || refreshToken.expiresAt <= new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const session = await this.issueTokens(refreshToken.user, refreshToken.createdAt);
    const now = new Date();
    const { count } = await this.prisma.refreshToken.updateMany({
      where: {
        id: refreshToken.id,
        tokenHash,
        expiresAt: { gt: now },
        createdAt: { gt: new Date(now.getTime() - SESSION_TTL_MS) },
      },
      data: {
        tokenHash: hashRefreshToken(session.refreshToken),
        expiresAt: session.refreshExpiresAt,
      },
    });
    if (count !== 1) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    return session;
  }

  async changeEmail(userId: string, newEmail: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictException("Email already in use");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour

    await this.prisma.emailChange.upsert({
      where: { userId },
      update: { newEmail, token, expiresAt },
      create: { userId, newEmail, token, expiresAt },
    });

    await this.emailService.sendEmailChangeVerification(newEmail, token);

    return { message: "Verification email sent to new address" };
  }

  async verifyEmailChange(token: string, newEmail: string) {
    const changeRequest = await this.prisma.emailChange.findUnique({
      where: { token },
    });

    if (
      !changeRequest ||
      changeRequest.expiresAt < new Date() ||
      changeRequest.newEmail !== newEmail
    ) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    const user = await this.prisma.user.update({
      where: { id: changeRequest.userId },
      data: { email: newEmail },
    });

    await this.prisma.emailChange.delete({
      where: { id: changeRequest.id },
    });

    // Notify other services about email change
    await this.userEventsProducer.emitUserUpdated({
      id: user.id,
      email: user.email,
    });

    return { message: "Email updated successfully" };
  }

  async logout(token: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: hashRefreshToken(token) },
    });
  }
}
