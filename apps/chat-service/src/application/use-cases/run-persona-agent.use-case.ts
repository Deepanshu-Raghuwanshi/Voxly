import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PERSONAS, PersonaId, isValidPersonaId } from "@shared-utils";
import { PersonaMessageRepository } from "../ports/persona-message.repository";
import { PersonaRateLimiterService } from "../../infrastructure/ai/persona-rate-limiter.service";
import { PersonaGroqAgentService } from "../../infrastructure/ai/persona-groq-agent.service";

export interface RunPersonaAgentInput {
  userId: string;
  personaId: string;
  message: string;
}

export class PersonaBlockedException extends HttpException {
  constructor(payload: { blocked: true; category: string; message: string }) {
    super(payload, HttpStatus.BAD_REQUEST);
  }
}

export class PersonaRateLimitedException extends HttpException {
  constructor(payload: {
    rateLimited: true;
    secondsRemaining: number;
    message: string;
  }) {
    super(payload, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const BLOCKED_PATTERNS: Record<string, string[]> = {
  injection: [
    "ignore previous",
    "ignore your system",
    "you are now",
    "act as",
    "pretend you are",
    "jailbreak",
    "dan mode",
    "developer mode",
    "override",
    "disregard your",
    "forget everything",
    "new persona",
  ],
  credentials: [
    "api key",
    "secret key",
    "password",
    "env variable",
    "credentials",
    "access token",
    "private key",
    "give me your",
    "show me your",
  ],
  codeGen: [
    "build me",
    "build this",
    "write me a",
    "write code",
    "create an app",
    "generate code",
    "make me a",
    "develop a",
    "code for",
    "write a function",
    "write a script",
    "write a program",
  ],
};

const BLOCKED_RESPONSES: Record<string, string> = {
  injection: "⚠️ That kind of instruction isn't something I can follow.",
  credentials: "🔒 I don't share or reveal any keys or credentials.",
  codeGen:
    "🛠️ I can answer questions and search the web, but I don't write code.",
  too_long: "✂️ Your message is too long. Please keep it under 600 characters.",
  empty: "💬 Please type a message to get started.",
};

function validatePersonaQuery(
  message: string,
  personaId: PersonaId,
): { valid: boolean; category?: string; response?: string } {
  const lower = message.toLowerCase().trim();
  if (!lower) {
    return {
      valid: false,
      category: "empty",
      response: BLOCKED_RESPONSES["empty"],
    };
  }
  if (lower.length > 600) {
    return {
      valid: false,
      category: "too_long",
      response: BLOCKED_RESPONSES["too_long"],
    };
  }
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    // Sage may discuss coding concepts; block code generation only for other personas
    if (category === "codeGen" && personaId === "sage") continue;
    if (patterns.some((p) => lower.includes(p))) {
      return {
        valid: false,
        category,
        response: BLOCKED_RESPONSES[category],
      };
    }
  }
  return { valid: true };
}

@Injectable()
export class RunPersonaAgentUseCase {
  private readonly logger = new Logger(RunPersonaAgentUseCase.name);

  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
    private readonly personaRateLimiter: PersonaRateLimiterService,
    private readonly personaGroqAgent: PersonaGroqAgentService,
  ) {}

  async execute(
    input: RunPersonaAgentInput,
  ): Promise<{ reply: string; personaId: PersonaId; toolUsed: string | null }> {
    const { userId, message } = input;

    // 1. Validate personaId
    if (!isValidPersonaId(input.personaId)) {
      throw new PersonaBlockedException({
        blocked: true,
        category: "invalid_persona",
        message: `Unknown persona: ${input.personaId}`,
      });
    }
    const personaId = input.personaId;
    const persona = PERSONAS[personaId];

    // 2. Validate message before consuming a rate-limit slot
    const validation = validatePersonaQuery(message, personaId);
    if (!validation.valid) {
      this.logger.log(
        `[PERSONA BLOCKED] userId=${userId} personaId=${personaId} category=${validation.category}`,
      );
      throw new PersonaBlockedException({
        blocked: true,
        category: validation.category!,
        message: validation.response!,
      });
    }

    // 3. Rate limit check
    const rateCheck = this.personaRateLimiter.check(userId);
    if (!rateCheck.allowed) {
      const msg =
        rateCheck.reason === "hourly"
          ? `You've reached the hourly limit. Come back in ${Math.ceil(rateCheck.secondsRemaining! / 60)} minutes ⏳`
          : `Slow down! Try again in ${rateCheck.secondsRemaining} seconds ⏳`;
      throw new PersonaRateLimitedException({
        rateLimited: true,
        secondsRemaining: rateCheck.secondsRemaining!,
        message: msg,
      });
    }

    // 4. Fetch last 8 messages as LLM context (oldest-first)
    const history = await this.personaMessageRepo.findByUserAndPersona(
      userId,
      personaId,
      8,
    );
    const context = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 5. Persist user message
    await this.personaMessageRepo.save({
      userId,
      personaId,
      role: "user",
      content: message,
      toolUsed: null,
    });

    // 6. Run persona agent
    let agentResult: { reply: string; toolUsed: "web_search" | "direct" };
    try {
      agentResult = await this.personaGroqAgent.run({
        query: message,
        context,
        userId,
        systemPrompt: persona.systemPrompt,
        useWebSearch: persona.useWebSearch,
      });
    } catch (err) {
      this.logger.error(
        `[PERSONA AGENT] run failed | userId=${userId} personaId=${personaId} | ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        `${persona.name} is unavailable right now, try again in a moment`,
      );
    }

    // 7. Persist AI reply
    await this.personaMessageRepo.save({
      userId,
      personaId,
      role: "assistant",
      content: agentResult.reply,
      toolUsed: agentResult.toolUsed,
    });

    return {
      reply: agentResult.reply,
      personaId,
      toolUsed: agentResult.toolUsed,
    };
  }
}
