import { expect } from "chai";
import { createHash, randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient } from "@prisma/client-auth";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AuthUseCases } from "../../src/application/use-cases/auth.use-cases";
import type { PrismaService } from "../../src/infrastructure/persistence/prisma.service";
import type { EmailService } from "../../src/infrastructure/messaging/email.service";
import type { UserEventsProducer } from "../../src/infrastructure/messaging/user-events.producer";
import { AuthController } from "../../src/interfaces/controllers/auth.controller";

const databaseUrl = process.env.AUTH_SESSION_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("Auth session lifecycle with PostgreSQL", () => {
  let db: PrismaClient;
  let app: INestApplication;
  let auth: AuthUseCases;
  let user: { id: string; email: string; isVerified: boolean };
  const jwt = new JwtService();
  const day = 86_400_000;
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");

  before(async () => {
    const { PrismaClient } = await import("@prisma/client-auth");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    auth = new AuthUseCases(
      db as PrismaService, jwt, {} as EmailService, {} as UserEventsProducer,
    );
    user = await db.user.create({
      data: { email: `${randomUUID()}@example.invalid`, isVerified: true },
    });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthUseCases, useValue: auth }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
  });

  after(async () => {
    if (app) await app.close();
    if (user) {
      await db.refreshToken.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    if (db) await db.$disconnect();
  });

  const refresh = (token: string) => request(app.getHttpServer())
    .post("/auth/refresh").set("Cookie", `refresh_token=${token}`);

  it("rotates exactly once when two requests present the same valid cookie", async () => {
    const initial = await auth.login(user);
    const original = await db.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hash(initial.refreshToken) },
    });

    const results = await Promise.all([refresh(initial.refreshToken), refresh(initial.refreshToken)]);
    expect(results.map(({ status }) => status).sort()).to.deep.equal([201, 401]);
    const winner = results.find(({ status }) => status === 201)!;
    const loser = results.find(({ status }) => status === 401)!;
    expect(loser.headers["set-cookie"]).to.equal(undefined);
    expect(winner.body).to.deep.equal({ id: user.id, email: user.email });

    const rotatedToken = winner.headers["set-cookie"][1].split(";")[0].split("=")[1];
    const rotated = await db.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hash(rotatedToken) },
    });
    expect(rotated.id).to.equal(original.id);
    expect(rotated.createdAt).to.deep.equal(original.createdAt);
    await refresh(initial.refreshToken).expect(401);

    await request(app.getHttpServer()).post("/auth/logout")
      .set("Cookie", `refresh_token=${rotatedToken}`).expect(201);
    await refresh(rotatedToken).expect(401);
  });

  it("records the same absolute deadline in the database, JWT and cookies", async () => {
    const initial = await auth.login(user);
    const deadline = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000);
    const { id } = await db.refreshToken.update({
      where: { tokenHash: hash(initial.refreshToken) },
      data: { createdAt: new Date(deadline.getTime() - 30 * day) },
    });

    const response = await refresh(initial.refreshToken).expect(201);
    const cookies = response.headers["set-cookie"];
    const accessToken = cookies[0].split(";")[0].split("=")[1];
    const payload = jwt.verify<{ sub: string; exp: number }>(accessToken, {
      secret: process.env.JWT_ACCESS_SECRET || "access-secret",
    });
    const rotated = await db.refreshToken.findUniqueOrThrow({ where: { id } });

    expect(payload.sub).to.equal(user.id);
    expect(payload.exp).to.equal(deadline.getTime() / 1000);
    expect(rotated.expiresAt).to.deep.equal(deadline);
    for (const cookie of cookies) expect(cookie).to.contain(`Expires=${deadline.toUTCString()}`);
  });
});
