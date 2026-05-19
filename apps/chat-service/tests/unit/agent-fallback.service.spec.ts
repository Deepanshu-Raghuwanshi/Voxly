import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { AgentFallbackService } from "../../src/infrastructure/ai/agent-fallback.service";
import { GroqAgentService } from "../../src/infrastructure/ai/groq-agent.service";
import { CerebrasAgentService } from "../../src/infrastructure/ai/cerebras-agent.service";
import { AgentResult } from "../../src/application/ports/ai-agent.port";

const QUERY = "weather in Tokyo";
const CONTEXT: Array<{ role: "me" | "them"; content: string }> = [];
const USER_ID = "user-1";

const AGENT_RESULT: AgentResult = {
  reply: "It's 24°C in Tokyo",
  toolUsed: "get_weather",
};

function makeGroq(): sinon.SinonStubbedInstance<GroqAgentService> {
  return {
    run: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<GroqAgentService>;
}

function makeCerebras(): sinon.SinonStubbedInstance<CerebrasAgentService> {
  return {
    run: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<CerebrasAgentService>;
}

describe("AgentFallbackService (Unit)", () => {
  let groq: sinon.SinonStubbedInstance<GroqAgentService>;
  let cerebras: sinon.SinonStubbedInstance<CerebrasAgentService>;
  let service: AgentFallbackService;

  beforeEach(() => {
    groq = makeGroq();
    cerebras = makeCerebras();
    service = new AgentFallbackService(
      groq as unknown as GroqAgentService,
      cerebras as unknown as CerebrasAgentService,
    );
  });

  afterEach(() => sinon.restore());

  it("should call GroqAgentService.run first", async () => {
    groq.run.resolves(AGENT_RESULT);

    await service.run(QUERY, CONTEXT, USER_ID);

    expect(groq.run.calledOnce).to.equal(true);
  });

  it("should return Groq result without calling Cerebras when Groq succeeds", async () => {
    groq.run.resolves(AGENT_RESULT);

    const result = await service.run(QUERY, CONTEXT, USER_ID);

    expect(result).to.deep.equal(AGENT_RESULT);
    expect(cerebras.run.called).to.equal(false);
  });

  it("should call CerebrasAgentService when Groq throws", async () => {
    groq.run.rejects(
      new ServiceUnavailableException("AI provider unavailable"),
    );
    cerebras.run.resolves(AGENT_RESULT);

    const result = await service.run(QUERY, CONTEXT, USER_ID);

    expect(result).to.deep.equal(AGENT_RESULT);
    expect(cerebras.run.calledOnce).to.equal(true);
  });

  it("should throw ServiceUnavailableException when both providers fail", async () => {
    groq.run.rejects(new Error("groq error"));
    cerebras.run.rejects(new Error("cerebras error"));

    try {
      await service.run(QUERY, CONTEXT, USER_ID);
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
