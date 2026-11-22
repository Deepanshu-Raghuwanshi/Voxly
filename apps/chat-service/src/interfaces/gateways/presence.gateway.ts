import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { Inject, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";
import { JwtService } from "@nestjs/jwt";
import { PresenceRepository } from "../../application/ports/presence.repository";
import {
  UserTopics,
  PresenceStatus,
  UserPresenceUpdatedEventV1,
} from "@kafka-events";

const PRESENCE_RENEWAL_MS = 30_000;

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
  namespace: "presence",
})
export class PresenceGateway
  implements
    OnGatewayInit<Namespace>,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(PresenceGateway.name);
  private readonly presenceSockets = new Map<string, string>();
  private renewalTimer?: ReturnType<typeof setInterval>;
  private renewing = false;

  @WebSocketServer()
  server!: Namespace;

  constructor(
    @Inject("PresenceRepository")
    private readonly presenceRepository: PresenceRepository,
    @Inject("KAFKA_SERVICE")
    private readonly kafkaClient: ClientKafka,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((client, next) => {
      const userId = this.getUserId(client);
      if (!userId) {
        next(new Error("Unauthorized"));
        return;
      }
      client.data.presenceUserId = userId;
      next();
    });
  }

  onModuleInit(): void {
    this.renewalTimer = setInterval(() => {
      void this.renewPresence();
    }, PRESENCE_RENEWAL_MS).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.renewalTimer);
    this.presenceSockets.clear();
  }

  async handleConnection(client: Socket) {
    const userId: string | undefined = client.data.presenceUserId;
    if (!userId) return;

    await client.join(`user:${userId}`);
    if (!client.connected) return;

    this.presenceSockets.set(client.id, userId);
    await this.touchPresence(userId, client.id);
  }

  async handleDisconnect(client: Socket) {
    const userId = this.presenceSockets.get(client.id);
    if (!userId) return;

    this.presenceSockets.delete(client.id);
    try {
      if (await this.presenceRepository.removeSocket(userId, client.id)) {
        this.publishPresence(userId, PresenceStatus.OFFLINE);
      }
    } catch (error) {
      this.logger.warn(
        `Could not remove presence for socket ${client.id}: ${error}`,
      );
    }
  }

  private async touchPresence(userId: string, socketId: string): Promise<void> {
    try {
      const becameOnline = await this.presenceRepository.touchSocket(
        userId,
        socketId,
      );
      if (becameOnline) {
        this.publishPresence(userId, PresenceStatus.ONLINE);
      }
    } catch (error) {
      this.logger.warn(
        `Could not renew presence for socket ${socketId}: ${error}`,
      );
    }
  }

  private async renewPresence(): Promise<void> {
    if (this.renewing) return;

    this.renewing = true;
    try {
      // Queue all renewals on the same Redis connection before yielding.
      // A disconnect removes the socket locally first and queues removal
      // after any already queued renewal.
      await Promise.all(
        Array.from(this.presenceSockets, ([socketId, userId]) =>
          this.touchPresence(userId, socketId),
        ),
      );
    } finally {
      this.renewing = false;
    }
  }

  private publishPresence(userId: string, status: PresenceStatus): void {
    const event: UserPresenceUpdatedEventV1 = { userId, status };
    this.server.emit("presence.updated", event);
    this.kafkaClient.emit(UserTopics.USER_PRESENCE_UPDATED, event);
  }

  @SubscribeMessage("join.conversation")
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    const userId = this.getUserId(client);
    if (!userId || !data?.conversationId) return;
    await client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage("typing.start")
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): void {
    const userId = this.getUserId(client);
    if (!userId || !data?.conversationId) return;
    client.to(`conversation:${data.conversationId}`).emit("typing.started", {
      conversationId: data.conversationId,
      userId,
    });
  }

  @SubscribeMessage("typing.stop")
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): void {
    const userId = this.getUserId(client);
    if (!userId || !data?.conversationId) return;
    client.to(`conversation:${data.conversationId}`).emit("typing.stopped", {
      conversationId: data.conversationId,
      userId,
    });
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }

  private getUserId(client: Socket): string | null {
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    // Try to get from cookie if available
    let accessToken = token;
    if (!accessToken) {
      const cookies = client.handshake.headers.cookie;
      if (cookies) {
        const match = cookies.match(/access_token=([^;]+)/);
        if (match) accessToken = match[1];
      }
    }

    // Allow direct userId override only in non-production environments for debugging
    const directUserId = client.handshake.query?.userId;
    if (
      process.env.NODE_ENV !== "production" &&
      typeof directUserId === "string" &&
      directUserId
    )
      return directUserId;

    if (!accessToken) return null;

    try {
      const payload = this.jwtService.verify(accessToken);
      return typeof payload.sub === "string" && payload.sub
        ? payload.sub
        : null;
    } catch (e) {
      this.logger.error(`Invalid token for presence gateway: ${e}`);
      return null;
    }
  }
}
