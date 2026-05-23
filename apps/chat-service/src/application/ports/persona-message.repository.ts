import { PersonaId } from "@shared-utils";

export interface PersonaMessageDoc {
  id: string;
  userId: string;
  personaId: PersonaId;
  role: "user" | "assistant";
  content: string;
  toolUsed: string | null;
  createdAt: Date;
}

export interface PersonaMessageRepository {
  save(
    doc: Omit<PersonaMessageDoc, "id" | "createdAt">,
  ): Promise<PersonaMessageDoc>;
  findByUserAndPersona(
    userId: string,
    personaId: PersonaId,
    limit: number,
  ): Promise<PersonaMessageDoc[]>;
  deleteByUserAndPersona(userId: string, personaId: PersonaId): Promise<number>;
}
