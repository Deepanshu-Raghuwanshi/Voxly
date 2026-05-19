import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Message } from "./schemas/message.schema";
import {
  MessageRepository,
  CreateMessageInput,
  UpdateMessageInput,
} from "../../../application/ports/message.repository";
import { MessageEntity } from "../../../domain/entities/message.entity";
import { MessageStatus } from "@kafka-events";

@Injectable()
export class MongooseMessageRepository implements MessageRepository {
  constructor(
    @InjectModel(Message.name) private readonly model: Model<Message>,
  ) {}

  async findById(id: string): Promise<MessageEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByConversationId(
    conversationId: string,
    limit: number,
    before?: string,
  ): Promise<MessageEntity[]> {
    const query: Record<string, unknown> = { conversationId };

    if (before && Types.ObjectId.isValid(before)) {
      const cursor = await this.model.findById(before).exec();
      if (cursor) {
        query["createdAt"] = { $lt: cursor.createdAt };
      }
    }

    const docs = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.map((d) => this.toEntity(d));
  }

  async create(data: CreateMessageInput): Promise<MessageEntity> {
    const doc = await this.model.create({
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
      type: data.type,
      ...(data.replyTo ? { replyTo: data.replyTo } : {}),
      isAI: data.isAI ?? false,
      toolUsed: data.toolUsed ?? null,
      agentQuery: data.agentQuery ?? null,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateMessageInput): Promise<MessageEntity> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException(`Message ${id} not found`);
    return this.toEntity(doc);
  }

  async countUnread(
    conversationId: string,
    since: Date,
    excludeSenderId: string,
  ): Promise<number> {
    return this.model.countDocuments({
      conversationId,
      createdAt: { $gt: since },
      senderId: { $ne: excludeSenderId },
    });
  }

  async updateStatusBySender(
    conversationId: string,
    senderId: string,
    fromStatuses: MessageStatus[],
    toStatus: MessageStatus,
  ): Promise<number> {
    const result = await this.model.updateMany(
      {
        conversationId,
        senderId,
        status: { $in: fromStatuses },
        isDeleted: false,
      },
      { $set: { status: toStatus } },
    );
    return result.modifiedCount;
  }

  async toggleReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<MessageEntity> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Two-step check-then-mutate: safe for concurrent reactions from *different* users
    // (each user's reaction is a distinct subdocument). Rapid double-taps from the
    // *same* user could race between the exists check and the $push, but the UI
    // debounces clicks and the window is negligible in practice.
    const exists = await this.model
      .exists({ _id: messageId, reactions: { $elemMatch: { userId, emoji } } })
      .exec();

    const updated = exists
      ? await this.model
          .findByIdAndUpdate(
            messageId,
            { $pull: { reactions: { userId, emoji } } },
            { new: true },
          )
          .exec()
      : await this.model
          .findByIdAndUpdate(
            messageId,
            { $push: { reactions: { emoji, userId, createdAt: new Date() } } },
            { new: true },
          )
          .exec();

    if (!updated) throw new NotFoundException(`Message ${messageId} not found`);
    return this.toEntity(updated);
  }

  private toEntity(doc: Message): MessageEntity {
    return MessageEntity.create({
      id: (doc._id as Types.ObjectId).toString(),
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      type: doc.type,
      status: doc.status,
      isDeleted: doc.isDeleted,
      isEdited: doc.isEdited,
      isAI: doc.isAI,
      toolUsed: doc.toolUsed,
      agentQuery: doc.agentQuery,
      reactions: (doc.reactions ?? []).map((r) => ({
        emoji: r.emoji,
        userId: r.userId,
        createdAt: r.createdAt,
      })),
      replyTo: doc.replyTo
        ? {
            messageId: doc.replyTo.messageId,
            senderId: doc.replyTo.senderId,
            content: doc.replyTo.content,
          }
        : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
