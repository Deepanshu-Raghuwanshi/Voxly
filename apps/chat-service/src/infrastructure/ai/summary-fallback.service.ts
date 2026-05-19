import { Injectable, Logger } from "@nestjs/common";
import { AiSummarizerPort } from "../../application/ports/ai-summarizer.port";
import { GroqSummaryService } from "./groq-summary.service";
import { CerebrasSummaryService } from "./cerebras-summary.service";
import { runWithFallbackChain } from "./ai-provider-chain";

@Injectable()
export class SummaryFallbackService implements AiSummarizerPort {
  private readonly logger = new Logger(SummaryFallbackService.name);

  constructor(
    private readonly groq: GroqSummaryService,
    private readonly cerebras: CerebrasSummaryService,
  ) {}

  async summarize(
    messages: Array<{ role: "me" | "them"; content: string }>,
  ): Promise<string> {
    return runWithFallbackChain(
      [
        { name: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct", feature: "summarize", fn: () => this.groq.summarize(messages) },
        { name: "cerebras", model: "gpt-oss-120b", feature: "summarize", fn: () => this.cerebras.summarize(messages) },
      ],
      this.logger,
    );
  }
}
