import { Injectable, Logger } from "@nestjs/common";
import {
  AiRewriterPort,
  RewriteTone,
} from "../../application/ports/ai-rewriter.port";
import { GroqRewriteService } from "./groq-rewrite.service";
import { CerebrasRewriteService } from "./cerebras-rewrite.service";
import { runWithFallbackChain } from "./ai-provider-chain";

@Injectable()
export class RewriteFallbackService implements AiRewriterPort {
  private readonly logger = new Logger(RewriteFallbackService.name);

  constructor(
    private readonly groq: GroqRewriteService,
    private readonly cerebras: CerebrasRewriteService,
  ) {}

  async rewrite(text: string, tone: RewriteTone): Promise<string> {
    return runWithFallbackChain(
      [
        { name: "groq", fn: () => this.groq.rewrite(text, tone) },
        { name: "cerebras", fn: () => this.cerebras.rewrite(text, tone) },
      ],
      this.logger,
    );
  }
}
