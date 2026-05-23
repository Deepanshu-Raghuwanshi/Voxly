# AI Expert Personas — Feature Spec

## 1. Summary

AI Expert Personas is a dedicated `/explore` page where logged-in users can select from 5 specialised AI agents (Nova, Atlas, Lex, Sage, Pulse) and have a persistent 1-on-1 conversation with them. Each persona has a unique system prompt, colour theme, and tool access — some personas call Tavily web search in a two-turn Groq LLM loop identical to the existing `@AI` chat agent, while Sage answers solely from model knowledge. Conversation history is saved per-user-per-persona in a new MongoDB collection and loaded on every visit. Technically this feature wraps the existing Groq SDK client and `TavilyWebSearchService` already wired in `chat-service`, adds a new `PersonaController` with three endpoints, a lightweight `PersonaRateLimiterService`, a `PersonaGroqAgentService` that accepts a dynamic system prompt, a `PersonaMessage` Mongoose schema, and a self-contained React feature on the frontend backed by Zustand + TanStack Query following the same patterns as `useChatStore` / `useChat`.

---

## 2. Current State

Verified by reading the following files before writing this spec:

**Backend (chat-service):**

- `apps/chat-service/src/infrastructure/ai/groq-agent.service.ts` — Groq two-turn loop exists, model is `meta-llama/llama-4-scout-17b-16e-instruct`, system prompt and tools are **hardcoded** — cannot accept a custom prompt without a new service.
- `apps/chat-service/src/infrastructure/ai/tavily-web-search.service.ts` — web search injectable, already registered in `ChatModule`.
- `apps/chat-service/src/infrastructure/ai/agent-rate-limiter.service.ts` — 10 s cooldown per userId, **no hourly cap**, only `check(userId)` method. Cannot reuse as-is for personas.
- `apps/chat-service/src/application/use-cases/run-ai-agent.use-case.ts` — full agent loop, input validation, rate-limit exceptions — pattern to replicate.
- `apps/chat-service/src/infrastructure/persistence/mongoose/schemas/message.schema.ts` — existing `Message` schema has `isAI`, `toolUsed`, `agentQuery` but is tied to `conversationId` and chat semantics. **Persona messages need a separate collection.**
- `apps/chat-service/src/chat.module.ts` — `AgentFallbackService` bound to token `"AiAgent"`, `TavilyWebSearchService` already a provider. No `PersonaController` or `PersonaMessage` schema registered.
- `apps/chat-service/src/interfaces/controllers/ai.controller.ts` — existing AI routes at `chat/ai/*`. Persona routes will live at `chat/persona/*`.

**API Gateway:**

- `apps/api-gateway/src/interfaces/controllers/gateway.controller.ts` — routes `chat` prefix → `CHAT_SERVICE_URL`. No changes needed; persona URLs at `/api/v1/chat/persona/*` proxy automatically.

**Frontend:**

- `apps/frontend/src/features/chat/` — chat feature with `useChatStore` (Zustand), `useChat.ts` (TQ), `chat.service.ts` (axios). Pattern to replicate for personas.
- `apps/frontend/src/shared/components/Navbar.tsx` — only has `/chat` and `/friends` nav items. **No `/explore` link exists.**
- `apps/frontend/app/explore/` — **does not exist**.
- `apps/frontend/src/features/persona/` — **does not exist**.

**Shared libs:**

- `libs/shared-utils/src/index.ts` — exports `test-constants` and `http`. **No persona constants.**
- `tsconfig.base.json` — `@shared-utils` path alias confirmed.
- `libs/shared-types/src/v1/chat.types.ts` — auto-generated from `chat.yaml`. Will include `PersonaChatDto`, `PersonaHistoryResponse`, etc. after Phase 1's `pnpm generate:types`.

**What does NOT exist yet:**

- `PersonaMessage` MongoDB schema + repository
- `PersonaGroqAgentService` (dynamic system prompt)
- `PersonaRateLimiterService` (5 s + 20/hr)
- `RunPersonaAgentUseCase`, `GetPersonaHistoryUseCase`, `ClearPersonaHistoryUseCase`
- `PersonaController`
- Shared `PERSONAS` constants
- Any frontend persona feature (`/explore` page, store, service, hooks, components)

---

## 3. Desired State

### User-facing behaviour

1. User navigates to `/explore` from the Navbar (new Sparkles icon link).
2. A grid of 5 persona cards is shown (2-col tablet, 3-col desktop, 1-col mobile).
3. Clicking "Chat now" or a starter question chip opens the persona chat view.
4. The chat view shows previous conversation history immediately.
5. User types a message and submits; a persona-specific thinking indicator appears.
6. The AI reply arrives (≤ 3 seconds for no-search, ≤ 8 seconds for web-search personas).
7. Each assistant message shows a "🔍 searched the web" or "💬 from knowledge" badge.
8. Finance and Legal personas show a disclaimer banner pinned above the message list.
9. "New conversation" button clears history locally and calls the DELETE endpoint.
10. Back button returns to the persona grid.

### Data flow

```
POST /explore → usePersonaChat mutation → apiClient.post('/chat/persona/chat')
  → API Gateway (/api/v1/chat → chat-service)
  → PersonaController.chat()
  → RunPersonaAgentUseCase
    → PersonaRateLimiterService.check(userId)
    → PersonaMessageRepository.findByUserAndPersona(userId, personaId, 8) — context
    → PersonaMessageRepository.save({ role: "user", ... }) — persist user msg
    → PersonaGroqAgentService.run({ query, context, systemPrompt, useWebSearch })
      → Groq Turn 1 (± web_search tool call)
      → TavilyWebSearchService.search(q) [if useWebSearch]
      → Groq Turn 2 synthesis [if web search ran]
    → PersonaMessageRepository.save({ role: "assistant", ... }) — persist AI reply
  → { reply, personaId, toolUsed }
← usePersonaChat.onSuccess → append to Zustand store messages[personaId]
```

### Business rules

- `personaId` must be one of `["nova", "atlas", "lex", "sage", "pulse"]`. Any other value returns 400.
- Message 1–600 chars. Empty or > 600 → 400 with `blocked: true`.
- Guardrails: injection / credentials patterns → 400 blocked. Code-generation patterns → 400 blocked for all personas **except sage** (sage may explain code concepts but not write production code).
- Rate limit: 5 s cooldown per userId (across all personas) + max 20 messages/hr per userId. Both tracked in-memory `Map`.
- Conversation history: last 8 messages passed as context to LLM. Stored in MongoDB, returned oldest-first for display.
- Sage uses a single-turn Groq call with no tools. Other 4 personas use the two-turn tool-calling loop.
- Web search failure for web-search personas → answer from knowledge + append `(Note: I couldn't fetch real-time data for this)`.
- LLM failure → 503, frontend shows `"{Name} is unavailable right now, try again in a moment"` as a system message.

---

## Phase 1 — Contracts & Schema

### 1.1 OpenAPI Changes

Editing existing `libs/openapi-specs/src/v1/chat.yaml` (not creating a new file — persona endpoints belong to chat-service which already owns the `chat` YAML).

| Method | Path                                       | Auth | Purpose                                                   |
| ------ | ------------------------------------------ | ---- | --------------------------------------------------------- |
| POST   | `/api/v1/chat/persona/chat`                | JWT  | Send a message; run persona agent; persist + return reply |
| GET    | `/api/v1/chat/persona/history/{personaId}` | JWT  | Load last 50 messages for user + persona                  |
| DELETE | `/api/v1/chat/persona/history/{personaId}` | JWT  | Clear history (new conversation)                          |

