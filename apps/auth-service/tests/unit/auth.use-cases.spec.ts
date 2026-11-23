import { expect } from "chai";
import * as sinon from "sinon";
import { AuthUseCases } from "../../src/application/use-cases/auth.use-cases";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import authPayloads from "../fixtures/auth-payloads.json";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { EmailService } from "../../src/infrastructure/messaging/email.service";
import { UserEventsProducer } from "../../src/infrastructure/messaging/user-events.producer";

type Stubbed<T> = { [P in keyof T]?: sinon.SinonStub };

describe("AuthUseCases (Unit)", () => {
  let authUseCases: AuthUseCases;
  let prismaMock: Stubbed<PrismaService> & {
    user: Stubbed<PrismaService["user"]>;
    emailVerification: Stubbed<PrismaService["emailVerification"]>;
    refreshToken: Stubbed<PrismaService["refreshToken"]>;
    passwordReset: Stubbed<PrismaService["passwordReset"]>;
  };
  let jwtServiceMock: Stubbed<JwtService>;
  let emailServiceMock: Stubbed<EmailService>;
  let userEventsProducerMock: Stubbed<UserEventsProducer>;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: sinon.stub(),
        create: sinon.stub(),
        update: sinon.stub(),
      },
      emailVerification: {
        upsert: sinon.stub(),
      },
      refreshToken: {
        create: sinon.stub(),
        findUnique: sinon.stub(),
        updateMany: sinon.stub(),
        deleteMany: sinon.stub(),
      },
      passwordReset: {
        findUnique: sinon.stub(),
        upsert: sinon.stub(),
        delete: sinon.stub(),
      },
      $transaction: sinon.stub(),
    } as unknown as Stubbed<PrismaService> & {
      user: Stubbed<PrismaService["user"]>;
      emailVerification: Stubbed<PrismaService["emailVerification"]>;
      refreshToken: Stubbed<PrismaService["refreshToken"]>;
      passwordReset: Stubbed<PrismaService["passwordReset"]>;
    };

    jwtServiceMock = {
      signAsync: sinon.stub(),
    } as unknown as Stubbed<JwtService>;

    emailServiceMock = {
      sendVerificationEmail: sinon.stub(),
      sendPasswordResetEmail: sinon.stub(),
    } as unknown as Stubbed<EmailService>;

    userEventsProducerMock = {
      emitUserCreated: sinon.stub(),
    } as unknown as Stubbed<UserEventsProducer>;

    authUseCases = new AuthUseCases(
      prismaMock as unknown as PrismaService,
      jwtServiceMock as unknown as JwtService,
      emailServiceMock as unknown as EmailService,
      userEventsProducerMock as unknown as UserEventsProducer,
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  // ---------------------------------------------------------------------------
  // Token format — all generators must produce 64-char lowercase hex strings
  // ---------------------------------------------------------------------------
  describe("token generation", () => {
    it("generateEmailVerificationToken returns a 64-char hex string", async () => {
      prismaMock.emailVerification!.upsert!.resolves({});
      const token =
        await authUseCases.generateEmailVerificationToken("user-id");
      expect(token).to.match(/^[0-9a-f]{64}$/);
    });

    it("generatePasswordResetToken returns a 64-char hex string", async () => {
      prismaMock.passwordReset!.upsert!.resolves({});
      const token = await authUseCases.generatePasswordResetToken("user-id");
      expect(token).to.match(/^[0-9a-f]{64}$/);
    });

    it("consecutive tokens are unique (no Math.random collision risk)", async () => {
      prismaMock.emailVerification!.upsert!.resolves({});
      const token1 =
        await authUseCases.generateEmailVerificationToken("user-id");
      const token2 =
        await authUseCases.generateEmailVerificationToken("user-id");
      expect(token1).to.not.equal(token2);
    });
  });

  describe("session lifetime and refresh rotation", () => {
    const day = 86_400_000;
    const now = Date.parse("2026-11-23T08:00:00.000Z");
    const user = { id: "user-id", email: "user@example.com", isVerified: true };
    const token = "existing-refresh-token";
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");

    beforeEach(() => {
      sinon.useFakeTimers({ now, toFake: ["Date"] });
      jwtServiceMock.signAsync!.resolves("signed-access");
      prismaMock.refreshToken.create!.resolves({});
      prismaMock.refreshToken.updateMany!.resolves({ count: 1 });
      prismaMock.refreshToken.findUnique!.resolves({
        id: "session-id",
        user,
        createdAt: new Date(now - day),
        expiresAt: new Date(now + day),
      });
    });

    it("issues a fifteen-minute JWT and stores only the hash of the seven-day refresh cookie", async () => {
      const session = await authUseCases.login(user);

      expect(session.refreshToken).to.match(/^[0-9a-f]{64}$/);
      expect(session.accessExpiresAt).to.deep.equal(new Date(now + 900_000));
      expect(session.refreshExpiresAt).to.deep.equal(new Date(now + 7 * day));
      expect(prismaMock.refreshToken.create!.firstCall.args[0].data).to.deep.equal({
        tokenHash: hash(session.refreshToken),
        userId: user.id,
        createdAt: new Date(now),
        expiresAt: session.refreshExpiresAt,
      });
    });

    it("rotates on the existing session row and rolls expiry forward by seven days", async () => {
      const session = await authUseCases.refreshTokens(token);

      expect(prismaMock.refreshToken.findUnique!.firstCall.args[0].where).to.deep.equal({
        tokenHash: hash(token),
      });
      const rotation = prismaMock.refreshToken.updateMany!.firstCall.args[0];
      expect(rotation.where).to.include({ id: "session-id", tokenHash: hash(token) });
      expect(rotation.data).to.deep.equal({
        tokenHash: hash(session.refreshToken),
        expiresAt: new Date(now + 7 * day),
      });
      expect(prismaMock.refreshToken.create!.called).to.equal(false);
    });

    it("caps both cookies and the signed JWT at the original session deadline", async () => {
      const cutoff = new Date(now + 120_000);
      prismaMock.refreshToken.findUnique!.resolves({
        id: "session-id",
        user,
        createdAt: new Date(cutoff.getTime() - 30 * day),
        expiresAt: new Date(now + day),
      });

      const session = await authUseCases.refreshTokens(token);
      expect(session.accessExpiresAt).to.deep.equal(cutoff);
      expect(session.refreshExpiresAt).to.deep.equal(cutoff);
      const [, options] = jwtServiceMock.signAsync!.firstCall.args;
      expect(options.expiresIn).to.equal(120);
    });

    for (const deadline of ["rolling", "absolute"]) {
      it(`rejects refresh at the ${deadline} expiration boundary`, async () => {
        prismaMock.refreshToken.findUnique!.resolves({
          id: "session-id",
          user,
          createdAt: new Date(now - (deadline === "absolute" ? 30 : 7) * day),
          expiresAt: new Date(deadline === "rolling" ? now : now + day),
        });

        await expectRefreshRejected();
        expect(prismaMock.refreshToken.updateMany!.called).to.equal(false);
      });
    }

    async function expectRefreshRejected() {
      try {
        await authUseCases.refreshTokens(token);
        expect.fail("Expected refresh to fail");
      } catch (error) {
        expect(error).to.be.instanceOf(UnauthorizedException);
      }
    }

    it("rejects a concurrent rotation loser and issues no replacement cookie", async () => {
      prismaMock.refreshToken.updateMany!.resolves({ count: 0 });
      await expectRefreshRejected();
      expect(prismaMock.refreshToken.create!.called).to.equal(false);
    });

    it("revokes the stored hash on logout", async () => {
      await authUseCases.logout(token);
      expect(prismaMock.refreshToken.deleteMany!.firstCall.args[0]).to.deep.equal({
        where: { tokenHash: hash(token) },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // register — password policy enforcement
  // ---------------------------------------------------------------------------
  describe("register", () => {
    it("successfully registers a new user with a strong password", async () => {
      const registerDto = authPayloads.payloads.register; // 'Password123!'
      const createdUser = { id: "new-id", email: registerDto.email };

      prismaMock.user!.findUnique!.resolves(null);
      prismaMock.user!.create!.resolves(createdUser);
      prismaMock.emailVerification!.upsert!.resolves({});
      emailServiceMock.sendVerificationEmail!.resolves();
      userEventsProducerMock.emitUserCreated!.resolves();

      const result = await authUseCases.register(registerDto);

      expect(result).to.deep.equal(createdUser);
      expect(prismaMock.user!.create!.calledOnce).to.equal(true);
      expect(emailServiceMock.sendVerificationEmail!.calledOnce).to.equal(true);
      expect(userEventsProducerMock.emitUserCreated!.calledOnce).to.equal(true);
    });

    it("throws ConflictException if user already exists with LOCAL provider", async () => {
      const registerDto = authPayloads.payloads.register;
      prismaMock.user!.findUnique!.resolves({
        id: "existing-id",
        email: registerDto.email,
        provider: "LOCAL",
      });

      try {
        await authUseCases.register(registerDto);
        throw new Error("Should have thrown ConflictException");
      } catch (error: unknown) {
        const err = error as { status: number; message: string };
        expect(err.status).to.equal(409);
        expect(err.message).to.equal("User already exists");
      }
    });

    it("throws BadRequestException when password is under 8 characters", async () => {
      prismaMock.user!.findUnique!.resolves(null);

      try {
        await authUseCases.register({ email: "a@b.com", password: "Short1!" });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number; message: string };
        expect(err.status).to.equal(400);
        expect(err.message).to.equal(
          "Password must be 8–128 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&-_#^()).",
        );
      }
    });

    it("throws BadRequestException when password has no uppercase letter", async () => {
      prismaMock.user!.findUnique!.resolves(null);

      try {
        await authUseCases.register({
          email: "a@b.com",
          password: "alllower1!",
        });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when password has no lowercase letter", async () => {
      prismaMock.user!.findUnique!.resolves(null);

      try {
        await authUseCases.register({
          email: "a@b.com",
          password: "ALLUPPER1!",
        });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when password has no digit", async () => {
      prismaMock.user!.findUnique!.resolves(null);

      try {
        await authUseCases.register({
          email: "a@b.com",
          password: "NoDigit!Abc",
        });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when password has no special character", async () => {
      prismaMock.user!.findUnique!.resolves(null);

      try {
        await authUseCases.register({
          email: "a@b.com",
          password: "NoSpecial123",
        });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when password exceeds 128 characters", async () => {
      prismaMock.user!.findUnique!.resolves(null);
      const longPassword = "A1!".padEnd(129, "a");

      try {
        await authUseCases.register({
          email: "a@b.com",
          password: longPassword,
        });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("does not call bcrypt.hash when password policy fails", async () => {
      prismaMock.user!.findUnique!.resolves(null);
      const bcryptStub = sinon.stub(bcrypt, "hash").resolves("hashed");

      try {
        await authUseCases.register({ email: "a@b.com", password: "weak" });
      } catch {
        // expected to throw
      }

      expect(bcryptStub.called).to.equal(false);
      bcryptStub.restore();
    });

    it("throws BadRequestException when linking a Google account with a weak password", async () => {
      prismaMock.user!.findUnique!.resolves({
        id: "google-id",
        email: "a@b.com",
        provider: "GOOGLE",
      });

      try {
        await authUseCases.register({ email: "a@b.com", password: "weak" });
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // resetPassword — policy enforcement + token validation
  // ---------------------------------------------------------------------------
  describe("resetPassword", () => {
    it("successfully resets password with a valid token and strong password", async () => {
      const futureDate = new Date(Date.now() + 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: futureDate,
      });
      prismaMock.user!.update!.resolves({});
      prismaMock.passwordReset!.delete!.resolves({});
      prismaMock.$transaction!.resolves();

      await authUseCases.resetPassword("valid-token", "NewStrong1!");

      expect(prismaMock.$transaction!.calledOnce).to.equal(true);
    });

    it("throws BadRequestException when token is expired", async () => {
      const pastDate = new Date(Date.now() - 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: pastDate,
      });

      try {
        await authUseCases.resetPassword("expired-token", "NewStrong1!");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number; message: string };
        expect(err.status).to.equal(400);
        expect(err.message).to.equal("Invalid or expired password reset token");
      }
    });

    it("throws BadRequestException when token is valid but password is weak", async () => {
      const futureDate = new Date(Date.now() + 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: futureDate,
      });

      try {
        await authUseCases.resetPassword("valid-token", "weakpass");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when token does not exist", async () => {
      prismaMock.passwordReset!.findUnique!.resolves(null);

      try {
        await authUseCases.resetPassword("nonexistent-token", "NewStrong1!");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // setPassword — same structure as resetPassword
  // ---------------------------------------------------------------------------
  describe("setPassword", () => {
    it("successfully sets password with a valid token and strong password", async () => {
      const futureDate = new Date(Date.now() + 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: futureDate,
      });
      prismaMock.user!.update!.resolves({});
      prismaMock.passwordReset!.delete!.resolves({});
      prismaMock.$transaction!.resolves();

      await authUseCases.setPassword("valid-token", "NewStrong1!");

      expect(prismaMock.$transaction!.calledOnce).to.equal(true);
    });

    it("throws BadRequestException when token is expired", async () => {
      const pastDate = new Date(Date.now() - 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: pastDate,
      });

      try {
        await authUseCases.setPassword("expired-token", "NewStrong1!");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number; message: string };
        expect(err.status).to.equal(400);
        expect(err.message).to.equal("Invalid or expired password setup token");
      }
    });

    it("throws BadRequestException when token is valid but password is weak", async () => {
      const futureDate = new Date(Date.now() + 60_000);
      prismaMock.passwordReset!.findUnique!.resolves({
        id: "reset-id",
        userId: "user-id",
        expiresAt: futureDate,
      });

      try {
        await authUseCases.setPassword("valid-token", "weakpass");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });

    it("throws BadRequestException when token does not exist", async () => {
      prismaMock.passwordReset!.findUnique!.resolves(null);

      try {
        await authUseCases.setPassword("nonexistent-token", "NewStrong1!");
        throw new Error("Should have thrown BadRequestException");
      } catch (error: unknown) {
        const err = error as { status: number };
        expect(err.status).to.equal(400);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // validateUser
  // ---------------------------------------------------------------------------
  describe("validateUser", () => {
    it("returns user without password if credentials are valid", async () => {
      const user = authPayloads.users.valid;
      prismaMock.user!.findUnique!.resolves({
        ...user,
        password: "hashed_password",
      });

      const bcryptStub = sinon.stub(bcrypt, "compare").resolves(true);

      const result = await authUseCases.validateUser(user.email, user.password);

      expect(result).to.not.have.property("password");
      expect(result?.email).to.equal(user.email);
      expect(bcryptStub.calledOnce).to.equal(true);
      bcryptStub.restore();
    });

    it("returns null if password is invalid", async () => {
      const user = authPayloads.users.valid;
      prismaMock.user!.findUnique!.resolves({
        ...user,
        password: "hashed_password",
      });

      const bcryptStub = sinon.stub(bcrypt, "compare").resolves(false);

      const result = await authUseCases.validateUser(
        user.email,
        "WrongPassword",
      );

      expect(result).to.equal(null);
      expect(bcryptStub.calledOnce).to.equal(true);
      bcryptStub.restore();
    });
  });

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------
  describe("login", () => {
    it("successfully logs in and returns tokens", async () => {
      const user = authPayloads.users.valid;
      const tokens = authPayloads.tokens;

      jwtServiceMock.signAsync!.resolves(tokens.access);
      prismaMock.refreshToken!.create!.resolves({});

      const result = await authUseCases.login(
        user as unknown as { id: string; email: string; isVerified: boolean },
      );

      expect(result.accessToken).to.equal(tokens.access);
      expect(result.user.email).to.equal(user.email);
      expect(jwtServiceMock.signAsync!.calledOnce).to.equal(true);
    });

    it("throws UnauthorizedException if email is not verified", async () => {
      const user = authPayloads.users.unverified;

      try {
        await authUseCases.login(
          user as unknown as { id: string; email: string; isVerified: boolean },
        );
        throw new Error("Should have thrown UnauthorizedException");
      } catch (error: unknown) {
        const err = error as { status: number; message: string };
        expect(err.status).to.equal(401);
        expect(err.message).to.equal("Please verify your email first");
      }
    });
  });
});
