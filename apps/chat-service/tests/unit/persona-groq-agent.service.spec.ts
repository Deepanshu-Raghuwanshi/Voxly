import { expect } from "chai";
import * as sinon from "sinon";
import { ConfigService } from "@nestjs/config";
import { PersonaGroqAgentService } from "../../src/infrastructure/ai/persona-groq-agent.service";
import { TavilyWebSearchService } from "../../src/infrastructure/ai/tavily-web-search.service";

type InternalGroq = {
  chat: { completions: { create: sinon.SinonStub } };
};

function makeConfigService(): ConfigService {
  return {
    get: sinon.stub().returns("test-groq-key"),
  } as unknown as ConfigService;
}

function makeWebSearch(): sinon.SinonStubbedInstance<TavilyWebSearchService> {
  return {
    search: sinon.stub().resolves("web result: quantum processors"),
  } as unknown as sinon.SinonStubbedInstance<TavilyWebSearchService>;
}

function directGroqResponse(content: string) {
  return { choices: [{ message: { content, tool_calls: undefined } }] };
}

function toolCallGroqResponse(query: string) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              function: {
                name: "web_search",
                arguments: JSON.stringify({ query }),
              },
            },
          ],
        },
      },
    ],
  };
}

const BASE_PARAMS = {
  query: "What is quantum computing?",
  context: [] as Array<{ role: "user" | "assistant"; content: string }>,
  userId: "user-1",
  systemPrompt: "You are a helpful assistant.",
  useWebSearch: false,
};

describe("PersonaGroqAgentService (Unit)", () => {
  let service: PersonaGroqAgentService;
  let createStub: sinon.SinonStub;
  let webSearchStub: sinon.SinonStubbedInstance<TavilyWebSearchService>;

  beforeEach(() => {
    webSearchStub = makeWebSearch();
    service = new PersonaGroqAgentService(
      makeConfigService(),
      webSearchStub as unknown as TavilyWebSearchService,
    );
    createStub = sinon.stub(
      (service as unknown as { groq: InternalGroq }).groq.chat.completions,
      "create",
    );
  });

  afterEach(() => sinon.restore());

  describe("single-turn mode (useWebSearch: false — Sage)", () => {
    it("should return the trimmed reply with toolUsed=direct", async () => {
      createStub.resolves(
        directGroqResponse("  Recursion is self-reference.  "),
      );
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: false });
      expect(result.reply).to.equal("Recursion is self-reference.");
      expect(result.toolUsed).to.equal("direct");
    });

    it("should include the system prompt, prior context, and query in the Groq call", async () => {
      createStub.resolves(directGroqResponse("answer"));
      const context = [{ role: "user" as const, content: "previous message" }];
      await service.run({
        ...BASE_PARAMS,
        useWebSearch: false,
        context,
        systemPrompt: "Custom system prompt",
      });
      const callArgs = createStub.firstCall.args[0];
      expect(callArgs.messages[0]).to.deep.include({
        role: "system",
        content: "Custom system prompt",
      });
      expect(callArgs.messages[1]).to.deep.include({
        role: "user",
        content: "previous message",
      });
      expect(callArgs.messages[callArgs.messages.length - 1]).to.deep.include({
        role: "user",
        content: BASE_PARAMS.query,
      });
    });

    it("should NOT call TavilyWebSearchService", async () => {
      createStub.resolves(directGroqResponse("answer"));
      await service.run({ ...BASE_PARAMS, useWebSearch: false });
      expect((webSearchStub.search as sinon.SinonStub).callCount).to.equal(0);
    });
  });

  describe("two-turn mode (useWebSearch: true) — model answers directly", () => {
    it("should return toolUsed=direct and NOT call search when Turn 1 returns content without a tool call", async () => {
      createStub.resolves(directGroqResponse("Direct knowledge answer"));
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: true });
      expect(result.reply).to.equal("Direct knowledge answer");
      expect(result.toolUsed).to.equal("direct");
      expect((webSearchStub.search as sinon.SinonStub).callCount).to.equal(0);
    });

    it("should issue a fallback Groq call when Turn 1 returns empty content with no tool call", async () => {
      createStub
        .onFirstCall()
        .resolves(directGroqResponse(""))
        .onSecondCall()
        .resolves(directGroqResponse("Fallback answer"));
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: true });
      expect(result.reply).to.equal("Fallback answer");
      expect(result.toolUsed).to.equal("direct");
      expect(createStub.callCount).to.equal(2);
    });
  });

  describe("two-turn mode (useWebSearch: true) — model calls web_search", () => {
    it("should call Tavily, run Turn 2 synthesis, and return toolUsed=web_search on success", async () => {
      createStub
        .onFirstCall()
        .resolves(toolCallGroqResponse("quantum computing breakthrough"))
        .onSecondCall()
        .resolves(
          directGroqResponse("Here is a synthesis of the search results."),
        );
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: true });
      expect(result.toolUsed).to.equal("web_search");
      expect(result.reply).to.equal(
        "Here is a synthesis of the search results.",
      );
      expect(
        (webSearchStub.search as sinon.SinonStub).calledWith(
          "quantum computing breakthrough",
        ),
      ).to.equal(true);
    });

    it("should fall back to a direct answer and append the real-time-data note when Tavily throws", async () => {
      (webSearchStub.search as sinon.SinonStub).rejects(
        new Error("Tavily timeout"),
      );
      createStub
        .onFirstCall()
        .resolves(toolCallGroqResponse("some query"))
        .onSecondCall()
        .resolves(directGroqResponse("Knowledge-only answer"));
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: true });
      expect(result.reply).to.include("Knowledge-only answer");
      expect(result.reply).to.include(
        "Note: I couldn't fetch real-time data for this",
      );
      expect(result.toolUsed).to.equal("direct");
    });

    it("should fall back to a direct answer and NOT call Tavily when tool_calls arguments are malformed JSON", async () => {
      createStub
        .onFirstCall()
        .resolves({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: "web_search",
                      arguments: "not-valid-json{{{",
                    },
                  },
                ],
              },
            },
          ],
        })
        .onSecondCall()
        .resolves(directGroqResponse("Fallback from malformed args"));
      const result = await service.run({ ...BASE_PARAMS, useWebSearch: true });
      expect(result.reply).to.equal("Fallback from malformed args");
      expect(result.toolUsed).to.equal("direct");
      expect((webSearchStub.search as sinon.SinonStub).callCount).to.equal(0);
    });
  });
});
