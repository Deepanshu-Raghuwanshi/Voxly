import { Injectable, Inject } from "@nestjs/common";
import { ConversationEntity } from "../../domain/entities/conversation.entity";
import { ConversationParticipantRepository } from "../ports/conversation-participant.repository";
import { PresenceRepository } from "../ports/presence.repository";
import { MessageRepository } from "../ports/message.repository";
import {
  ConversationView,
  MessageView,
} from "../interfaces/conversation-view.interface";
import { PresenceStatus } from "@kafka-events";
import { toMessageView } from "../mappers/message.mapper";

@Injectable()
export class ConversationViewBuilder {
  constructor(
    @Inject("ConversationParticipantRepository")
    private readonly participantRepository: ConversationParticipantRepository,
    @Inject("PresenceRepository")
    private readonly presenceRepository: PresenceRepository,
    @Inject("MessageRepository")
    private readonly messageRepository: MessageRepository,
  ) {}

  async build(
    conversation: ConversationEntity,
    requesterId: string,
  ): Promise<ConversationView> {
    const participants = await this.participantRepository.findByConversationId(
      conversation.id,
    );
    const statuses = await this.presenceRepository.getStatuses(
      participants.map((p) => p.userId),
    );

    const requesterParticipant = participants.find(
      (p) => p.userId === requesterId,
    );
    const since = requesterParticipant?.lastReadAt ?? new Date(0);
    const unreadCount = await this.messageRepository.countUnread(
      conversation.id,
      since,
      requesterId,
    );

    const snapshot = conversation.lastMessage;
    let lastMessage: MessageView | undefined;

    if (snapshot) {
      const msg = await this.messageRepository.findById(snapshot.messageId);
      lastMessage = msg
        ? toMessageView(msg)
        : {
            id: snapshot.messageId,
            conversationId: conversation.id,
            senderId: snapshot.senderId,
            content: snapshot.content,
            type: "TEXT",
            status: "SENT",
            isDeleted: false,
            isEdited: false,
            isAI: false,
            reactions: [],
            createdAt: snapshot.sentAt.toISOString(),
            updatedAt: snapshot.sentAt.toISOString(),
          };
    }

    return {
      id: conversation.id,
      participants: participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        fullName: p.fullName,
        avatarUrl: p.avatarUrl,
        isOnline: statuses.get(p.userId) === PresenceStatus.ONLINE,
        lastReadAt: p.lastReadAt?.toISOString(),
      })),
      lastMessage,
      unreadCount,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }
}
