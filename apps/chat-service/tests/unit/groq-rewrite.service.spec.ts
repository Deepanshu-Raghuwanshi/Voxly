import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GroqRewriteService } from "../../src/infrastructure/ai/groq-rewrite.service";
import {
  GROQ_MODEL,
  REASONING_EFFORT,
} from "../../src/infrastructure/ai/ai-models";

type InternalGroq = {
  chat: { completions: { create: sinon.SinonStub } };
};

function makeConfigService(apiKey = "test-api-key"): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

function makeResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("GroqRewriteService (Unit)", () => {
  let service: GroqRewriteService;
  let createStub: sinon.SinonStub;

  beforeEach(() => {
    service = new GroqRewriteService(makeConfigService());
    createStub = sinon.stub(
      (service as unknown as { groq: InternalGroq }).groq.chat.completions,
      "create",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("success path", () => {
    it("should call Groq and return trimmed response text", async () => {
      createStub.resolves(makeResponse("  Fixed text.  "));

      const result = await service.rewrite("helo world", "fix-grammar");

      expect(result).to.equal("Fixed text.");
      expect(createStub.calledOnce).to.equal(true);
      expect(createStub.firstCall.args[0]).to.include({
        model: GROQ_MODEL,
        reasoning_effort: REASONING_EFFORT,
        max_completion_tokens: 2048,
      });
    });

    it("should include the input text in the user message sent to Groq", async () => {
      createStub.resolves(makeResponse("ok"));

      await service.rewrite("my draft", "professional");

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("my draft");
    });

    it("should wrap the input in [MSG]/[/MSG] delimiters", async () => {
      createStub.resolves(makeResponse("ok"));

      await service.rewrite("hello there", "casual");

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("[MSG]");
      expect(userMsg.content).to.include("[/MSG]");
    });

    it("should use a different prompt for each tone", async () => {
      createStub.resolves(makeResponse("ok"));
      await service.rewrite("hello", "casual");
      const casualMsg = createStub.firstCall.args[0].messages.find(
        (m: { role: string }) => m.role === "user",
      ).content;

      createStub.reset();
      createStub.resolves(makeResponse("ok"));
      await service.rewrite("hello", "shorter");
      const shorterMsg = createStub.firstCall.args[0].messages.find(
        (m: { role: string }) => m.role === "user",
      ).content;

      expect(casualMsg).to.not.equal(shorterMsg);
    });

    it("should pass a system message to Groq", async () => {
      createStub.resolves(makeResponse("ok"));

      await service.rewrite("test", "longer");

      const call = createStub.firstCall.args[0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === "system",
      );
      expect(systemMsg).to.not.equal(undefined);
      expect(systemMsg.content)
        .to.be.a("string")
        .and.have.length.greaterThan(0);
    });

    it("should handle all five supported tones without throwing", async () => {
      const tones = [
        "fix-grammar",
        "professional",
        "casual",
        "shorter",
        "longer",
      ] as const;

      for (const tone of tones) {
        createStub.reset();
        createStub.resolves(makeResponse("rewritten"));
        const result = await service.rewrite("some text", tone);
        expect(result).to.equal("rewritten");
      }
    });
  });

  describe("error handling", () => {
    it("should throw ServiceUnavailableException on any Groq API error", async () => {
      createStub.rejects(new Error("network failure"));
      try {
        await service.rewrite("test", "fix-grammar");
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq times out", async () => {
      createStub.rejects(new Error("Connection timed out"));
      try {
        await service.rewrite("test", "fix-grammar");
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException on authentication failure", async () => {
      createStub.rejects(new Error("Invalid API key"));
      try {
        await service.rewrite("test", "professional");
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
