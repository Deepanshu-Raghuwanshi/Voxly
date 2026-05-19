import { Injectable, Logger } from "@nestjs/common";
import {
  AiAgentPort,
  AgentResult,
} from "../../application/ports/ai-agent.port";
import { GroqAgentService } from "./groq-agent.service";
import { CerebrasAgentService } from "./cerebras-agent.service";
import { runWithFallbackChain } from "./ai-provider-chain";

@Injectable()
export class AgentFallbackService implements AiAgentPort {
  private readonly logger = new Logger(AgentFallbackService.name);

  constructor(
    private readonly groq: GroqAgentService,
    private readonly cerebras: CerebrasAgentService,
  ) {}

  async run(
    query: string,
    context: Array<{ role: "me" | "them"; content: string }>,
    userId: string,
  ): Promise<AgentResult> {
    return runWithFallbackChain(
      [
        { name: "groq", fn: () => this.groq.run(query, context, userId) },
        {
          name: "cerebras",
          fn: () => this.cerebras.run(query, context, userId),
        },
      ],
      this.logger,
    );
  }
}
