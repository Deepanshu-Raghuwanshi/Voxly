import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { SmartReplyFallbackService } from "../../src/infrastructure/ai/smart-reply-fallback.service";
import { GroqSmartReplyService } from "../../src/infrastructure/ai/groq-smart-reply.service";
import { CerebrasSmartReplyService } from "../../src/infrastructure/ai/cerebras-smart-reply.service";

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "them", content: "Are you free this weekend?" },
];

const THREE_REPLIES = ["Yes, I'm free!", "Sorry, I'm busy", "Let me check"];

function makeGroq(): sinon.SinonStubbedInstance<GroqSmartReplyService> {
  return {
    generateReplies: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<GroqSmartReplyService>;
}

function makeCerebras(): sinon.SinonStubbedInstance<CerebrasSmartReplyService> {
  return {
    generateReplies: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<CerebrasSmartReplyService>;
}

describe("SmartReplyFallbackService (Unit)", () => {
  let groq: sinon.SinonStubbedInstance<GroqSmartReplyService>;
  let cerebras: sinon.SinonStubbedInstance<CerebrasSmartReplyService>;
  let service: SmartReplyFallbackService;

  beforeEach(() => {
    groq = makeGroq();
    cerebras = makeCerebras();
    service = new SmartReplyFallbackService(
      groq as unknown as GroqSmartReplyService,
      cerebras as unknown as CerebrasSmartReplyService,
    );
  });

  afterEach(() => sinon.restore());

  it("should call GroqSmartReplyService.generateReplies first", async () => {
    groq.generateReplies.resolves(THREE_REPLIES);

    await service.generateReplies(MESSAGES);

    expect(groq.generateReplies.calledOnce).to.equal(true);
  });

  it("should return Groq result without calling Cerebras when Groq succeeds", async () => {
    groq.generateReplies.resolves(THREE_REPLIES);

    const result = await service.generateReplies(MESSAGES);

    expect(result).to.deep.equal(THREE_REPLIES);
    expect(cerebras.generateReplies.called).to.equal(false);
  });

  it("should call CerebrasSmartReplyService when Groq throws a rate-limit error", async () => {
    groq.generateReplies.rejects(new Error("rate_limit_exceeded"));
    cerebras.generateReplies.resolves(THREE_REPLIES);

    const result = await service.generateReplies(MESSAGES);

    expect(result).to.deep.equal(THREE_REPLIES);
    expect(cerebras.generateReplies.calledOnce).to.equal(true);
  });

  it("should call Cerebras when Groq throws any error", async () => {
    groq.generateReplies.rejects(new Error("network timeout"));
    cerebras.generateReplies.resolves(THREE_REPLIES);

    const result = await service.generateReplies(MESSAGES);

    expect(result).to.deep.equal(THREE_REPLIES);
  });

  it("should throw ServiceUnavailableException when both providers fail", async () => {
    groq.generateReplies.rejects(new Error("groq error"));
    cerebras.generateReplies.rejects(new Error("cerebras error"));

    try {
      await service.generateReplies(MESSAGES);
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
