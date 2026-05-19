import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RequestWithUser } from "../request-with-user.interface";
import { JwtAuthGuard } from "../../infrastructure/guards/jwt-auth.guard";
import { UserThrottlerGuard } from "../../infrastructure/guards/user-throttler.guard";
import { RewriteMessageUseCase } from "../../application/use-cases/rewrite-message.use-case";
import { GenerateSmartRepliesUseCase } from "../../application/use-cases/generate-smart-replies.use-case";
import { SummarizeConversationUseCase } from "../../application/use-cases/summarize-conversation.use-case";
import { RunAiAgentUseCase } from "../../application/use-cases/run-ai-agent.use-case";
import { AiRewriteDto } from "../../application/dto/ai-rewrite.dto";
import { AiSmartReplyDto } from "../../application/dto/ai-smart-reply.dto";
import { AiSummarizeDto } from "../../application/dto/ai-summarize.dto";
import { AiAgentDto } from "../../application/dto/ai-agent.dto";
import { MessageView } from "../../application/interfaces/conversation-view.interface";

@ApiTags("AI")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 15, ttl: 60_000 } })
@Controller("chat/ai")
export class AiController {
  constructor(
    private readonly rewriteMessage: RewriteMessageUseCase,
    private readonly generateSmartReplies: GenerateSmartRepliesUseCase,
    private readonly summarizeConversation: SummarizeConversationUseCase,
    private readonly runAiAgent: RunAiAgentUseCase,
  ) {}

  @Post("rewrite")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rewrite a draft message using Gemini AI" })
  @ApiBody({ type: AiRewriteDto })
  @ApiResponse({
    status: 200,
    description: "Rewritten text",
    schema: { properties: { rewrittenText: { type: "string" } } },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request (empty text or unknown tone)",
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({
    status: 429,
    description: "Rate limit exceeded (15 RPM per user)",
  })
  @ApiResponse({
    status: 503,
    description: "AI provider unavailable or timed out",
  })
  async rewrite(
    @Req() req: RequestWithUser,
    @Body() dto: AiRewriteDto,
  ): Promise<{ rewrittenText: string }> {
    return this.rewriteMessage.execute({
      userId: req.user.id,
      text: dto.text,
      tone: dto.tone,
    });
  }

  @Post("smart-replies")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Generate 3 smart reply suggestions for the last received message",
  })
  @ApiBody({ type: AiSmartReplyDto })
  @ApiResponse({
    status: 200,
    description: "Three suggested replies",
    schema: {
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 3,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Invalid request" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({
    status: 429,
    description: "Rate limit exceeded (15 RPM per user)",
  })
  @ApiResponse({
    status: 503,
    description: "AI provider unavailable or timed out",
  })
  async smartReplies(
    @Req() req: RequestWithUser,
    @Body() dto: AiSmartReplyDto,
  ): Promise<{ suggestions: string[] }> {
    return this.generateSmartReplies.execute({
      userId: req.user.id,
      messages: dto.messages,
    });
  }

  @Post("summarize")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Summarize the recent message history of a conversation",
  })
  @ApiBody({ type: AiSummarizeDto })
  @ApiResponse({
    status: 200,
    description: "Bullet-point summary of the conversation",
    schema: {
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
  })
  @ApiResponse({ status: 400, description: "No messages to summarize" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Not a participant" })
  @ApiResponse({ status: 404, description: "Conversation not found" })
  @ApiResponse({
    status: 429,
    description: "Rate limit exceeded (15 RPM per user)",
  })
  @ApiResponse({
    status: 503,
    description: "AI provider unavailable or timed out",
  })
  async summarize(
    @Req() req: RequestWithUser,
    @Body() dto: AiSummarizeDto,
  ): Promise<{ summary: string }> {
    return this.summarizeConversation.execute({
      userId: req.user.id,
      conversationId: dto.conversationId,
      limit: dto.limit,
    });
  }

  @Post("agent")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Route an @AI-prefixed message to the AI agent" })
  @ApiBody({ type: AiAgentDto })
  @ApiResponse({ status: 201, description: "AI reply saved and broadcast" })
  @ApiResponse({
    status: 400,
    description: "Blocked or empty query",
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({
    status: 403,
    description: "Not a participant in this conversation",
  })
  @ApiResponse({ status: 404, description: "Conversation not found" })
  @ApiResponse({
    status: 429,
    description: "Rate limit: 1 call per 10 seconds",
  })
  @ApiResponse({
    status: 503,
    description: "AI provider unavailable",
  })
  async runAgent(
    @Req() req: RequestWithUser,
    @Body() dto: AiAgentDto,
  ): Promise<{ message: MessageView }> {
    return this.runAiAgent.execute({
      userId: req.user.id,
      conversationId: dto.conversationId,
      message: dto.message,
    });
  }
}
