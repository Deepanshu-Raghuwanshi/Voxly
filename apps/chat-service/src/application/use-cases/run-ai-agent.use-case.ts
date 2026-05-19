import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConversationRepository } from "../ports/conversation.repository";
import { ConversationParticipantRepository } from "../ports/conversation-participant.repository";
import { MessageRepository } from "../ports/message.repository";
import { AiAgentPort, AgentResult } from "../ports/ai-agent.port";
import { AgentRateLimiterService } from "../../infrastructure/ai/agent-rate-limiter.service";
import { PresenceGateway } from "../../interfaces/gateways/presence.gateway";
import { toMessageView } from "../mappers/message.mapper";
import { MessageView } from "../interfaces/conversation-view.interface";

export interface RunAiAgentInput {
  userId: string;
  conversationId: string;
  message: string;
}

export class BlockedException extends HttpException {
  constructor(payload: { blocked: true; category: string; message: string }) {
    super(payload, HttpStatus.BAD_REQUEST);
  }
}

export class RateLimitedByAgentException extends HttpException {
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
    "what is your key",
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
  identity: [
    "who are you",
    "what are you",
    "tell me about yourself",
    "what can you do",
    "your system prompt",
    "your instructions",
  ],
};

const BLOCKED_RESPONSES: Record<string, string> = {
  injection: "⚠️ That kind of instruction isn't something I can follow.",
  credentials: "🔒 I don't have access to any keys or credentials.",
  codeGen:
    "🛠️ I can search, check weather, summarize URLs and translate. I can't write code.",
  identity:
    "🤖 I'm your in-chat AI assistant. Ask me to search the web, check weather, summarize a URL, or translate something!",
  too_long: "✂️ Your message is too long. Keep it under 500 characters.",
  empty: "💬 What would you like help with? Try: @AI weather in Mumbai",
};

function validateAgentQuery(message: string): {
  valid: boolean;
  category?: string;
  response?: string;
} {
  const lower = message.toLowerCase().trim();
  if (!lower)
    return {
      valid: false,
      category: "empty",
      response: BLOCKED_RESPONSES.empty,
    };
  if (lower.length > 500)
    return {
      valid: false,
      category: "too_long",
      response: BLOCKED_RESPONSES.too_long,
    };
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    if (patterns.some((p) => lower.includes(p))) {
      return { valid: false, category, response: BLOCKED_RESPONSES[category] };
    }
  }
  return { valid: true };
}

@Injectable()
export class RunAiAgentUseCase {
  private readonly logger = new Logger(RunAiAgentUseCase.name);

  constructor(
    @Inject("ConversationRepository")
    private readonly conversationRepository: ConversationRepository,
    @Inject("ConversationParticipantRepository")
    private readonly participantRepository: ConversationParticipantRepository,
    @Inject("MessageRepository")
    private readonly messageRepository: MessageRepository,
    @Inject("AiAgent")
    private readonly aiAgent: AiAgentPort,
    private readonly agentRateLimiter: AgentRateLimiterService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  async execute(input: RunAiAgentInput): Promise<{ message: MessageView }> {
    const { userId, conversationId, message } = input;

    // 1. Normalize and strip @AI prefix
    const cleanQuery = message
      .normalize("NFKC")
      .replace(/^@ai\s*/i, "")
      .trim();

    // 2. Validate first (before rate limit so abusive queries don't consume slot)
    const validation = validateAgentQuery(cleanQuery);
    if (!validation.valid) {
      this.logger.log(
        `[AGENT BLOCKED] userId: ${userId} | category: ${validation.category} | query: ${cleanQuery}`,
      );
      throw new BlockedException({
        blocked: true,
        category: validation.category!,
        message: validation.response!,
      });
    }

    // 3. Rate limit check
    const rateCheck = this.agentRateLimiter.check(userId);
    if (!rateCheck.allowed) {
      throw new RateLimitedByAgentException({
        rateLimited: true,
        secondsRemaining: rateCheck.secondsRemaining!,
        message: `Slow down! Try again in ${rateCheck.secondsRemaining} seconds ⏳`,
      });
    }

    // 4. Conversation existence check
    const conversation =
      await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // 5. Participant check
    const participant =
      await this.participantRepository.findByConversationAndUser(
        conversationId,
        userId,
      );
    if (!participant) {
      throw new ForbiddenException(
        "You are not a participant in this conversation",
      );
    }

    // 6. Emit AI typing indicator
    this.presenceGateway.emitToRoom(
      `conversation:${conversationId}`,
      "typing.started",
      { conversationId, userId: "AI" },
    );

    // 7. Fetch last 6 non-deleted messages as context
    const rawMessages = await this.messageRepository.findByConversationId(
      conversationId,
      6,
    );
    const contextMessages = [...rawMessages]
      .reverse()
      .filter((m) => !m.isDeleted)
      .map((m) => ({
        role: m.senderId === userId ? ("me" as const) : ("them" as const),
        content: m.content,
      }));

    // 8. Run agent
    let agentResult: AgentResult;
    try {
      agentResult = await this.aiAgent.run(cleanQuery, contextMessages, userId);
    } catch (err) {
      this.presenceGateway.emitToRoom(
        `conversation:${conversationId}`,
        "typing.stopped",
        { conversationId, userId: "AI" },
      );
      this.logger.error(
        `[AGENT] run failed | userId=${userId} | query="${cleanQuery}" | ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        "AI is unavailable right now, try again shortly",
      );
    }

    // 9–11. Persist message, stop typing, broadcast — finally guarantees typing.stopped even on DB failure
    let messageView: MessageView;
    try {
      const savedMessage = await this.messageRepository.create({
        conversationId,
        senderId: userId,
        content: agentResult.reply,
        type: "TEXT",
        isAI: true,
        toolUsed: agentResult.toolUsed,
        agentQuery: cleanQuery,
      });
      messageView = toMessageView(savedMessage);
    } finally {
      this.presenceGateway.emitToRoom(
        `conversation:${conversationId}`,
        "typing.stopped",
        { conversationId, userId: "AI" },
      );
    }

    this.presenceGateway.emitToRoom(
      `conversation:${conversationId}`,
      "ai.message.new",
      messageView,
    );

    return { message: messageView };
  }
}
