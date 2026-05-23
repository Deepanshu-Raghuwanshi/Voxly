import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class PersonaMessage extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ["nova", "atlas", "lex", "sage", "pulse"] })
  personaId!: string;

  @Prop({ required: true, enum: ["user", "assistant"] })
  role!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: String, default: null })
  toolUsed?: string | null;

  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const PersonaMessageSchema =
  SchemaFactory.createForClass(PersonaMessage);

// Compound index: all queries filter on userId + personaId + sort by createdAt DESC.
PersonaMessageSchema.index({ userId: 1, personaId: 1, createdAt: -1 });
