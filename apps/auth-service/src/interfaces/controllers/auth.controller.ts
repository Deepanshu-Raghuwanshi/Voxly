import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { RegisterDto, LoginDto } from "@shared-types";
import {
  AuthUseCases,
  GoogleProfile,
} from "../../application/use-cases/auth.use-cases";

@Controller("auth")
export class AuthController {
  constructor(private authUseCases: AuthUseCases) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return this.authUseCases.register(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post("resend-verification")
  async resendVerification(@Body() body: { email: string }) {
    return this.authUseCases.resendVerificationEmail(body.email);
  }

  @Get("verify-email")
  async verifyEmail(@Req() req: Request) {
    const token = req.query.token as string;
    return this.authUseCases.verifyEmail(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("set-password")
  async setPassword(@Body() body: { token: string; password: string }) {
    return this.authUseCases.setPassword(body.token, body.password);
  }

  @Post("forgot-password")
  async forgotPassword(@Body() body: { email: string }) {
    return this.authUseCases.forgotPassword(body.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("reset-password")
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authUseCases.resetPassword(body.token, body.password);
  }

  @Post("change-email")
  @UseGuards(AuthGuard("jwt"))
  async changeEmail() {
    throw new ForbiddenException("Email change is disabled");
  }

  @Post("verify-email-change")
  async verifyEmailChange(@Body() body: { token: string; newEmail: string }) {
    return this.authUseCases.verifyEmailChange(body.token, body.newEmail);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  async login(
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginDto,
  ) {
    const user = await this.authUseCases.validateUser(
      body.email,
      body.password,
    );
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const {
      accessToken,
      refreshToken,
      user: userData,
    } = await this.authUseCases.login(user);

    this.setAuthCookies(res, accessToken, refreshToken);
    return userData;
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies["refresh_token"];
    if (refreshToken) {
      await this.authUseCases.logout(refreshToken);
    }
    this.clearAuthCookies(res);
    return { message: "Logged out successfully" };
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies["refresh_token"];
    if (!refreshToken) {
      throw new UnauthorizedException("No refresh token provided");
    }

    const {
      accessToken,
      refreshToken: newRefreshToken,
      user: userData,
    } = await this.authUseCases.refreshTokens(refreshToken);

    this.setAuthCookies(res, accessToken, newRefreshToken);
    return userData;
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth() {
    // Redirects to Google login
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authUseCases.validateGoogleUser(req.user as GoogleProfile);

    this.setAuthCookies(res, accessToken, refreshToken);

    // Redirect to frontend
    res.redirect(process.env.FRONTEND_URL + "/auth/success");
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  }
}
