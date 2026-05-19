import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ConversationRepository } from "../ports/conversation.repository";
import { ConversationParticipantRepository } from "../ports/conversation-participant.repository";
import { MessageRepository } from "../ports/message.repository";
import { AiSummarizerPort } from "../ports/ai-summarizer.port";

export interface SummarizeConversationInput {
  userId: string;
  conversationId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;

@Injectable()
export class SummarizeConversationUseCase {
  constructor(
    @Inject("ConversationRepository")
    private readonly conversationRepository: ConversationRepository,
    @Inject("ConversationParticipantRepository")
    private readonly participantRepository: ConversationParticipantRepository,
    @Inject("MessageRepository")
    private readonly messageRepository: MessageRepository,
    @Inject("AiSummarizer")
    private readonly aiSummarizer: AiSummarizerPort,
  ) {}

  async execute(
    input: SummarizeConversationInput,
  ): Promise<{ summary: string }> {
    const limit = input.limit ?? DEFAULT_LIMIT;

    const conversation = await this.conversationRepository.findById(
      input.conversationId,
    );
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const participant =
      await this.participantRepository.findByConversationAndUser(
        input.conversationId,
        input.userId,
      );
    if (!participant) {
      throw new ForbiddenException(
        "You are not a participant in this conversation",
      );
    }

    const raw = await this.messageRepository.findByConversationId(
      input.conversationId,
      limit,
    );

    const messages = raw.filter((m) => !m.isDeleted && !m.isAI);

    if (messages.length === 0) {
      throw new BadRequestException("No messages to summarize");
    }

    const formatted = [...messages].reverse().map((m) => ({
      role: m.senderId === input.userId ? ("me" as const) : ("them" as const),
      content: m.content,
    }));

    const summary = await this.aiSummarizer.summarize(formatted);
    return { summary };
  }
}
