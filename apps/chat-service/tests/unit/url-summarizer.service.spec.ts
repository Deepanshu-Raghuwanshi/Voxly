import { expect } from "chai";
import * as sinon from "sinon";
import { ConfigService } from "@nestjs/config";
import {
  GROQ_MODEL,
  REASONING_EFFORT,
} from "../../src/infrastructure/ai/ai-models";
import { UrlSummarizerService } from "../../src/infrastructure/ai/url-summarizer.service";

describe("UrlSummarizerService (Unit)", () => {
  afterEach(() => sinon.restore());

  it("summarizes extracted text using the shared Groq model", async () => {
    const service = new UrlSummarizerService(
      new ConfigService({ GROQ_API_KEY: "fake-test-key" }),
    );
    sinon
      .stub(globalThis, "fetch")
      .resolves(
        new Response("<p>An article with enough text to summarize.</p>"),
      );
    const groqService = service as unknown as {
      groq: { chat: { completions: { create: sinon.SinonStub } } };
    };
    const create = sinon.stub(groqService.groq.chat.completions, "create");
    create.resolves({ choices: [{ message: { content: "Article summary" } }] });

    expect(await service.summarize("https://example.com/article")).to.equal(
      "Article summary",
    );
    expect(create.firstCall.args[0]).to.include({
      model: GROQ_MODEL,
      reasoning_effort: REASONING_EFFORT,
      max_completion_tokens: 1024,
    });
    expect(create.firstCall.args[0].messages[1].content).to.equal(
      "An article with enough text to summarize.",
    );
  });
});