### 1.2 Database Schema Changes

**New Mongoose schema — `PersonaMessage`** (MongoDB, in chat-service):

```typescript
// apps/chat-service/src/infrastructure/persistence/mongoose/schemas/persona-message.schema.ts
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class PersonaMessage extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ["nova", "atlas", "lex", "sage", "pulse"] })
  personaId!: string;

  @Prop({ required: true, enum: ["user", "assistant"] })
  role!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: String, default: null })
  toolUsed?: string | null;

  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const PersonaMessageSchema =
  SchemaFactory.createForClass(PersonaMessage);

// Compound index: all queries filter on userId + personaId + sort by createdAt.
// -1 on createdAt for "fetch last N" (LIMIT + SORT DESC), flipped to ASC at app layer for display.
PersonaMessageSchema.index({ userId: 1, personaId: 1, createdAt: -1 });
```

Why a separate collection: `Message` is always scoped to a `conversationId`, participates in unread counts, and has reaction/reply/status fields that have no meaning for persona chats. Keeping them separate avoids polluting the message collection and makes the persona history query trivially indexed.

No changes to existing models.

### 1.3 Shared PERSONAS Constants

Create `libs/shared-utils/src/persona.constants.ts` and export from `libs/shared-utils/src/index.ts`.

Both backend and frontend import `PERSONAS`, `PersonaId`, and `isValidPersonaId` from `@shared-utils`.

```typescript
// libs/shared-utils/src/persona.constants.ts

export type PersonaId = "nova" | "atlas" | "lex" | "sage" | "pulse";

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  emoji: string;
  role: string;
  description: string;
  colorHex: string;
  tailwindColor: string;
  useWebSearch: boolean;
  systemPrompt: string;
  starterQuestions: [string, string, string];
  disclaimer: string | null;
  inputPlaceholder: string;
}

export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  nova: {
    id: "nova",
    name: "Nova",
    emoji: "🔬",
    role: "Science & Tech Expert",
    description:
      "Latest AI research, space exploration, biology, and emerging tech — explained simply.",
    colorHex: "#3B82F6",
    tailwindColor: "blue",
    useWebSearch: true,
    systemPrompt:
      "You are Nova, a science and technology expert with deep knowledge of the latest " +
      "developments in AI, space exploration, biology, physics, and emerging technology. " +
      "You are precise but approachable — you love making complex topics simple without " +
      "dumbing them down. Always search the web for the latest information before answering " +
      "questions about recent events or developments. Keep responses under 250 words. Use " +
      "bullet points for lists. Never make up facts — if you don't know, say so and search.",
    starterQuestions: [
      "What's the latest in AI research this week?",
      "Explain quantum computing like I'm 15",
      "What happened with SpaceX recently?",
    ],
    disclaimer: null,
    inputPlaceholder: "Ask Nova anything about science & tech...",
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    emoji: "💰",
    role: "Finance & Markets",
    description:
      "Stock market news, crypto trends, economic events — data-driven, never financial advice.",
    colorHex: "#10B981",
    tailwindColor: "emerald",
    useWebSearch: true,
    systemPrompt:
      "You are Atlas, a financial markets analyst. You explain market trends, economic events, " +
      "and financial concepts clearly using real data. You NEVER give buy, sell, or investment " +
      "advice — instead you present information and let users draw their own conclusions. Always " +
      "search for the latest market data, news, and economic indicators before responding. End " +
      'every response with: "Remember: this is informational only, not financial advice." ' +
      "Keep responses under 250 words.",
    starterQuestions: [
      "What's happening in the stock market today?",
      "Explain what a recession means in simple terms",
      "What's the latest news on Bitcoin?",
    ],
    disclaimer: "For informational purposes only. Not financial advice.",
    inputPlaceholder: "Ask Atlas about markets & finance...",
  },
  lex: {
    id: "lex",
    name: "Lex",
    emoji: "⚖️",
    role: "Legal Explainer",
    description:
      "Laws, rights, contracts, and landmark cases — in plain language. Not legal advice.",
    colorHex: "#8B5CF6",
    tailwindColor: "violet",
    useWebSearch: true,
    systemPrompt:
      "You are Lex, a legal concepts explainer. You help people understand laws, rights, legal " +
      "terminology, and landmark cases in plain language. You NEVER give legal advice or tell " +
      "someone what to do in their specific situation — you explain how laws generally work and " +
      "encourage consulting a qualified lawyer for personal situations. Search for relevant laws " +
      'or cases when asked. End every response with: "Please consult a qualified lawyer for ' +
      'advice specific to your situation." Keep responses under 250 words.',
    starterQuestions: [
      "What does GDPR actually mean for regular people?",
      "What are my rights if a company fires me?",
      "Explain what a non-disclosure agreement does",
    ],
    disclaimer:
      "This is not legal advice. Consult a qualified lawyer for your situation.",
    inputPlaceholder: "Ask Lex about laws & legal concepts...",
  },
  sage: {
    id: "sage",
    name: "Sage",
    emoji: "🎓",
    role: "Learning Coach",
    description:
      "Patient, encouraging, Socratic. Explains anything in simple terms with analogies.",
    colorHex: "#F59E0B",
    tailwindColor: "amber",
    useWebSearch: false,
    systemPrompt:
      "You are Sage, a patient and encouraging learning coach. Your superpower is explaining " +
      "anything — no matter how complex — in simple, relatable terms using analogies, real-world " +
      "examples, and the Socratic method. You adapt your explanation style to how the user " +
      "responds. You do not use web search — your answers come from deep understanding. Ask a " +
      "follow-up question at the end of each explanation to check understanding. Keep responses " +
      "under 300 words.",
    starterQuestions: [
      "Explain the stock market like I'm 10",
      "How does the internet actually work?",
      "What is machine learning in simple words?",
    ],
    disclaimer: null,
    inputPlaceholder: "Ask Sage to explain anything simply...",
  },
  pulse: {
    id: "pulse",
    name: "Pulse",
    emoji: "🌍",
    role: "News & World Events",
    description:
      "Neutral, balanced world news. Always searches before answering — no opinions.",
    colorHex: "#EF4444",
    tailwindColor: "red",
    useWebSearch: true,
    systemPrompt:
      "You are Pulse, a neutral world news summarizer. You ALWAYS search the web before " +
      "answering — never rely on memory for news since it goes stale. Present multiple " +
      "perspectives on complex issues without sharing your own opinion. Be concise, factual, " +
      "and balanced. Cite your sources by mentioning the publication name (not the full URL). " +
      "Keep responses under 300 words. If asked for your opinion on political topics, politely " +
      "decline and present multiple viewpoints instead.",
    starterQuestions: [
      "What's the biggest news story today?",
      "What's happening in the Middle East right now?",
      "Summarize this week's major world events",
    ],
    disclaimer: "News summaries may not reflect all perspectives.",
    inputPlaceholder: "Ask Pulse about world news & events...",
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];
export const isValidPersonaId = (id: string): id is PersonaId => id in PERSONAS;
```

Add to `libs/shared-utils/src/index.ts`:

```typescript
export * from "./persona.constants";
```

### 1.4 Kafka Events

None. Persona conversations are private 1-on-1 interactions with no real-time broadcasting needs (no WebSocket room, no Kafka events). The HTTP response carries the reply directly.

### 1.5 Files to Create / Modify in Phase 1

```
libs/openapi-specs/src/v1/chat.yaml          — modified (3 new paths, new schemas, new parameter)
libs/shared-utils/src/persona.constants.ts   — created (PERSONAS config, PersonaId type)
libs/shared-utils/src/index.ts               — modified (add export)
```

