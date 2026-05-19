import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { RewriteFallbackService } from "../../src/infrastructure/ai/rewrite-fallback.service";
import { GroqRewriteService } from "../../src/infrastructure/ai/groq-rewrite.service";
import { CerebrasRewriteService } from "../../src/infrastructure/ai/cerebras-rewrite.service";

function makeGroq(): sinon.SinonStubbedInstance<GroqRewriteService> {
  return {
    rewrite: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<GroqRewriteService>;
}

function makeCerebras(): sinon.SinonStubbedInstance<CerebrasRewriteService> {
  return {
    rewrite: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<CerebrasRewriteService>;
}

describe("RewriteFallbackService (Unit)", () => {
  let groq: sinon.SinonStubbedInstance<GroqRewriteService>;
  let cerebras: sinon.SinonStubbedInstance<CerebrasRewriteService>;
  let service: RewriteFallbackService;

  beforeEach(() => {
    groq = makeGroq();
    cerebras = makeCerebras();
    service = new RewriteFallbackService(
      groq as unknown as GroqRewriteService,
      cerebras as unknown as CerebrasRewriteService,
    );
  });

  afterEach(() => sinon.restore());

  it("should call GroqRewriteService.rewrite first", async () => {
    groq.rewrite.resolves("rewritten text");

    await service.rewrite("hello", "casual");

    expect(groq.rewrite.calledOnce).to.equal(true);
  });

  it("should return Groq result without calling Cerebras when Groq succeeds", async () => {
    groq.rewrite.resolves("rewritten text");

    const result = await service.rewrite("hello", "casual");

    expect(result).to.equal("rewritten text");
    expect(cerebras.rewrite.called).to.equal(false);
  });

  it("should call CerebrasRewriteService when Groq throws", async () => {
    groq.rewrite.rejects(
      new ServiceUnavailableException("AI provider unavailable"),
    );
    cerebras.rewrite.resolves("cerebras rewrite");

    const result = await service.rewrite("hello", "professional");

    expect(result).to.equal("cerebras rewrite");
    expect(cerebras.rewrite.calledOnce).to.equal(true);
  });

  it("should throw ServiceUnavailableException when both providers fail", async () => {
    groq.rewrite.rejects(new Error("groq error"));
    cerebras.rewrite.rejects(new Error("cerebras error"));

    try {
      await service.rewrite("hello", "shorter");
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
