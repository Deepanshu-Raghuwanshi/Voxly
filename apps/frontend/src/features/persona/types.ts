import { PersonaId, PersonaConfig } from "@shared-utils";

export type { PersonaId, PersonaConfig };

export interface PersonaMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUsed: "web_search" | "direct" | null;
  createdAt: string;
}

export interface PersonaChatResponse {
  reply: string;
  personaId: PersonaId;
  toolUsed: "web_search" | "direct" | null;
}

export interface PersonaHistoryResponse {
  personaId: PersonaId;
  messages: PersonaMessageItem[];
}