Commands to run after Phase 1:

```bash
pnpm generate:types   # regenerates libs/shared-types from chat.yaml — adds PersonaId, PersonaChatDto, etc.
```

---

## Phase 2 — Backend Implementation

### 2.1 Domain Layer

No new domain entities. `PersonaMessage` is a persistence record without business invariants that warrant a domain entity. The persona config is declarative (PERSONAS constant). Data validation lives in the DTO + use case layer, consistent with how the existing `@AI` agent is structured.

### 2.2 Application Layer

#### Repository Port

```typescript
// apps/chat-service/src/application/ports/persona-message.repository.ts
import { PersonaId } from "@shared-utils";

export interface PersonaMessageDoc {
  id: string;
  userId: string;
  personaId: PersonaId;
  role: "user" | "assistant";
  content: string;
  toolUsed: string | null;
  createdAt: Date;
}

export interface PersonaMessageRepository {
  save(
    doc: Omit<PersonaMessageDoc, "id" | "createdAt">,
  ): Promise<PersonaMessageDoc>;
  findByUserAndPersona(
    userId: string,
    personaId: PersonaId,
    limit: number,
  ): Promise<PersonaMessageDoc[]>;
  deleteByUserAndPersona(userId: string, personaId: PersonaId): Promise<number>;
}
```

#### DTO

```typescript
// apps/chat-service/src/application/dto/persona-chat.dto.ts
import { IsString, IsIn, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PERSONA_IDS, PersonaId } from "@shared-utils";

export class PersonaChatDto {
  @ApiProperty({ enum: PERSONA_IDS, description: "Target persona" })
  @IsString()
  @IsIn(PERSONA_IDS)
  personaId!: PersonaId;

  @ApiProperty({ minLength: 1, maxLength: 600 })
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  message!: string;
}
```

#### Input Validator

```typescript
// apps/chat-service/src/application/use-cases/run-persona-agent.use-case.ts
// (validator section — shown separately for clarity)

const BLOCKED_PATTERNS: Record<string, string[]> = {
  injection: [
    "ignore previous",
    "ignore your system",
    "you are now",
    "act as",
    "pretend you are",
    "jailbreak",
    "dan mode",
    "developer mode",
    "override",
    "disregard your",
    "forget everything",
    "new persona",
  ],
  credentials: [
    "api key",
    "secret key",
    "password",
    "env variable",
    "credentials",
    "access token",
    "private key",
    "give me your",
    "show me your",
  ],
  codeGen: [
    "build me",
    "build this",
    "write me a",
    "write code",
    "create an app",
    "generate code",
    "make me a",
    "develop a",
    "code for",
    "write a function",
    "write a script",
    "write a program",
  ],
};

const BLOCKED_RESPONSES: Record<string, string> = {
  injection: "⚠️ That kind of instruction isn't something I can follow.",
  credentials: "🔒 I don't share or reveal any keys or credentials.",
  codeGen:
    "🛠️ I can answer questions and search the web, but I don't write code.",
  too_long: "✂️ Your message is too long. Please keep it under 600 characters.",
  empty: "💬 Please type a message to get started.",
};

function validatePersonaQuery(
  message: string,
  personaId: PersonaId,
): { valid: boolean; category?: string; response?: string } {
  const lower = message.toLowerCase().trim();
  if (!lower) {
    return {
      valid: false,
      category: "empty",
      response: BLOCKED_RESPONSES.empty,
    };
  }
  // MaxLength is enforced by DTO, but guard here too
  if (lower.length > 600) {
    return {
      valid: false,
      category: "too_long",
      response: BLOCKED_RESPONSES.too_long,
    };
  }
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    // Sage may discuss coding concepts; block code *generation* patterns only for others
    if (category === "codeGen" && personaId === "sage") continue;
    if (patterns.some((p) => lower.includes(p))) {
      return { valid: false, category, response: BLOCKED_RESPONSES[category] };
    }
  }
  return { valid: true };
}
```

#### RunPersonaAgentUseCase

