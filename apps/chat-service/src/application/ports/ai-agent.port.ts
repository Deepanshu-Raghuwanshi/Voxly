export type AgentTool =
  | "web_search"
  | "get_weather"
  | "summarize_url"
  | "translate"
  | "direct";

export interface AgentResult {
  reply: string;
  toolUsed: AgentTool;
}

export interface AiAgentPort {
  run(
    query: string,
    context: Array<{ role: "me" | "them"; content: string }>,
    userId: string,
  ): Promise<AgentResult>;
}
