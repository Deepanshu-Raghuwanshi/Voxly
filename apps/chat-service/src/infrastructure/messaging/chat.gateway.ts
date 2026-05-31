import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Kafka, Consumer } from "kafkajs";
import { ConfigService } from "@nestjs/config";
import { PresenceGateway } from "../../interfaces/gateways/presence.gateway";
import {
  ChatTopics,
  FriendTopics,
  FriendRemovedEventV1,
  FriendRequestSentEventV1,
  FriendRequestAcceptedEventV1,
  MessageSentEventV1,
  MessageDeliveredEventV1,
  MessageEditedEventV1,
  MessageDeletedEventV1,
  MessageReadEventV1,
  MessageReactionToggledEventV1,
} from "@kafka-events";

@Injectable()
export class ChatGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatGateway.name);
  private consumer: Consumer;

  constructor(
    private readonly configService: ConfigService,
    private readonly presenceGateway: PresenceGateway,
  ) {
    const kafka = new Kafka({
      clientId: "chat-service-gateway",
      brokers: (
        this.configService.get<string>("KAFKA_BROKERS") || "localhost:9092"
      ).split(","),
    });
    this.consumer = kafka.consumer({ groupId: "chat-gateway-consumer" });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        ChatTopics.MESSAGE_SENT,
        ChatTopics.MESSAGE_DELIVERED,
        ChatTopics.MESSAGE_EDITED,
        ChatTopics.MESSAGE_DELETED,
        ChatTopics.MESSAGE_READ,
        ChatTopics.MESSAGE_REACTION_TOGGLED,
        FriendTopics.FRIEND_REMOVED,
        FriendTopics.FRIEND_REQUEST_SENT,
        FriendTopics.FRIEND_REQUEST_ACCEPTED,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() ?? "{}");
          this.fanOut(topic, payload);
        } catch (err) {
          this.logger.error(
            `Error processing chat event on topic ${topic}`,
            err,
          );
        }
      },
    });

    this.logger.log("ChatGateway Kafka consumer started");
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private fanOut(topic: string, payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;

    if (topic === ChatTopics.MESSAGE_SENT) {
      if (!p.senderId || !p.receiverId) return;
      const event = p as unknown as MessageSentEventV1;
      this.presenceGateway.emitToRoom(
        `user:${event.receiverId}`,
        "message.new",
        event,
      );
      this.presenceGateway.emitToRoom(
        `user:${event.senderId}`,
        "message.new",
        event,
      );
    } else if (topic === ChatTopics.MESSAGE_EDITED) {
      if (!p.conversationId) return;
      const event = p as unknown as MessageEditedEventV1;
      this.presenceGateway.emitToRoom(
        `conversation:${event.conversationId}`,
        "message.updated",
        event,
      );
    } else if (topic === ChatTopics.MESSAGE_DELETED) {
      if (!p.conversationId) return;
      const event = p as unknown as MessageDeletedEventV1;
      this.presenceGateway.emitToRoom(
        `conversation:${event.conversationId}`,
        "message.deleted",
        event,
      );
    } else if (topic === ChatTopics.MESSAGE_DELIVERED) {
      if (!p.senderId) return;
      const event = p as unknown as MessageDeliveredEventV1;
      this.presenceGateway.emitToRoom(
        `user:${event.senderId}`,
        "message.delivered",
        event,
      );
    } else if (topic === ChatTopics.MESSAGE_READ) {
      if (!p.senderId) return;
      const event = p as unknown as MessageReadEventV1;
      this.presenceGateway.emitToRoom(
        `user:${event.senderId}`,
        "message.read",
        event,
      );
    } else if (topic === ChatTopics.MESSAGE_REACTION_TOGGLED) {
      if (!p.conversationId) return;
      const event = p as unknown as MessageReactionToggledEventV1;
      this.presenceGateway.emitToRoom(
        `conversation:${event.conversationId}`,
        "message.reaction",
        event,
      );
    } else if (topic === FriendTopics.FRIEND_REMOVED) {
      if (!p.userId || !p.friendId) return;
      const event = p as unknown as FriendRemovedEventV1;
      // Notify both sides so each user's conversation list updates in real-time.
      this.presenceGateway.emitToRoom(
        `user:${event.userId}`,
        "friendship.removed",
        event,
      );
      this.presenceGateway.emitToRoom(
        `user:${event.friendId}`,
        "friendship.removed",
        event,
      );
    } else if (topic === FriendTopics.FRIEND_REQUEST_SENT) {
      if (!p.receiverId) return;
      const event = p as unknown as FriendRequestSentEventV1;
      this.presenceGateway.emitToRoom(
        `user:${event.receiverId}`,
        "friend.request.received",
        event,
      );
    } else if (topic === FriendTopics.FRIEND_REQUEST_ACCEPTED) {
      if (!p.senderId || !p.receiverId) return;
      const event = p as unknown as FriendRequestAcceptedEventV1;
      this.presenceGateway.emitToRoom(
        `user:${event.senderId}`,
        "friend.request.accepted",
        event,
      );
      this.presenceGateway.emitToRoom(
        `user:${event.receiverId}`,
        "friend.request.accepted",
        event,
      );
    }
  }
}