```typescript
// apps/chat-service/src/application/use-cases/run-persona-agent.use-case.ts
import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PERSONAS, PersonaId, isValidPersonaId } from "@shared-utils";
import { PersonaMessageRepository } from "../ports/persona-message.repository";
import { PersonaRateLimiterService } from "../../infrastructure/ai/persona-rate-limiter.service";
import { PersonaGroqAgentService } from "../../infrastructure/ai/persona-groq-agent.service";

export interface RunPersonaAgentInput {
  userId: string;
  personaId: string;
  message: string;
}

export class PersonaBlockedException extends HttpException {
  constructor(payload: { blocked: true; category: string; message: string }) {
    super(payload, HttpStatus.BAD_REQUEST);
  }
}

export class PersonaRateLimitedException extends HttpException {
  constructor(payload: {
    rateLimited: true;
    secondsRemaining: number;
    message: string;
  }) {
    super(payload, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class RunPersonaAgentUseCase {
  private readonly logger = new Logger(RunPersonaAgentUseCase.name);

  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
    private readonly personaRateLimiter: PersonaRateLimiterService,
    private readonly personaGroqAgent: PersonaGroqAgentService,
  ) {}

  async execute(
    input: RunPersonaAgentInput,
  ): Promise<{ reply: string; personaId: PersonaId; toolUsed: string | null }> {
    const { userId, message } = input;

    // 1. Validate personaId
    if (!isValidPersonaId(input.personaId)) {
      throw new PersonaBlockedException({
        blocked: true,
        category: "empty",
        message: `Unknown persona: ${input.personaId}`,
      });
    }
    const personaId = input.personaId;
    const persona = PERSONAS[personaId];

    // 2. Validate message before consuming rate-limit slot
    const validation = validatePersonaQuery(message, personaId);
    if (!validation.valid) {
      this.logger.log(
        `[PERSONA BLOCKED] userId=${userId} personaId=${personaId} category=${validation.category}`,
      );
      throw new PersonaBlockedException({
        blocked: true,
        category: validation.category!,
        message: validation.response!,
      });
    }

    // 3. Rate limit check
    const rateCheck = this.personaRateLimiter.check(userId);
    if (!rateCheck.allowed) {
      const msg =
        rateCheck.reason === "hourly"
          ? `You've reached the hourly limit. Come back in ${Math.ceil(rateCheck.secondsRemaining! / 60)} minutes ⏳`
          : `Slow down! Try again in ${rateCheck.secondsRemaining} seconds ⏳`;
      throw new PersonaRateLimitedException({
        rateLimited: true,
        secondsRemaining: rateCheck.secondsRemaining!,
        message: msg,
      });
    }

    // 4. Fetch last 8 messages as context (oldest-first for LLM)
    const history = await this.personaMessageRepo.findByUserAndPersona(
      userId,
      personaId,
      8,
    );
    const context = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 5. Persist user message
    await this.personaMessageRepo.save({
      userId,
      personaId,
      role: "user",
      content: message,
      toolUsed: null,
    });

    // 6. Run persona agent
    let agentResult: { reply: string; toolUsed: "web_search" | "direct" };
    try {
      agentResult = await this.personaGroqAgent.run({
        query: message,
        context,
        userId,
        systemPrompt: persona.systemPrompt,
        useWebSearch: persona.useWebSearch,
      });
    } catch (err) {
      this.logger.error(
        `[PERSONA AGENT] run failed | userId=${userId} personaId=${personaId} | ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        `${persona.name} is unavailable right now, try again in a moment`,
      );
    }

    // 7. Persist AI reply
    await this.personaMessageRepo.save({
      userId,
      personaId,
      role: "assistant",
      content: agentResult.reply,
      toolUsed: agentResult.toolUsed,
    });

    return {
      reply: agentResult.reply,
      personaId,
      toolUsed: agentResult.toolUsed,
    };
  }
}
```

#### GetPersonaHistoryUseCase

```typescript
// apps/chat-service/src/application/use-cases/get-persona-history.use-case.ts
import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { PersonaId, isValidPersonaId } from "@shared-utils";
import {
  PersonaMessageRepository,
  PersonaMessageDoc,
} from "../ports/persona-message.repository";

@Injectable()
export class GetPersonaHistoryUseCase {
  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
  ) {}

  async execute(
    userId: string,
    personaId: string,
  ): Promise<{ personaId: PersonaId; messages: PersonaMessageDoc[] }> {
    if (!isValidPersonaId(personaId)) {
      throw new BadRequestException(`Invalid personaId: ${personaId}`);
    }
    const messages = await this.personaMessageRepo.findByUserAndPersona(
      userId,
      personaId,
      50,
    );
    return { personaId, messages };
  }
}
```

#### ClearPersonaHistoryUseCase

```typescript
// apps/chat-service/src/application/use-cases/clear-persona-history.use-case.ts
import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { isValidPersonaId } from "@shared-utils";
import { PersonaMessageRepository } from "../ports/persona-message.repository";

@Injectable()
export class ClearPersonaHistoryUseCase {
  constructor(
    @Inject("PersonaMessageRepository")
    private readonly personaMessageRepo: PersonaMessageRepository,
  ) {}

  async execute(
    userId: string,
    personaId: string,
  ): Promise<{ deleted: number }> {
    if (!isValidPersonaId(personaId)) {
      throw new BadRequestException(`Invalid personaId: ${personaId}`);
    }
    const deleted = await this.personaMessageRepo.deleteByUserAndPersona(
      userId,
      personaId,
    );
    return { deleted };
  }
}
```

### 2.3 Infrastructure Layer

#### PersonaGroqAgentService

```typescript
// apps/chat-service/src/infrastructure/ai/persona-groq-agent.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from "groq-sdk/resources/chat/completions";
import { TavilyWebSearchService } from "./tavily-web-search.service";

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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

export interface PersonaRunParams {
  query: string;
  context: Array<{ role: "user" | "assistant"; content: string }>;
  userId: string;
  systemPrompt: string;
  useWebSearch: boolean;
}

export interface PersonaAgentResult {
  reply: string;
  toolUsed: "web_search" | "direct";
}

@Injectable()
export class PersonaGroqAgentService {
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
      });
      return {
        reply: response.choices[0].message.content?.trim() ?? "",
        toolUsed: "direct",
      };
    }

    // Turn 1: may call web_search
    const turn1 = await this.groq.chat.completions.create({
      model: MODEL,
      messages,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: "auto",
      max_tokens: 1024,
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
    });

    return {
      reply: turn2.choices[0].message.content?.trim() ?? "",
      toolUsed: "web_search",
    };
  }
}
```

#### PersonaRateLimiterService

```typescript
// apps/chat-service/src/infrastructure/ai/persona-rate-limiter.service.ts
import { Injectable } from "@nestjs/common";

interface UserRecord {
  lastCallAt: number;
  hourlyCount: number;
  hourWindowStart: number;
}

@Injectable()
export class PersonaRateLimiterService {
  private readonly records = new Map<string, UserRecord>();
  private readonly cooldownMs = 5_000;
  private readonly maxPerHour = 20;
  private readonly hourMs = 60 * 60 * 1000;

  check(userId: string): {
    allowed: boolean;
    secondsRemaining?: number;
    reason?: "cooldown" | "hourly";
  } {
    const now = Date.now();
    const rec = this.records.get(userId) ?? {
      lastCallAt: 0,
      hourlyCount: 0,
      hourWindowStart: now,
    };

    // Reset hourly window if expired
    if (now - rec.hourWindowStart >= this.hourMs) {
      rec.hourlyCount = 0;
      rec.hourWindowStart = now;
    }

    // Per-message cooldown check
    if (rec.lastCallAt > 0 && now - rec.lastCallAt < this.cooldownMs) {
      const secondsRemaining = Math.ceil(
        (this.cooldownMs - (now - rec.lastCallAt)) / 1000,
      );
      return { allowed: false, secondsRemaining, reason: "cooldown" };
    }

    // Hourly cap check
    if (rec.hourlyCount >= this.maxPerHour) {
      const secondsRemaining = Math.ceil(
        (this.hourMs - (now - rec.hourWindowStart)) / 1000,
      );
      return { allowed: false, secondsRemaining, reason: "hourly" };
    }

    // Allow — update record
    rec.lastCallAt = now;
    rec.hourlyCount += 1;
    this.records.set(userId, rec);
    return { allowed: true };
  }
}
```

#### MongoDB Repository Implementation

```typescript
// apps/chat-service/src/infrastructure/persistence/mongoose/mongoose-persona-message.repository.ts
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PersonaId } from "@shared-utils";
import {
  PersonaMessageRepository,
  PersonaMessageDoc,
} from "../../../application/ports/persona-message.repository";
import { PersonaMessage } from "./schemas/persona-message.schema";

@Injectable()
export class MongoosePersonaMessageRepository implements PersonaMessageRepository {
  constructor(
    @InjectModel(PersonaMessage.name)
    private readonly model: Model<PersonaMessage>,
  ) {}

  async save(
    doc: Omit<PersonaMessageDoc, "id" | "createdAt">,
  ): Promise<PersonaMessageDoc> {
    const saved = await this.model.create(doc);
    return this.toDoc(saved);
  }

  async findByUserAndPersona(
    userId: string,
    personaId: PersonaId,
    limit: number,
  ): Promise<PersonaMessageDoc[]> {
    // Sort DESC to get last N, then reverse in-memory for chronological order.
    // The compound index { userId: 1, personaId: 1, createdAt: -1 } covers this
    // query exactly — no collection scan.
    const docs = await this.model
      .find({ userId, personaId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.reverse().map((d) => this.toDoc(d as PersonaMessage));
  }

  async deleteByUserAndPersona(
    userId: string,
    personaId: PersonaId,
  ): Promise<number> {
    const result = await this.model.deleteMany({ userId, personaId }).exec();
    return result.deletedCount;
  }

  private toDoc(doc: PersonaMessage): PersonaMessageDoc {
    return {
      id: (doc._id as unknown as { toString(): string }).toString(),
      userId: doc.userId,
      personaId: doc.personaId as PersonaId,
      role: doc.role as "user" | "assistant",
      content: doc.content,
      toolUsed: doc.toolUsed ?? null,
      createdAt: doc.createdAt,
    };
  }
}
```

### 2.4 Interfaces Layer

#### PersonaController

```typescript
// apps/chat-service/src/interfaces/controllers/persona.controller.ts
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
```

### 2.5 Module Registration

Modify `apps/chat-service/src/chat.module.ts`:

```typescript
// ADD these imports at the top:
import { PersonaMessage, PersonaMessageSchema } from "./infrastructure/persistence/mongoose/schemas/persona-message.schema";
import { MongoosePersonaMessageRepository } from "./infrastructure/persistence/mongoose/mongoose-persona-message.repository";
import { PersonaGroqAgentService } from "./infrastructure/ai/persona-groq-agent.service";
import { PersonaRateLimiterService } from "./infrastructure/ai/persona-rate-limiter.service";
import { RunPersonaAgentUseCase } from "./application/use-cases/run-persona-agent.use-case";
import { GetPersonaHistoryUseCase } from "./application/use-cases/get-persona-history.use-case";
import { ClearPersonaHistoryUseCase } from "./application/use-cases/clear-persona-history.use-case";
import { PersonaController } from "./interfaces/controllers/persona.controller";

// In MongooseModule.forFeature([...]), ADD:
{ name: PersonaMessage.name, schema: PersonaMessageSchema },

// In controllers: [...], ADD:
PersonaController,

// In providers: [...], ADD:
PersonaGroqAgentService,
PersonaRateLimiterService,
RunPersonaAgentUseCase,
GetPersonaHistoryUseCase,
ClearPersonaHistoryUseCase,
{ provide: "PersonaMessageRepository", useClass: MongoosePersonaMessageRepository },
```

### 2.6 Files to Create / Modify in Phase 2

```
libs/shared-utils/src/persona.constants.ts                                             — created (Phase 1 carry-over)
libs/shared-utils/src/index.ts                                                         — modified

apps/chat-service/src/infrastructure/persistence/mongoose/schemas/persona-message.schema.ts — created
apps/chat-service/src/infrastructure/persistence/mongoose/mongoose-persona-message.repository.ts — created
apps/chat-service/src/infrastructure/ai/persona-groq-agent.service.ts                  — created
apps/chat-service/src/infrastructure/ai/persona-rate-limiter.service.ts                — created
apps/chat-service/src/application/ports/persona-message.repository.ts                  — created
apps/chat-service/src/application/dto/persona-chat.dto.ts                              — created
apps/chat-service/src/application/use-cases/run-persona-agent.use-case.ts             — created
apps/chat-service/src/application/use-cases/get-persona-history.use-case.ts           — created
apps/chat-service/src/application/use-cases/clear-persona-history.use-case.ts         — created
apps/chat-service/src/interfaces/controllers/persona.controller.ts                     — created
apps/chat-service/src/chat.module.ts                                                    — modified
```

### 2.7 Test Cases

**Unit — RunPersonaAgentUseCase** (`apps/chat-service/tests/unit/run-persona-agent.use-case.spec.ts`):

- [ ] Happy path (web-search persona): validates → allows rate limit → saves user msg → calls PersonaGroqAgentService → saves AI reply → returns `{ reply, personaId, toolUsed: "web_search" }`
- [ ] Happy path (sage): `toolUsed: "direct"` returned, no web search attempted
- [ ] Throws `PersonaBlockedException` (400) when `personaId` is not in PERSONA_IDS
- [ ] Throws `PersonaBlockedException` (400) when message is empty
- [ ] Throws `PersonaBlockedException` (400) when message exceeds 600 chars
- [ ] Throws `PersonaBlockedException` (400) for injection pattern
- [ ] Throws `PersonaBlockedException` (400) for code-gen pattern on `nova` persona
- [ ] Does NOT throw for code-gen pattern on `sage` persona (Sage may explain code)
- [ ] Throws `PersonaRateLimitedException` (429) with `reason: "cooldown"` when 5s cooldown active
- [ ] Throws `PersonaRateLimitedException` (429) with `reason: "hourly"` when 20/hr cap reached
- [ ] Throws `ServiceUnavailableException` (503) when PersonaGroqAgentService throws
- [ ] Does NOT call PersonaGroqAgentService when validation fails (rate-limit slot not consumed)

**Unit — PersonaRateLimiterService** (`apps/chat-service/tests/unit/persona-rate-limiter.service.spec.ts`):

- [ ] First call returns `{ allowed: true }`
- [ ] Second call within 5 s returns `{ allowed: false, reason: "cooldown", secondsRemaining: >= 1 }`
- [ ] Call after 5 s returns `{ allowed: true }`
- [ ] 20th call in same hour returns `{ allowed: true }`, 21st returns `{ allowed: false, reason: "hourly" }`
- [ ] New hourly window after 1 hr resets count

**Unit — PersonaController** (`apps/chat-service/tests/unit/persona.controller.spec.ts`):

- [ ] `POST chat`: delegates to `RunPersonaAgentUseCase.execute` with correct `userId` from JWT
- [ ] `GET history/:personaId`: delegates to `GetPersonaHistoryUseCase.execute`
- [ ] `DELETE history/:personaId`: delegates to `ClearPersonaHistoryUseCase.execute`

```bash
pnpm nx typecheck chat-service
pnpm nx lint chat-service
pnpm nx test chat-service
```

---

## Phase 3 — Frontend Implementation

### 3.1 Routes / Pages

| Route      | Page File                            | New or Modified | Purpose                   |
| ---------- | ------------------------------------ | --------------- | ------------------------- |
| `/explore` | `apps/frontend/app/explore/page.tsx` | created         | Persona grid or chat view |

### 3.2 Types

Define locally until `pnpm generate:types` runs and adds them to `@shared-types`:

```typescript
// apps/frontend/src/features/persona/types.ts
import { PersonaId, PersonaConfig } from "@shared-utils";

export type { PersonaId, PersonaConfig };

export interface PersonaMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUsed: "web_search" | "direct" | null;
  createdAt: string;
}

export interface PersonaChatResponse {
  reply: string;
  personaId: PersonaId;
  toolUsed: "web_search" | "direct" | null;
}

export interface PersonaHistoryResponse {
  personaId: PersonaId;
  messages: PersonaMessageItem[];
}
```

### 3.3 Zustand Store

```typescript
// apps/frontend/src/features/persona/store/usePersonaStore.ts
import { create } from "zustand";
import { PersonaId, PERSONA_IDS } from "@shared-utils";
import { PersonaMessageItem } from "../types";

interface RateLimitState {
  blocked: boolean;
  secondsLeft: number;
}

interface PersonaState {
  selectedPersonaId: PersonaId | null;
  messages: Record<PersonaId, PersonaMessageItem[]>;
  loading: Record<PersonaId, boolean>;
  rateLimit: Record<PersonaId, RateLimitState>;
  draft: string;

  selectPersona: (id: PersonaId | null) => void;
  setMessages: (personaId: PersonaId, msgs: PersonaMessageItem[]) => void;
  appendMessage: (personaId: PersonaId, msg: PersonaMessageItem) => void;
  setLoading: (personaId: PersonaId, loading: boolean) => void;
  setRateLimit: (personaId: PersonaId, rl: RateLimitState) => void;
  setDraft: (text: string) => void;
  clearMessages: (personaId: PersonaId) => void;
}

const defaultRateLimit: RateLimitState = { blocked: false, secondsLeft: 0 };

const emptyMessages = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: [] }),
  {} as Record<PersonaId, PersonaMessageItem[]>,
);

const emptyLoading = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: false }),
  {} as Record<PersonaId, boolean>,
);

const emptyRateLimit = PERSONA_IDS.reduce(
  (acc, id) => ({ ...acc, [id]: defaultRateLimit }),
  {} as Record<PersonaId, RateLimitState>,
);

export const usePersonaStore = create<PersonaState>((set) => ({
  selectedPersonaId: null,
  messages: emptyMessages,
  loading: emptyLoading,
  rateLimit: emptyRateLimit,
  draft: "",

  selectPersona: (id) => set({ selectedPersonaId: id, draft: "" }),
  setMessages: (personaId, msgs) =>
    set((state) => ({ messages: { ...state.messages, [personaId]: msgs } })),
  appendMessage: (personaId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [personaId]: [...(state.messages[personaId] ?? []), msg],
      },
    })),
  setLoading: (personaId, loading) =>
    set((state) => ({ loading: { ...state.loading, [personaId]: loading } })),
  setRateLimit: (personaId, rl) =>
    set((state) => ({ rateLimit: { ...state.rateLimit, [personaId]: rl } })),
  setDraft: (draft) => set({ draft }),
  clearMessages: (personaId) =>
    set((state) => ({
      messages: { ...state.messages, [personaId]: [] },
    })),
}));
```

### 3.4 API Service

```typescript
// apps/frontend/src/features/persona/services/persona.service.ts
import apiClient from "../../../shared/lib/apiClient";
import { PersonaChatResponse, PersonaHistoryResponse } from "../types";

export const personaService = {
  async chat(dto: {
    personaId: string;
    message: string;
  }): Promise<PersonaChatResponse> {
    const { data } = await apiClient.post<PersonaChatResponse>(
      "/chat/persona/chat",
      dto,
    );
    return data;
  },

  async getHistory(personaId: string): Promise<PersonaHistoryResponse> {
    const { data } = await apiClient.get<PersonaHistoryResponse>(
      `/chat/persona/history/${personaId}`,
    );
    return data;
  },

  async clearHistory(personaId: string): Promise<{ deleted: number }> {
    const { data } = await apiClient.delete<{ deleted: number }>(
      `/chat/persona/history/${personaId}`,
    );
    return data;
  },
};
```

### 3.5 Hooks

```typescript
// apps/frontend/src/features/persona/hooks/usePersona.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { PersonaId, PERSONAS } from "@shared-utils";
import { personaService } from "../services/persona.service";
import { usePersonaStore } from "../store/usePersonaStore";
import { PersonaMessageItem } from "../types";
import crypto from "crypto";

export const usePersonaHistory = (personaId: PersonaId) => {
  const setMessages = usePersonaStore((s) => s.setMessages);

  return useQuery({
    queryKey: ["persona-history", personaId],
    queryFn: async () => {
      const data = await personaService.getHistory(personaId);
      setMessages(personaId, data.messages);
      return data;
    },
    staleTime: Infinity,
    retry: false,
  });
};

export const usePersonaChat = (personaId: PersonaId) => {
  const persona = PERSONAS[personaId];
  const appendMessage = usePersonaStore((s) => s.appendMessage);
  const setLoading = usePersonaStore((s) => s.setLoading);
  const setRateLimit = usePersonaStore((s) => s.setRateLimit);
  const setDraft = usePersonaStore((s) => s.setDraft);

  return useMutation({
    mutationFn: (message: string) =>
      personaService.chat({ personaId, message }),

    onMutate: (message) => {
      setLoading(personaId, true);
      const userMsg: PersonaMessageItem = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: message,
        toolUsed: null,
        createdAt: new Date().toISOString(),
      };
      appendMessage(personaId, userMsg);
      setDraft("");
    },

    onSettled: () => {
      setLoading(personaId, false);
    },

    onSuccess: (data) => {
      const aiMsg: PersonaMessageItem = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        toolUsed: data.toolUsed,
        createdAt: new Date().toISOString(),
      };
      appendMessage(personaId, aiMsg);
    },

    onError: (err) => {
      if (!axios.isAxiosError(err)) {
        // Show error as system message inline
        appendMessage(personaId, {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `${persona.name} is unavailable right now, try again in a moment`,
          toolUsed: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      const msg = (data?.message as string | undefined) ?? "";

      if (status === 429) {
        const secondsRemaining =
          (data?.secondsRemaining as number | undefined) ?? 0;
        setRateLimit(personaId, {
          blocked: true,
          secondsLeft: secondsRemaining,
        });
        toast(msg || "Please wait before sending another message", {
          position: "bottom-center",
          style: { background: "#f59e0b", color: "#fff" },
          duration: 3000,
        });
        // Auto-unblock after cooldown
        if (secondsRemaining > 0) {
          setTimeout(() => {
            setRateLimit(personaId, { blocked: false, secondsLeft: 0 });
          }, secondsRemaining * 1000);
        }
        return;
      }

      if (status === 400 && msg) {
        // Guardrail block — show inline as assistant message
        appendMessage(personaId, {
          id: `blocked-${Date.now()}`,
          role: "assistant",
          content: msg,
          toolUsed: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      appendMessage(personaId, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `${persona.name} is unavailable right now, try again in a moment`,
        toolUsed: null,
        createdAt: new Date().toISOString(),
      });
    },
  });
};

export const useClearPersonaHistory = (personaId: PersonaId) => {
  const queryClient = useQueryClient();
  const clearMessages = usePersonaStore((s) => s.clearMessages);

  return useMutation({
    mutationFn: () => personaService.clearHistory(personaId),
    onSuccess: () => {
      clearMessages(personaId);
      queryClient.removeQueries({ queryKey: ["persona-history", personaId] });
    },
  });
};
```

### 3.6 `/explore` Page

```tsx
// apps/frontend/app/explore/page.tsx
"use client";

import React from "react";
import { PersonaGrid } from "../../src/features/persona/components/PersonaGrid";
import { PersonaChat } from "../../src/features/persona/components/PersonaChat";
import { usePersonaStore } from "../../src/features/persona/store/usePersonaStore";
import { PersonaId, PERSONAS } from "@shared-utils";

export default function ExplorePage() {
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);
  const selectPersona = usePersonaStore((s) => s.selectPersona);

  const handleSelectPersona = (id: PersonaId, starterQuestion?: string) => {
    selectPersona(id);
    // starterQuestion is pre-filled by PersonaChat on mount if provided
    if (starterQuestion) {
      usePersonaStore.getState().setDraft(starterQuestion);
    }
  };

  if (selectedPersonaId) {
    return (
      <PersonaChat
        personaId={selectedPersonaId}
        onBack={() => selectPersona(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-foreground">AI Experts</h1>
          <p className="mt-2 text-muted-foreground">
            Chat with specialised AI agents powered by real-time web search
          </p>
        </div>
        <PersonaGrid onSelect={handleSelectPersona} />
      </div>
    </div>
  );
}
```

### 3.7 PersonaGrid Component

```tsx
// apps/frontend/src/features/persona/components/PersonaGrid.tsx
"use client";

import React from "react";
import { PersonaId, PERSONAS, PERSONA_IDS } from "@shared-utils";
import { PersonaCard } from "./PersonaCard";

interface PersonaGridProps {
  onSelect: (id: PersonaId, starterQuestion?: string) => void;
}

export const PersonaGrid = ({ onSelect }: PersonaGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {PERSONA_IDS.map((id) => (
        <PersonaCard key={id} persona={PERSONAS[id]} onSelect={onSelect} />
      ))}
    </div>
  );
};
```

### 3.8 PersonaCard Component

```tsx
// apps/frontend/src/features/persona/components/PersonaCard.tsx
"use client";

import React from "react";
import { PersonaId, PersonaConfig } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";
import { usePersonaStore } from "../store/usePersonaStore";

interface PersonaCardProps {
  persona: PersonaConfig;
  onSelect: (id: PersonaId, starterQuestion?: string) => void;
}

export const PersonaCard = ({ persona, onSelect }: PersonaCardProps) => {
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);
  const isSelected = selectedPersonaId === persona.id;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-2xl border bg-card p-6",
        "transition-all duration-200 hover:scale-[1.02] hover:shadow-lg",
        isSelected ? "ring-2" : "border-border",
      )}
      style={
        isSelected
          ? { ringColor: persona.colorHex, borderColor: persona.colorHex }
          : {}
      }
    >
      {/* Avatar + header */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${persona.colorHex}20` }}
        >
          {persona.emoji}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{persona.name}</h3>
            {persona.useWebSearch && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: persona.colorHex }}
                />
                Live search
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{persona.role}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-foreground/70 leading-relaxed line-clamp-2">
        {persona.description}
      </p>

      {/* Disclaimer badge */}
      {persona.disclaimer && (
        <div className="text-[11px] text-muted-foreground bg-secondary rounded-lg px-3 py-1.5">
          ⚠️ {persona.disclaimer}
        </div>
      )}

      {/* Starter questions */}
      <div className="flex flex-col gap-1.5">
        {persona.starterQuestions.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(persona.id, q)}
            className={cn(
              "text-left text-xs px-3 py-2 rounded-xl border border-border bg-secondary/50",
              "hover:bg-secondary hover:border-foreground/20 transition-colors truncate",
            )}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat now button */}
      <button
        type="button"
        onClick={() => onSelect(persona.id)}
        className="mt-auto w-full rounded-xl py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: persona.colorHex }}
      >
        Chat now
      </button>
    </div>
  );
};
```

### 3.9 PersonaChat Component

```tsx
// apps/frontend/src/features/persona/components/PersonaChat.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { PersonaId, PERSONAS } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";
import { usePersonaStore } from "../store/usePersonaStore";
import {
  usePersonaHistory,
  usePersonaChat,
  useClearPersonaHistory,
} from "../hooks/usePersona";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { PersonaThinkingIndicator } from "./PersonaThinkingIndicator";
import { StarterQuestionChips } from "./StarterQuestionChips";
import { ArrowLeft, RotateCcw, Send } from "lucide-react";

