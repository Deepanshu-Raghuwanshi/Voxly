import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tavily } from "@tavily/core";

const TIMEOUT_MS = 5_000;

@Injectable()
export class TavilyWebSearchService {
  private readonly logger = new Logger(TavilyWebSearchService.name);
  private readonly client: ReturnType<typeof tavily>;

  constructor(private readonly config: ConfigService) {
    this.client = tavily({
      apiKey: config.get<string>("TAVILY_API_KEY")!,
    });
  }

  async search(query: string): Promise<string> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
    );

    try {
      const response = await Promise.race([
        this.client.search(query, { maxResults: 3 }),
        timeout,
      ]);

      if (!response.results?.length) {
        return "No results found.";
      }

      return response.results
        .map(
          (r: { title: string; url: string; content: string }, i: number) =>
            `${i + 1}. [${r.title}] (${r.url})\n   ${r.content}`,
        )
        .join("\n\n");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tavily search failed: ${reason}`);
      throw new Error(`Tavily search failed: ${reason}`);
    }
  }
}
