import { Injectable, Logger } from "@nestjs/common";
import { AiSmartReplierPort } from "../../application/ports/ai-smart-reply.port";
import { GroqSmartReplyService } from "./groq-smart-reply.service";
import { CerebrasSmartReplyService } from "./cerebras-smart-reply.service";
import { runWithFallbackChain } from "./ai-provider-chain";

@Injectable()
export class SmartReplyFallbackService implements AiSmartReplierPort {
  private readonly logger = new Logger(SmartReplyFallbackService.name);

  constructor(
    private readonly groq: GroqSmartReplyService,
    private readonly cerebras: CerebrasSmartReplyService,
  ) {}

  async generateReplies(
    messages: Array<{ role: "me" | "them"; content: string }>,
  ): Promise<string[]> {
    return runWithFallbackChain(
      [
        { name: "groq", model: "llama-3.3-70b-versatile", feature: "smart_reply", fn: () => this.groq.generateReplies(messages) },
        { name: "cerebras", model: "gpt-oss-120b", feature: "smart_reply", fn: () => this.cerebras.generateReplies(messages) },
      ],
      this.logger,
    );
  }
}