interface PersonaChatProps {
  personaId: PersonaId;
  onBack: () => void;
}

export const PersonaChat = ({ personaId, onBack }: PersonaChatProps) => {
  const persona = PERSONAS[personaId];
  const messages = usePersonaStore((s) => s.messages[personaId] ?? []);
  const loading = usePersonaStore((s) => s.loading[personaId] ?? false);
  const rateLimit = usePersonaStore((s) => s.rateLimit[personaId]);
  const draft = usePersonaStore((s) => s.draft);
  const setDraft = usePersonaStore((s) => s.setDraft);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    isLoading: historyLoading,
    isError: historyError,
    refetch,
  } = usePersonaHistory(personaId);
  const chatMutation = usePersonaChat(personaId);
  const clearMutation = useClearPersonaHistory(personaId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-fill draft from starter question set before mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || loading || rateLimit.blocked) return;
    chatMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="Back to persona list"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${persona.colorHex}20` }}
        >
          {persona.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {persona.name}
            </span>
            {persona.useWebSearch && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: persona.colorHex }}
                />
                Powered by real-time web search
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {persona.role}
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="New conversation"
          title="New conversation"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Disclaimer banner */}
      {persona.disclaimer && (
        <DisclaimerBanner
          text={persona.disclaimer}
          colorHex={persona.colorHex}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {historyLoading && (
          <div className="text-center text-sm text-muted-foreground">
            Loading history...
          </div>
        )}
        {historyError && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Couldn&apos;t load your conversation history
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm underline text-primary"
            >
              Retry
            </button>
          </div>
        )}

        {isEmpty && !historyLoading && !historyError && (
          <StarterQuestionChips
            persona={persona}
            onSelect={(q) => {
              setDraft(q);
              inputRef.current?.focus();
            }}
          />
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 mt-1"
                style={{ backgroundColor: `${persona.colorHex}20` }}
              >
                {persona.emoji}
              </div>
            )}
            <div className="flex flex-col gap-1 max-w-[75%]">
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border rounded-bl-sm",
                )}
                style={
                  msg.role === "assistant"
                    ? { borderColor: `${persona.colorHex}30` }
                    : {}
                }
              >
                {msg.content}
              </div>
              {msg.role === "assistant" && msg.toolUsed && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  {msg.toolUsed === "web_search"
                    ? "🔍 searched the web"
                    : "💬 from knowledge"}
                </span>
              )}
              {msg.role === "assistant" && persona.disclaimer && (
                <span className="text-[10px] text-muted-foreground ml-1 italic">
                  {persona.disclaimer}
                </span>
              )}
            </div>
          </div>
        ))}

        <PersonaThinkingIndicator personaId={personaId} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/80 backdrop-blur-md shrink-0">
        {rateLimit.blocked && (
          <p className="text-xs text-amber-600 mb-2 text-center">
            Please wait {rateLimit.secondsLeft}s before sending another message
          </p>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={persona.inputPlaceholder}
            rows={2}
            maxLength={600}
            className={cn(
              "flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3",
              "text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2",
              "focus:ring-primary/30 transition-all",
            )}
            disabled={loading || rateLimit.blocked}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || loading || rateLimit.blocked}
            className={cn(
              "p-3 rounded-xl text-white transition-all",
              !draft.trim() || loading || rateLimit.blocked
                ? "opacity-40 cursor-not-allowed"
                : "hover:opacity-90",
            )}
            style={{ backgroundColor: persona.colorHex }}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-right text-[10px] text-muted-foreground mt-1">
          {draft.length}/600
        </p>
      </div>
    </div>
  );
};
```

