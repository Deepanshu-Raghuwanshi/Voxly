import { Test, TestingModule } from "@nestjs/testing";
import {
  INestApplication,
  HttpStatus,
  ConflictException,
} from "@nestjs/common";
import request from "supertest";
import { expect } from "chai";
import * as sinon from "sinon";
import cookieParser from "cookie-parser";
import { AuthController } from "../../src/interfaces/controllers/auth.controller";
import {
  AuthUseCases,
} from "../../src/application/use-cases/auth.use-cases";
import authPayloads from "../fixtures/auth-payloads.json";

describe("AuthController (Integration)", () => {
  let app: INestApplication;
  let authUseCasesMock: sinon.SinonStubbedInstance<AuthUseCases>;

  before(async () => {
    authUseCasesMock = sinon.createStubInstance(AuthUseCases);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthUseCases,
          useValue: authUseCasesMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  after(async () => {
    if (app) await app.close();
    sinon.restore();
  });

  describe("POST /auth/register", () => {
    it("should successfully register a user", async () => {
      const registerData = authPayloads.payloads.register;
      const expectedUser = { id: "new-id", email: registerData.email };
      authUseCasesMock.register.resolves(
        expectedUser as unknown as { id: string; email: string },
      );

      const response = await request(app.getHttpServer())
        .post("/auth/register")
        .send(registerData);

      expect(response.status).to.equal(HttpStatus.CREATED);
      expect(response.body).to.deep.equal(expectedUser);
    });

    it("should return 409 if user already exists", async () => {
      const registerData = authPayloads.payloads.register;
      authUseCasesMock.register.rejects(
        new ConflictException("User already exists"),
      );

      const response = await request(app.getHttpServer())
        .post("/auth/register")
        .send(registerData);

      expect(response.status).to.equal(HttpStatus.CONFLICT);
      expect(response.body.message).to.equal("User already exists");
    });
  });

  describe("POST /auth/login", () => {
    it("should successfully login and set cookies", async () => {
      const loginData = authPayloads.payloads.login;
      const user = authPayloads.users.valid;
      const tokens = authPayloads.tokens;

      authUseCasesMock.validateUser.resolves(
        user as unknown as { id: string; email: string; isVerified: boolean },
      );
      authUseCasesMock.login.resolves({
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        accessExpiresAt: new Date("2026-11-23T08:15:00Z"),
        refreshExpiresAt: new Date("2026-11-30T08:00:00Z"),
        user: { id: user.id, email: user.email },
      });

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send(loginData);

      expect(response.status).to.equal(HttpStatus.CREATED);
      expect(response.body.email).to.equal(user.email);
      expect(response.headers["set-cookie"]).to.have.lengthOf(2);
      expect(response.headers["set-cookie"][0]).to.contain("access_token");
      expect(response.headers["set-cookie"][1]).to.contain("refresh_token");
    });

    it("should return 401 with invalid credentials", async () => {
      const loginData = authPayloads.payloads.login;
      authUseCasesMock.validateUser.resolves(null);

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send(loginData);

      expect(response.status).to.equal(HttpStatus.UNAUTHORIZED);
      expect(response.body.message).to.equal("Invalid credentials");
    });
  });

  describe("POST /auth/refresh", () => {
    it("writes capped cookie expiry and returns only the identity", async () => {
      const user = { id: "user-id", email: "user@example.com" };
      const expiresAt = new Date("2026-11-23T08:02:00Z");
      authUseCasesMock.refreshTokens.resolves({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        accessExpiresAt: expiresAt,
        refreshExpiresAt: expiresAt,
        user,
      });

      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .set("Cookie", "refresh_token=previous-token")
        .expect(HttpStatus.CREATED);

      expect(authUseCasesMock.refreshTokens.calledWithExactly("previous-token")).to.equal(true);
      expect(response.body).to.deep.equal(user);
      const cookies = response.headers["set-cookie"];
      expect(cookies[0]).to.contain("access_token=new-access");
      expect(cookies[1]).to.contain("refresh_token=new-refresh");
      for (const cookie of cookies) {
        expect(cookie).to.contain(`Expires=${expiresAt.toUTCString()}`);
        expect(cookie).to.contain("HttpOnly; Secure; SameSite=None");
      }
    });

    it("returns 401 without writing cookies when no refresh cookie was sent", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.headers["set-cookie"]).to.equal(undefined);
    });
  });

  describe("POST /auth/logout", () => {
    it("should logout successfully and clear cookies", async () => {
      authUseCasesMock.logout.resolves();

      const response = await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Cookie", [`refresh_token=${authPayloads.tokens.refresh}`]);

      expect(response.status).to.equal(HttpStatus.CREATED);
      expect(response.body.message).to.equal("Logged out successfully");

      const setCookie = response.headers["set-cookie"];
      expect(setCookie[0]).to.contain("access_token=;");
      expect(setCookie[1]).to.contain("refresh_token=;");
    });
  });
});
