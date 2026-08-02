import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from "groq-sdk/resources/chat/completions";
import { TavilyWebSearchService } from "./tavily-web-search.service";
import { GROQ_TOOL_MODEL, REASONING_EFFORT } from "./ai-models";
import {
  PersonaAgentPort,
  PersonaRunParams,
  PersonaAgentResult,
} from "../../application/ports/persona-agent.port";

const MODEL = GROQ_TOOL_MODEL;

const WEB_SEARCH_TOOL: ChatCompletionTool = {
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

@Injectable()
export class PersonaGroqAgentService implements PersonaAgentPort {
  private readonly logger = new Logger(PersonaGroqAgentService.name);
  private readonly groq: Groq;

  constructor(
    private readonly config: ConfigService,
    private readonly webSearch: TavilyWebSearchService,
  ) {
    this.groq = new Groq({
      apiKey: config.get<string>("GROQ_API_KEY")!,
      timeout: 30_000,
    });
  }

  async run(params: PersonaRunParams): Promise<PersonaAgentResult> {
    const { query, context, userId, systemPrompt, useWebSearch } = params;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...context,
      { role: "user", content: query },
    ];

    // Sage: single turn, no tools
    if (!useWebSearch) {
      const response = await this.groq.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: 1024,
        reasoning_effort: REASONING_EFFORT,
      });
      return {
        reply: response.choices[0].message.content?.trim() ?? "",
        toolUsed: "direct",
      };
    }

    // Turn 1: model may call web_search
    const turn1 = await this.groq.chat.completions.create({
      model: MODEL,
      messages,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: "auto",
      max_tokens: 1024,
      reasoning_effort: REASONING_EFFORT,
    });

    const choice = turn1.choices[0];
    const toolCall = choice.message.tool_calls?.[0];

    // No tool called — model answered directly
    if (!toolCall || toolCall.function.name !== "web_search") {
      const directReply = choice.message.content?.trim();
      if (directReply) return { reply: directReply, toolUsed: "direct" };

      // Edge case: empty content and no tool call — force a direct answer
      const fallback = await this.groq.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: 1024,
        reasoning_effort: REASONING_EFFORT,
      });
      return {
        reply: fallback.choices[0].message.content?.trim() ?? "",
        toolUsed: "direct",
      };
    }

    let searchArgs: { query: string };
    try {
      searchArgs = JSON.parse(toolCall.function.arguments) as { query: string };
    } catch {
      // Malformed tool args — answer from knowledge
      const fallback = await this.groq.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: 1024,
        reasoning_effort: REASONING_EFFORT,
      });
      return {
        reply: fallback.choices[0].message.content?.trim() ?? "",
        toolUsed: "direct",
      };
    }

    this.logger.log(
      `[PERSONA] userId=${userId} web_search query="${searchArgs.query}"`,
    );

    let searchResult: string;
    try {
      searchResult = await this.webSearch.search(searchArgs.query);
    } catch (err) {
      // Search failed — answer from knowledge with disclaimer
      this.logger.warn(
        `[PERSONA] web_search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const fallback = await this.groq.chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: 1024,
        reasoning_effort: REASONING_EFFORT,
      });
      const base = fallback.choices[0].message.content?.trim() ?? "";
      return {
        reply: `${base}\n\n*(Note: I couldn't fetch real-time data for this)*`,
        toolUsed: "direct",
      };
    }

    // Turn 2: synthesize search results in persona's voice
    const turn2 = await this.groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt + SYNTHESIS_SUFFIX },
        {
          role: "user",
          content: `${query}\n\n[web_search result]: ${searchResult}`,
        },
      ],
      max_tokens: 768,
      reasoning_effort: REASONING_EFFORT,
    });

    return {
      reply: turn2.choices[0].message.content?.trim() ?? "",
      toolUsed: "web_search",
    };
  }
}