### 3.10 StarterQuestionChips Component

```tsx
// apps/frontend/src/features/persona/components/StarterQuestionChips.tsx
"use client";

import React from "react";
import { PersonaConfig } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";

interface StarterQuestionChipsProps {
  persona: PersonaConfig;
  onSelect: (question: string) => void;
}

export const StarterQuestionChips = ({
  persona,
  onSelect,
}: StarterQuestionChipsProps) => {
  return (
    <div className="flex flex-col items-center gap-4 py-12 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ backgroundColor: `${persona.colorHex}20` }}
      >
        {persona.emoji}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Chat with {persona.name}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Ask me anything or try one of these:
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-md">
        {persona.starterQuestions.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(q)}
            className={cn(
              "text-sm px-4 py-3 rounded-xl border border-border bg-card",
              "hover:bg-secondary transition-colors text-left",
            )}
            style={{ borderColor: `${persona.colorHex}30` }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
};
```

### 3.11 DisclaimerBanner Component

```tsx
// apps/frontend/src/features/persona/components/DisclaimerBanner.tsx
"use client";

import React from "react";

interface DisclaimerBannerProps {
  text: string;
  colorHex: string;
}

export const DisclaimerBanner = ({ text, colorHex }: DisclaimerBannerProps) => {
  return (
    <div
      className="px-4 py-2 text-[11px] text-center font-medium border-b"
      style={{
        backgroundColor: `${colorHex}10`,
        borderColor: `${colorHex}30`,
        color: colorHex,
      }}
    >
      ⚠️ {text}
    </div>
  );
};
```

