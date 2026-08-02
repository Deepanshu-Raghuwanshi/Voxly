export interface PersonaRunParams {
  query: string;
  context: Array<{ role: "user" | "assistant"; content: string }>;
  userId: string;
  systemPrompt: string;
  useWebSearch: boolean;
}

export interface PersonaAgentResult {
  reply: string;
  toolUsed: "web_search" | "direct";
}

export interface PersonaAgentPort {
  run(params: PersonaRunParams): Promise<PersonaAgentResult>;
}
