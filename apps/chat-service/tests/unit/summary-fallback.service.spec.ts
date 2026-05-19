import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { SummaryFallbackService } from "../../src/infrastructure/ai/summary-fallback.service";
import { GroqSummaryService } from "../../src/infrastructure/ai/groq-summary.service";
import { CerebrasSummaryService } from "../../src/infrastructure/ai/cerebras-summary.service";

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "me", content: "Let's meet tomorrow" },
  { role: "them", content: "Sure, what time?" },
];

function makeGroq(): sinon.SinonStubbedInstance<GroqSummaryService> {
  return {
    summarize: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<GroqSummaryService>;
}

function makeCerebras(): sinon.SinonStubbedInstance<CerebrasSummaryService> {
  return {
    summarize: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<CerebrasSummaryService>;
}

describe("SummaryFallbackService (Unit)", () => {
  let groq: sinon.SinonStubbedInstance<GroqSummaryService>;
  let cerebras: sinon.SinonStubbedInstance<CerebrasSummaryService>;
  let service: SummaryFallbackService;

  beforeEach(() => {
    groq = makeGroq();
    cerebras = makeCerebras();
    service = new SummaryFallbackService(
      groq as unknown as GroqSummaryService,
      cerebras as unknown as CerebrasSummaryService,
    );
  });

  afterEach(() => sinon.restore());

  it("should call GroqSummaryService.summarize first", async () => {
    groq.summarize.resolves("• Summary bullet");

    await service.summarize(MESSAGES);

    expect(groq.summarize.calledOnce).to.equal(true);
  });

  it("should return Groq result without calling Cerebras when Groq succeeds", async () => {
    groq.summarize.resolves("• Summary bullet");

    const result = await service.summarize(MESSAGES);

    expect(result).to.equal("• Summary bullet");
    expect(cerebras.summarize.called).to.equal(false);
  });

  it("should call CerebrasSummaryService when Groq throws", async () => {
    groq.summarize.rejects(
      new ServiceUnavailableException("AI provider unavailable"),
    );
    cerebras.summarize.resolves("• Cerebras summary");

    const result = await service.summarize(MESSAGES);

    expect(result).to.equal("• Cerebras summary");
    expect(cerebras.summarize.calledOnce).to.equal(true);
  });

  it("should throw ServiceUnavailableException when both providers fail", async () => {
    groq.summarize.rejects(new Error("groq error"));
    cerebras.summarize.rejects(new Error("cerebras error"));

    try {
      await service.summarize(MESSAGES);
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
