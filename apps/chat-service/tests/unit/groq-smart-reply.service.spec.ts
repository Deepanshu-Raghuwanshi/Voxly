import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GroqSmartReplyService } from "../../src/infrastructure/ai/groq-smart-reply.service";
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

function makeResponse(content: string | null) {
  return { choices: [{ message: { content } }] };
}

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "them", content: "Are you free this weekend?" },
];

const FIVE_LINE_RESPONSE =
  "Yes, I'm free!\nSorry, I'm busy\nLet me check\nSounds great!\nNot this time";
const THREE_LINE_RESPONSE = "Yes, I'm free!\nSorry, I'm busy\nLet me check";

describe("GroqSmartReplyService (Unit)", () => {
  let service: GroqSmartReplyService;
  let createStub: sinon.SinonStub;

  beforeEach(() => {
    service = new GroqSmartReplyService(makeConfigService());
    createStub = sinon.stub(
      (service as unknown as { groq: InternalGroq }).groq.chat.completions,
      "create",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("prompt construction", () => {
    it("should include [CONV] and [/CONV] delimiters in the user message sent to Groq", async () => {
      createStub.resolves(makeResponse(FIVE_LINE_RESPONSE));
      await service.generateReplies(MESSAGES);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("[CONV]");
      expect(userMsg.content).to.include("[/CONV]");
    });

    it('should map role "me" to "Me:" in the prompt', async () => {
      createStub.resolves(makeResponse(FIVE_LINE_RESPONSE));
      const messages = [
        { role: "me" as const, content: "Hey!" },
        { role: "them" as const, content: "Hi there" },
      ];
      await service.generateReplies(messages);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("Me: Hey!");
    });

    it('should map role "them" to "Them:" in the prompt', async () => {
      createStub.resolves(makeResponse(FIVE_LINE_RESPONSE));
      await service.generateReplies(MESSAGES);

      const call = createStub.firstCall.args[0];
      const userMsg = call.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMsg.content).to.include("Them: Are you free this weekend?");
    });
  });

  describe("response parsing", () => {
    it("should return exactly 3 strings from the first 3 valid lines when Groq returns 5", async () => {
      createStub.resolves(makeResponse(FIVE_LINE_RESPONSE));
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.have.length(3);
      expect(result[0]).to.equal("Yes, I'm free!");
      expect(result[1]).to.equal("Sorry, I'm busy");
      expect(result[2]).to.equal("Let me check");
    });

    it("should return exactly 3 strings when Groq returns exactly 3 valid lines", async () => {
      createStub.resolves(makeResponse(THREE_LINE_RESPONSE));
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.have.length(3);
      expect(createStub.firstCall.args[0]).to.include({
        model: GROQ_MODEL,
        reasoning_effort: REASONING_EFFORT,
        max_completion_tokens: 512,
      });
    });

    it("should throw ServiceUnavailableException when Groq returns only 1 valid line", async () => {
      createStub.resolves(makeResponse("Sure thing"));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq returns only 2 valid lines", async () => {
      createStub.resolves(makeResponse("Sure thing\nCan't make it"));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should strip leading bullets and numbers from Groq output", async () => {
      createStub.resolves(
        makeResponse(
          "1. Yes, I'm free!\n- Sorry, I'm busy\n* Let me check\n• Sounds great!\n2. Not this time",
        ),
      );
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.deep.equal([
        "Yes, I'm free!",
        "Sorry, I'm busy",
        "Let me check",
      ]);
    });

    it("should skip lines shorter than 3 characters and still return 3 from remaining", async () => {
      createStub.resolves(
        makeResponse(
          "I\nYes, I'll be there!\nNo\nSounds great to me!\nLet me check",
        ),
      );
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.have.length(3);
      expect(result[0]).to.equal("Yes, I'll be there!");
      expect(result[1]).to.equal("Sounds great to me!");
      expect(result[2]).to.equal("Let me check");
    });

    it("should throw ServiceUnavailableException when all lines are too short", async () => {
      createStub.resolves(makeResponse("I\nNo\nOk"));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should filter out blank lines from Groq response", async () => {
      createStub.resolves(makeResponse("Reply 1\n\nReply 2\n\nReply 3"));
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.have.length(3);
      expect(result).to.deep.equal(["Reply 1", "Reply 2", "Reply 3"]);
    });

    it("should truncate at 3 when Groq returns more than 3 valid lines", async () => {
      createStub.resolves(
        makeResponse("Reply 1\nReply 2\nReply 3\nReply 4\nReply 5"),
      );
      const result = await service.generateReplies(MESSAGES);

      expect(result).to.have.length(3);
      expect(result[2]).to.equal("Reply 3");
    });
  });

  describe("error handling", () => {
    it("should throw ServiceUnavailableException on any Groq API error", async () => {
      createStub.rejects(new Error("network failure"));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq returns null content", async () => {
      createStub.resolves(makeResponse(null));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });

    it("should throw ServiceUnavailableException when Groq times out", async () => {
      createStub.rejects(new Error("Connection timed out"));
      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
