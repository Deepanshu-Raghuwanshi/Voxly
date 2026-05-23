import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
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
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RequestWithUser } from "../request-with-user.interface";
import { JwtAuthGuard } from "../../infrastructure/guards/jwt-auth.guard";
import { UserThrottlerGuard } from "../../infrastructure/guards/user-throttler.guard";
import { RunPersonaAgentUseCase } from "../../application/use-cases/run-persona-agent.use-case";
import { GetPersonaHistoryUseCase } from "../../application/use-cases/get-persona-history.use-case";
import { ClearPersonaHistoryUseCase } from "../../application/use-cases/clear-persona-history.use-case";
import { PersonaChatDto } from "../../application/dto/persona-chat.dto";
import { PERSONA_IDS } from "@shared-utils";

@ApiTags("Persona AI")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller("chat/persona")
export class PersonaController {
  constructor(
    private readonly runPersonaAgent: RunPersonaAgentUseCase,
    private readonly getPersonaHistory: GetPersonaHistoryUseCase,
    private readonly clearPersonaHistory: ClearPersonaHistoryUseCase,
  ) {}

  @Post("chat")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send a message to an AI expert persona" })
  @ApiBody({ type: PersonaChatDto })
  @ApiResponse({ status: 200, description: "AI persona reply" })
  @ApiResponse({ status: 400, description: "Blocked or invalid personaId" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({
    status: 429,
    description: "Rate limited (5s cooldown or 20/hr)",
  })
  @ApiResponse({ status: 503, description: "LLM or search unavailable" })
  async chat(
    @Req() req: RequestWithUser,
    @Body() dto: PersonaChatDto,
  ): Promise<{ reply: string; personaId: string; toolUsed: string | null }> {
    return this.runPersonaAgent.execute({
      userId: req.user.id,
      personaId: dto.personaId,
      message: dto.message,
    });
  }

  @Get("history/:personaId")
  @ApiOperation({ summary: "Get conversation history with a persona" })
  @ApiParam({ name: "personaId", enum: PERSONA_IDS })
  @ApiResponse({ status: 200, description: "Persona conversation history" })
  @ApiResponse({ status: 400, description: "Invalid personaId" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async history(
    @Req() req: RequestWithUser,
    @Param("personaId") personaId: string,
  ) {
    return this.getPersonaHistory.execute(req.user.id, personaId);
  }

  @Delete("history/:personaId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Clear conversation history with a persona" })
  @ApiParam({ name: "personaId", enum: PERSONA_IDS })
  @ApiResponse({ status: 200, description: "History cleared" })
  @ApiResponse({ status: 400, description: "Invalid personaId" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async clearHistory(
    @Req() req: RequestWithUser,
    @Param("personaId") personaId: string,
  ): Promise<{ deleted: number }> {
    return this.clearPersonaHistory.execute(req.user.id, personaId);
  }
}
