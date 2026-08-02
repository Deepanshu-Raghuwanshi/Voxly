import { Injectable, Logger } from "@nestjs/common";
import {
  PersonaAgentPort,
  PersonaRunParams,
  PersonaAgentResult,
} from "../../application/ports/persona-agent.port";
import { PersonaGroqAgentService } from "./persona-groq-agent.service";
import { CerebrasPersonaAgentService } from "./cerebras-persona-agent.service";
import { runWithFallbackChain } from "./ai-provider-chain";
import { GROQ_TOOL_MODEL, CEREBRAS_MODEL } from "./ai-models";

@Injectable()
export class PersonaAgentFallbackService implements PersonaAgentPort {
  private readonly logger = new Logger(PersonaAgentFallbackService.name);

  constructor(
    private readonly groq: PersonaGroqAgentService,
    private readonly cerebras: CerebrasPersonaAgentService,
  ) {}

  async run(params: PersonaRunParams): Promise<PersonaAgentResult> {
    return runWithFallbackChain(
      [
        {
          name: "groq",
          model: GROQ_TOOL_MODEL,
          feature: "persona_agent",
          fn: () => this.groq.run(params),
        },
        {
          name: "cerebras",
          model: CEREBRAS_MODEL,
          feature: "persona_agent",
          fn: () => this.cerebras.run(params),
        },
      ],
      this.logger,
    );
  }
}
