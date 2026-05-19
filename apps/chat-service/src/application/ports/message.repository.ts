import { MessageEntity } from "../../domain/entities/message.entity";
import { MessageStatus } from "@kafka-events";

export interface ReplyToInput {
  messageId: string;
  senderId: string;
  content: string;
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  replyTo?: ReplyToInput;
  isAI?: boolean;
  toolUsed?: string;
  agentQuery?: string;
}

export interface UpdateMessageInput {
  content?: string;
  isDeleted?: boolean;
  isEdited?: boolean;
  status?: string;
}

export interface MessageRepository {
  findById(id: string): Promise<MessageEntity | null>;
  findByConversationId(
    conversationId: string,
    limit: number,
    before?: string,
  ): Promise<MessageEntity[]>;
  create(data: CreateMessageInput): Promise<MessageEntity>;
  update(id: string, data: UpdateMessageInput): Promise<MessageEntity>;
  countUnread(
    conversationId: string,
    since: Date,
    excludeSenderId: string,
  ): Promise<number>;
  updateStatusBySender(
    conversationId: string,
    senderId: string,
    fromStatuses: MessageStatus[],
    toStatus: MessageStatus,
  ): Promise<number>;
  toggleReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<MessageEntity>;
}
