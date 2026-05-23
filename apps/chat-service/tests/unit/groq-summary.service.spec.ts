import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GroqSummaryService } from "../../src/infrastructure/ai/groq-summary.service";

type InternalGroq = {
  chat: { completions: { create: sinon.SinonStub } };
};

function makeConfigService(apiKey = "test-api-key"): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

function makeResponse(content: string | null) {
  return { choices: [{ message: { content } }] };
}

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "me", content: "Hey, are you free Saturday?" },
  { role: "them", content: "Yes, Saturday works for me!" },
];

describe("GroqSummaryService (Unit)", () => {
  let service: GroqSummaryService;
  let createStub: sinon.SinonStub;

  beforeEach(() => {
    service = new GroqSummaryService(makeConfigService());
    createStub = sinon.stub(
      (service as unknown as { groq: InternalGroq }).groq.chat.completions,
      "create",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("prompt construction", () => {
    it("should include [CONV] and [/CONV] delimiters in the user message", async () => {
      createStub.resolves(makeResponse("• They discussed plans."));
      await service.summarize(MESSAGES);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("[CONV]");
      expect(userMsg.content).to.include("[/CONV]");
    });

    it('should map role "me" to "Me:" prefix in the transcript', async () => {
      createStub.resolves(makeResponse("• They discussed plans."));
      await service.summarize(MESSAGES);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("Me: Hey, are you free Saturday?");
    });

    it('should map role "them" to "Them:" prefix in the transcript', async () => {
      createStub.resolves(makeResponse("• They discussed plans."));
      await service.summarize(MESSAGES);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("Them: Yes, Saturday works for me!");
    });

    it("should use the correct model name", async () => {
      createStub.resolves(makeResponse("• summary"));
      await service.summarize(MESSAGES);

      const call = createStub.firstCall.args[0];
      expect(call.model).to.equal("meta-llama/llama-4-scout-17b-16e-instruct");
    });

    it("should send a system message as the first message", async () => {
      createStub.resolves(makeResponse("• summary"));
      await service.summarize(MESSAGES);

      const call = createStub.firstCall.args[0];
      const systemMsg = call.messages.find(
        (m: { role: string }) => m.role === "system",
      );
      expect(systemMsg).to.not.equal(undefined);
      expect(systemMsg.content).to.be.a("string").with.length.greaterThan(0);
    });
  });

  describe("response handling", () => {
    it("should return the trimmed response text on success", async () => {
      createStub.resolves(makeResponse("  • They agreed to meet Saturday.  "));
      const result = await service.summarize(MESSAGES);

      expect(result).to.equal("• They agreed to meet Saturday.");
    });

    it("should return the full multi-line bullet response as a single string", async () => {
      const bulletText = "• Point one.\n• Point two.\n• Point three.";
      createStub.resolves(makeResponse(bulletText));
      const result = await service.summarize(MESSAGES);

      expect(result).to.equal(bulletText);
    });
  });

  describe("error handling", () => {
    it("should throw ServiceUnavailableException when Groq returns an empty string", async () => {
      createStub.resolves(makeResponse(""));

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq returns null content", async () => {
      createStub.resolves(makeResponse(null));

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException on any Groq API error", async () => {
      createStub.rejects(new Error("network failure"));

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq times out", async () => {
      createStub.rejects(new Error("Connection timed out"));

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should re-throw ServiceUnavailableException without wrapping it", async () => {
      const original = new ServiceUnavailableException("already wrapped");
      createStub.rejects(original);

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.equal(original);
      }
    });
  });
});
