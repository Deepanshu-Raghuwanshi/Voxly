import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PersonaId } from "@shared-utils";
import {
  PersonaMessageRepository,
  PersonaMessageDoc,
} from "../../../application/ports/persona-message.repository";
import { PersonaMessage } from "./schemas/persona-message.schema";

@Injectable()
export class MongoosePersonaMessageRepository implements PersonaMessageRepository {
  constructor(
    @InjectModel(PersonaMessage.name)
    private readonly model: Model<PersonaMessage>,
  ) {}

  async save(
    doc: Omit<PersonaMessageDoc, "id" | "createdAt">,
  ): Promise<PersonaMessageDoc> {
    const saved = await this.model.create(doc);
    return this.toDoc(saved);
  }

  async findByUserAndPersona(
    userId: string,
    personaId: PersonaId,
    limit: number,
  ): Promise<PersonaMessageDoc[]> {
    // Sort DESC to get last N, then reverse for chronological (oldest-first) display.
    // The compound index { userId: 1, personaId: 1, createdAt: -1 } covers this query exactly.
    const docs = await this.model
      .find({ userId, personaId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.reverse().map((d) => this.toDoc(d as PersonaMessage));
  }

  async deleteByUserAndPersona(
    userId: string,
    personaId: PersonaId,
  ): Promise<number> {
    const result = await this.model.deleteMany({ userId, personaId }).exec();
    return result.deletedCount;
  }

  private toDoc(doc: PersonaMessage): PersonaMessageDoc {
    return {
      id: (doc._id as unknown as { toString(): string }).toString(),
      userId: doc.userId,
      personaId: doc.personaId as PersonaId,
      role: doc.role as "user" | "assistant",
      content: doc.content,
      toolUsed: doc.toolUsed ?? null,
      createdAt: doc.createdAt,
    };
  }
}
