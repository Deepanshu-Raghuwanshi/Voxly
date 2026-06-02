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
  AuthResponse,
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
        user: { id: user.id, email: user.email },
      } as unknown as AuthResponse);

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
