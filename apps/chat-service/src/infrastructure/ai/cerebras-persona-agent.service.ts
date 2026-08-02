import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { TavilyWebSearchService } from "./tavily-web-search.service";
import { CEREBRAS_MODEL, REASONING_EFFORT } from "./ai-models";
import {
  PersonaAgentPort,
  PersonaRunParams,
  PersonaAgentResult,
} from "../../application/ports/persona-agent.port";

const MODEL = CEREBRAS_MODEL;
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

const WEB_SEARCH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
};

const SYNTHESIS_SUFFIX =
  "\n\nA web search tool was called and returned results. Your only job is to " +
  "turn those results into a clear, concise answer in your persona's voice (under 300 words). " +
  "Maintain your tone and style. Use the tool result directly.";

/**
 * Cerebras counterpart to PersonaGroqAgentService — same flow, second provider.
 * Personas were the only AI feature without a fallback, so a Groq outage took
 * them down outright while every other feature degraded quietly.
 */
@Injectable()
export class CerebrasPersonaAgentService implements PersonaAgentPort {
  private readonly logger = new Logger(CerebrasPersonaAgentService.name);
  private readonly client: OpenAI | null;

  constructor(
    config: ConfigService,
    private readonly webSearch: TavilyWebSearchService,
  ) {
    const key = config.get<string>("CEREBRAS_API_KEY");
    this.client = key
      ? new OpenAI({ apiKey: key, baseURL: CEREBRAS_BASE_URL, timeout: 30_000 })
      : null;
  }

  async run(params: PersonaRunParams): Promise<PersonaAgentResult> {
    if (!this.client)
      throw new ServiceUnavailableException("Cerebras not configured");

    const client = this.client;
    const { query, context, userId, systemPrompt, useWebSearch } = params;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...context,
      { role: "user", content: query },
    ];

    const answerDirectly = async (): Promise<string> => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: 1024,
        reasoning_effort: REASONING_EFFORT,
      });
      return completion.choices[0]?.message?.content?.trim() ?? "";
    };

    // Personas without web search answer in a single turn
    if (!useWebSearch) {
      const reply = await answerDirectly();
      if (!reply) throw new Error("model returned an empty reply");
      return { reply, toolUsed: "direct" };
    }

    // Turn 1: the model may call web_search
    const turn1 = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: "auto",
      max_tokens: 1024,
      reasoning_effort: REASONING_EFFORT,
    });

    const choice = turn1.choices[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    // No tool call — the model answered from knowledge
    if (
      !toolCall ||
      toolCall.type !== "function" ||
      toolCall.function.name !== "web_search"
    ) {
      const directReply = choice?.message?.content?.trim();
      if (directReply) return { reply: directReply, toolUsed: "direct" };

      const retry = await answerDirectly();
      if (!retry) throw new Error("model returned an empty reply");
      return { reply: retry, toolUsed: "direct" };
    }

    let searchArgs: { query: string };
    try {
      searchArgs = JSON.parse(toolCall.function.arguments) as { query: string };
    } catch {
      // Malformed tool args — answer from knowledge instead
      const reply = await answerDirectly();
      if (!reply) throw new Error("model returned an empty reply");
      return { reply, toolUsed: "direct" };
    }

    this.logger.log(
      `[PERSONA] userId=${userId} web_search query="${searchArgs.query}"`,
    );

    let searchResult: string;
    try {
      searchResult = await this.webSearch.search(searchArgs.query);
    } catch (err) {
      this.logger.warn(
        `[PERSONA] web_search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const base = await answerDirectly();
      if (!base) throw new Error("model returned an empty reply");
      return {
        reply: `${base}\n\n*(Note: I couldn't fetch real-time data for this)*`,
        toolUsed: "direct",
      };
    }

    // Turn 2: synthesize the search results in the persona's voice
    const turn2 = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt + SYNTHESIS_SUFFIX },
        {
          role: "user",
          content: `${query}\n\n[web_search result]: ${searchResult}`,
        },
      ],
      max_tokens: 1024,
      reasoning_effort: REASONING_EFFORT,
    });

    const synthesized = turn2.choices[0]?.message?.content?.trim();
    if (!synthesized) {
      this.logger.warn(
        `[PERSONA] userId=${userId} synthesis returned empty content ` +
          `(finish_reason=${turn2.choices[0]?.finish_reason}) — falling back to raw search result`,
      );
      const raw = searchResult.trim();
      if (!raw) throw new Error("model returned an empty reply");
      return { reply: raw.slice(0, 2000), toolUsed: "web_search" };
    }

    return { reply: synthesized, toolUsed: "web_search" };
  }
}
