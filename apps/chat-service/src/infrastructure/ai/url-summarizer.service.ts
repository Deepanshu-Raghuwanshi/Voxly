import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as cheerio from "cheerio";
import Groq from "groq-sdk";

const TIMEOUT_MS = 5_000;
const MODEL = "llama-3.3-70b-versatile";

@Injectable()
export class UrlSummarizerService {
  private readonly logger = new Logger(UrlSummarizerService.name);
  private readonly groq: Groq;

  constructor(private readonly config: ConfigService) {
    this.groq = new Groq({
      apiKey: config.get<string>("GROQ_API_KEY")!,
      timeout: 15_000,
    });
  }

  async summarize(url: string): Promise<string> {
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return "I couldn't access that URL. It might be private or down.";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let rawText: string;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatBot/1.0)" },
      });
      if (!response.ok) {
        return "I couldn't access that URL. It might be private or down.";
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, aside").remove();
      rawText = $("p, h1, h2, h3, li")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 20)
        .join("\n")
        .slice(0, 3000);
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.name === "AbortError"
            ? "timeout"
            : err.message
          : String(err);
      this.logger.warn(`URL fetch failed for ${url}: ${reason}`);
      return "I couldn't access that URL. It might be private or down.";
    } finally {
      clearTimeout(timer);
    }

    if (!rawText.trim()) {
      return "I couldn't extract readable content from that URL.";
    }

    const completion = await this.groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Summarize the following web page content in exactly 5 concise bullet points. Start each bullet with '• '.",
        },
        { role: "user", content: rawText },
      ],
      max_tokens: 512,
    });

    return (
      completion.choices[0]?.message?.content?.trim() ?? "Could not summarize."
    );
  }
}