### 3.12 PersonaThinkingIndicator Component

```tsx
// apps/frontend/src/features/persona/components/PersonaThinkingIndicator.tsx
"use client";

import React from "react";
import { PersonaId, PERSONAS } from "@shared-utils";
import { usePersonaStore } from "../store/usePersonaStore";

interface PersonaThinkingIndicatorProps {
  personaId: PersonaId;
}

export const PersonaThinkingIndicator = ({
  personaId,
}: PersonaThinkingIndicatorProps) => {
  const isLoading = usePersonaStore((s) => s.loading[personaId] ?? false);
  const persona = PERSONAS[personaId];

  if (!isLoading) return null;

  return (
    <div className="flex items-center gap-3 justify-start">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
        style={{ backgroundColor: `${persona.colorHex}20` }}
      >
        {persona.emoji}
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border text-sm text-muted-foreground">
        <span>{persona.name} is thinking</span>
        <span className="flex gap-0.5 ml-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full animate-bounce"
              style={{
                backgroundColor: persona.colorHex,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
};
```

### 3.13 Navbar Update

Add the `/explore` link to `apps/frontend/src/shared/components/Navbar.tsx`:

```typescript
// In the navItems array, add:
import { Sparkles } from "lucide-react";

const navItems = [
  { icon: Home, label: t("home"), href: "/chat" },
  { icon: Users, label: t("friends"), href: "/friends" },
  { icon: Sparkles, label: "AI Experts", href: "/explore" }, // ADD THIS
];
```

