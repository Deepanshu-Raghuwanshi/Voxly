import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Test } from "@nestjs/testing";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, RedisClientType } from "redis";
import { ServerOptions } from "socket.io";
import { io, Socket } from "socket.io-client";
import * as sinon from "sinon";
import supertest from "supertest";
import cookieParser from "cookie-parser";
import { PresenceStatus, UserPresenceUpdatedEventV1 } from "@kafka-events";
import { presenceKey } from "@shared-utils/presence";
import { RedisPresenceRepository } from "../../src/infrastructure/cache/redis-presence.repository";
import { RedisService } from "../../src/infrastructure/cache/redis.service";
import { PresenceGateway } from "../../src/interfaces/gateways/presence.gateway";
import { GetFriendsPresenceUseCase } from "../../../user-service/src/application/use-cases/get-friends-presence.use-case";
import { RedisPresenceRepository as UserPresenceRepository } from "../../../user-service/src/infrastructure/cache/redis-presence.repository";
import { PrismaService } from "../../../user-service/src/infrastructure/persistence/prisma.service";
import { JwtStrategy } from "../../../user-service/src/infrastructure/strategies/jwt.strategy";
import { FriendsController } from "../../../user-service/src/interfaces/controllers/friends.controller";

const redisUrl = process.env.PRESENCE_TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis("Presence with Socket.IO and Redis", function () {
  this.timeout(15_000);

  const secret = "presence-integration-test-only";
  const clock = { clockTimestamp: Math.floor(Date.now() / 1000) };
  const jwt = new JwtService({ secret, verifyOptions: clock });
  const viewer = randomUUID();
  const friend = randomUUID();
  const stranger = randomUUID();
  const apps: INestApplication[] = [];
  const redisClients: RedisClientType[] = [];
  const sockets: Socket[] = [];
  let redis: RedisClientType;
  let userApp: INestApplication;
  let gatewayUrls: string[];
  let originalJwtSecret: string | undefined;

  async function connectToRedis(): Promise<RedisClientType> {
    const client = createClient({ url: redisUrl, RESP: 2 });
    redisClients.push(client);
    await client.connect();
    return client;
  }

  async function startGateway(): Promise<string> {
    const [pub, sub] = await Promise.all([connectToRedis(), connectToRedis()]);
    const module = await Test.createTestingModule({
      providers: [
        PresenceGateway,
        { provide: JwtService, useValue: jwt },
        {
          provide: RedisService,
          useValue: new RedisService(
            new ConfigService({ REDIS_URL: redisUrl }),
          ),
        },
        {
          provide: "PresenceRepository",
          useClass: RedisPresenceRepository,
        },
        { provide: "KAFKA_SERVICE", useValue: { emit: sinon.stub() } },
      ],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    apps.push(app);
    app.useWebSocketAdapter(
      new (class extends IoAdapter {
        override createIOServer(port: number, options?: ServerOptions) {
          const server = super.createIOServer(port, options);
          server.adapter(createAdapter(pub, sub));
          return server;
        }
      })(app),
    );
    await app.listen(0, "127.0.0.1");
    return app.getUrl();
  }

  before(async () => {
    originalJwtSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = secret;
    redis = await connectToRedis();
    gatewayUrls = await Promise.all([startGateway(), startGateway()]);
    const module = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        JwtStrategy,
        GetFriendsPresenceUseCase,
        {
          provide: PrismaService,
          useValue: {
            userProfile: { findUnique: async () => ({ id: viewer }) },
          },
        },
        {
          provide: "FriendshipRepository",
          useValue: {
            findByUserId: async (userId: string, ids: string[]) =>
              userId === viewer && ids.includes(friend)
                ? [{ userId1: friend, userId2: viewer }]
                : [],
          },
        },
        {
          provide: "PresenceRepository",
          useValue: new UserPresenceRepository(
            new ConfigService({ REDIS_URL: redisUrl }),
          ),
        },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    userApp = module.createNestApplication({ logger: false });
    apps.push(userApp);
    userApp.use(cookieParser());
    userApp.setGlobalPrefix("api/v1");
    await userApp.init();
  });

  after(async () => {
    for (const socket of sockets) socket.disconnect();
    for (const app of apps) await app.close();
    if (redis?.isReady)
      await redis.del([
        presenceKey(viewer),
        presenceKey(friend),
        `presence:${friend}`,
      ]);
    for (const client of redisClients) {
      if (client.isOpen) client.destroy();
    }
    if (originalJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalJwtSecret;
  });

  function token(userId: string): string {
    return jwt.sign(
      { sub: userId, iat: clock.clockTimestamp },
      { expiresIn: "15m" },
    );
  }

  async function connect(url: string, userId: string): Promise<Socket> {
    const socket = io(`${url}/presence`, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
      extraHeaders: { Cookie: `access_token=${token(userId)}` },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  }

  async function expectSocketCount(
    expected: number,
    timeoutMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await redis.zCard(presenceKey(friend))) === expected) return;
      await delay(20);
    }
    expect(await redis.zCard(presenceKey(friend))).to.equal(expected);
  }

  function snapshot() {
    return supertest(userApp.getHttpServer())
      .get("/api/v1/friends/presence")
      .query({ ids: `${friend},${stranger}` })
      .set("Cookie", `access_token=${token(viewer)}`);
  }

  it("cleans up an expired handshake only after the last tab disconnects across replicas", async () => {
    await redis.set(`presence:${friend}`, "ONLINE");
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: false },
    ]);

    const observer = await connect(gatewayUrls[0], viewer);
    const events: UserPresenceUpdatedEventV1[] = [];
    observer.on("presence.updated", (event: UserPresenceUpdatedEventV1) => {
      if (event.userId === friend) events.push(event);
    });
    const first = await connect(gatewayUrls[0], friend);
    const second = await connect(gatewayUrls[1], friend);
    await expectSocketCount(2);
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: true },
    ]);

    clock.clockTimestamp += 901;
    first.disconnect();
    await expectSocketCount(1);
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: true },
    ]);

    const offlineEvent = new Promise<UserPresenceUpdatedEventV1>((resolve) => {
      observer.once("presence.updated", resolve);
    });
    second.io.engine.transport.close();
    expect(await offlineEvent).to.deep.equal({
      userId: friend,
      status: PresenceStatus.OFFLINE,
    });
    expect(events.map(({ status }) => status)).to.deep.equal([
      PresenceStatus.ONLINE,
      PresenceStatus.OFFLINE,
    ]);
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: false },
    ]);
  });

  it("expires a lease without a disconnect and rejects unauthorized lookups", async () => {
    const repo = apps[0].get<RedisPresenceRepository>("PresenceRepository");
    expect(await repo.touchSocket(friend, "orphaned-socket")).to.equal(true);
    expect(await redis.pTTL(presenceKey(friend))).to.be.within(85_000, 90_000);
    expect(await repo.getStatus(friend)).to.equal(PresenceStatus.ONLINE);

    await redis.pExpire(presenceKey(friend), 10);
    await expectSocketCount(0);
    expect(await repo.getStatus(friend)).to.equal(PresenceStatus.OFFLINE);
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: false },
    ]);

    await supertest(userApp.getHttpServer())
      .get("/api/v1/friends/presence")
      .query({ ids: friend })
      .expect(401);
    await supertest(userApp.getHttpServer())
      .get("/api/v1/friends/presence")
      .query({ ids: `${friend},` })
      .set("Cookie", `access_token=${token(viewer)}`)
      .expect(400);
  });

  it("re-registers a still-connected socket when it renews an expired lease", async function () {
    this.timeout(35_000);
    const socket = await connect(gatewayUrls[0], friend);
    await expectSocketCount(1);

    await redis.pExpire(presenceKey(friend), 10);
    await expectSocketCount(0);
    await expectSocketCount(1, 32_000);

    expect(await redis.pTTL(presenceKey(friend))).to.be.within(85_000, 90_000);
    expect((await snapshot().expect(200)).body).to.deep.equal([
      { id: friend, isOnline: true },
    ]);

    socket.disconnect();
    await expectSocketCount(0);
  });
});