Also add `explore` to the i18n messages (`apps/frontend/messages/en.json`) if a translation key is needed, or use the inline string `"AI Experts"` directly.

### 3.14 Files to Create / Modify in Phase 3

```
apps/frontend/app/explore/page.tsx                                          — created
apps/frontend/src/features/persona/types.ts                                 — created
apps/frontend/src/features/persona/store/usePersonaStore.ts                 — created
apps/frontend/src/features/persona/services/persona.service.ts              — created
apps/frontend/src/features/persona/hooks/usePersona.ts                      — created
apps/frontend/src/features/persona/components/PersonaGrid.tsx               — created
apps/frontend/src/features/persona/components/PersonaCard.tsx               — created
apps/frontend/src/features/persona/components/PersonaChat.tsx               — created
apps/frontend/src/features/persona/components/StarterQuestionChips.tsx      — created
apps/frontend/src/features/persona/components/DisclaimerBanner.tsx          — created
apps/frontend/src/features/persona/components/PersonaThinkingIndicator.tsx  — created
apps/frontend/src/shared/components/Navbar.tsx                              — modified (add /explore nav item)
```

### 3.15 Test Cases

**Component tests** (`apps/frontend/tests/unit/`):

- [ ] `PersonaCard`: renders persona name, role, 3 starter question chips; clicking "Chat now" calls `onSelect` with personaId and no starter question; clicking a chip calls `onSelect` with personaId and the question text
- [ ] `PersonaCard`: shows "Live search" badge only for `useWebSearch: true` personas (not Sage)
- [ ] `PersonaCard`: shows disclaimer badge only for atlas and lex personas
- [ ] `PersonaThinkingIndicator`: renders null when `loading[personaId]` is false; renders persona name + animated dots when true
- [ ] `DisclaimerBanner`: renders disclaimer text with the persona colorHex applied
- [ ] `StarterQuestionChips`: renders all 3 questions; clicking one calls `onSelect` with correct text
- [ ] `PersonaChat`: renders history-load error state with retry button when `usePersonaHistory` errors; clicking retry calls `refetch`

**Hook tests:**

- [ ] `usePersonaChat`: on success, `appendMessage` is called twice (optimistic user msg + AI reply)
- [ ] `usePersonaChat`: on 429 error, `setRateLimit` is called with `{ blocked: true }` and a toast is shown
- [ ] `usePersonaChat`: on 400 blocked error, message is appended as assistant message inline (no toast)
- [ ] `usePersonaChat`: on 503 error, generic unavailable message appended as assistant message
- [ ] `useClearPersonaHistory`: on success, `clearMessages` called and query key removed

```bash
pnpm nx typecheck frontend
pnpm nx lint frontend
pnpm nx test frontend
```

---

## 4. Architecture Decisions

| #   | Decision                                                  | Options Considered                                                           | Choice                   | Rationale                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where do persona endpoints live?                          | New service vs extend chat-service                                           | Extend chat-service      | Groq, Tavily, and TavilyWebSearchService are already injectable there; zero new infrastructure                                                                                                                              |
| 2   | New `PersonaGroqAgentService` vs reuse `GroqAgentService` | Add method to existing                                                       | New service              | `GroqAgentService.run()` has a hardcoded system prompt and 4-tool set; adding a `runWithCustomPrompt()` overload would muddy the existing agent port interface. A dedicated service keeps concerns clean.                   |
| 3   | `PersonaMessage` collection vs reuse `Message`            | Share collection                                                             | Separate collection      | `Message` requires `conversationId`, participates in unread counts, and has reaction/reply/status fields meaningless for persona chats. A separate collection keeps queries simple and the schema honest.                   |
| 4   | Separate `PersonaRateLimiterService` vs extend existing   | Extend `AgentRateLimiterService`                                             | New service              | Existing service has a 10s cooldown with no hourly cap. Extending it with conditional branching would make both harder to test and maintain.                                                                                |
| 5   | History fetched by backend vs passed by frontend          | Frontend passes history                                                      | Backend reads from DB    | Consistent with `RunAiAgentUseCase` pattern; prevents history manipulation; frontend state is local-only optimistic display.                                                                                                |
| 6   | Shared PERSONAS constant location                         | `apps/*/constants.ts` (duplicated) vs `libs/shared-utils`                    | `libs/shared-utils`      | `@shared-utils` path alias is confirmed in `tsconfig.base.json`; both backend and frontend can import it without duplication. Single source of truth for system prompts, which must stay identical between implementations. |
| 7   | Web search tool set for personas                          | Full 4-tool set (weather, translate, URL, search) vs web_search only         | web_search only          | Personas answer factual questions and news — they have no use case for weather, translation, or URL summarisation tools. Restricting the tool set reduces Turn 1 model confusion and latency.                               |
| 8   | Optimistic UI for messages                                | Pessimistic (wait for response) vs optimistic (user msg appears immediately) | Optimistic user, real AI | User message is appended immediately on send to feel instant; AI reply appears on `onSuccess`. This matches the existing `useSendMessage` optimistic pattern.                                                               |
| 9   | Rate limit storage                                        | Redis vs in-memory Map                                                       | In-memory Map            | Same choice as `AgentRateLimiterService`. Persona rate limits reset on deploy (acceptable). Redis would add a round-trip on every message for a UX guardrail, not a billing-critical limit.                                 |
| 10  | `/explore` route                                          | `/home` vs `/explore`                                                        | `/explore`               | `/home` is semantically ambiguous; `/explore` signals discovery of AI personas clearly.                                                                                                                                     |

---

## 5. Open Questions

None — all decisions are resolved in Section 4.

---

## Acceptance Criteria

- [ ] Navigating to `/explore` shows a grid of all 5 persona cards with name, role, emoji, description, 3 starter question chips, and "Chat now" button
- [ ] Personas with `useWebSearch: true` (Nova, Atlas, Lex, Pulse) show the animated "Live search" pulse badge on their card and in the chat header
- [ ] Clicking a starter question chip pre-fills the chat input and navigates to that persona's chat view
- [ ] AI replies from web-search personas show "🔍 searched the web" badge; Sage replies show "💬 from knowledge" badge
- [ ] Atlas and Lex persona chat views show the disclaimer banner pinned above the message list and a small disclaimer below each AI message
- [ ] Conversation history persists across page navigations — returning to a persona shows previous messages loaded from the database
- [ ] "New conversation" button clears all messages from the UI and deletes them from the database (DELETE endpoint)
- [ ] Sending a message within the 5-second cooldown shows a rate-limit toast; after the hourly cap (20 messages) the message `"You've reached the hourly limit"` appears
- [ ] LLM failure (503) shows `"{Name} is unavailable right now, try again in a moment"` as an assistant message inline in the chat (not a toast crash)
- [ ] Code-generation guardrail blocks messages like "write me a function" for Nova/Atlas/Lex/Pulse but does NOT block them for Sage (Sage can discuss code concepts)

---

## Run after Phase 1

```bash
pnpm generate:types   # adds PersonaId, PersonaChatDto, PersonaChatResponse, PersonaHistoryResponse to @shared-types
```
