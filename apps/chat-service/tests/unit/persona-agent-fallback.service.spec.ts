import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { PersonaAgentFallbackService } from "../../src/infrastructure/ai/persona-agent-fallback.service";
import { PersonaGroqAgentService } from "../../src/infrastructure/ai/persona-groq-agent.service";
import { CerebrasPersonaAgentService } from "../../src/infrastructure/ai/cerebras-persona-agent.service";
import {
  PersonaRunParams,
  PersonaAgentResult,
} from "../../src/application/ports/persona-agent.port";

const PARAMS: PersonaRunParams = {
  query: "What is the latest AI news?",
  context: [],
  userId: "user-1",
  systemPrompt: "You are Nova.",
  useWebSearch: true,
};

const RESULT: PersonaAgentResult = {
  reply: "Here is the latest AI news",
  toolUsed: "web_search",
};

describe("PersonaAgentFallbackService (Unit)", () => {
  let groq: sinon.SinonStubbedInstance<PersonaGroqAgentService>;
  let cerebras: sinon.SinonStubbedInstance<CerebrasPersonaAgentService>;
  let service: PersonaAgentFallbackService;

  beforeEach(() => {
    groq = {
      run: sinon.stub(),
    } as unknown as sinon.SinonStubbedInstance<PersonaGroqAgentService>;
    cerebras = {
      run: sinon.stub(),
    } as unknown as sinon.SinonStubbedInstance<CerebrasPersonaAgentService>;

    service = new PersonaAgentFallbackService(
      groq as unknown as PersonaGroqAgentService,
      cerebras as unknown as CerebrasPersonaAgentService,
    );
  });

  afterEach(() => sinon.restore());

  it("should call PersonaGroqAgentService.run first", async () => {
    groq.run.resolves(RESULT);

    await service.run(PARAMS);

    expect(groq.run.calledOnce).to.equal(true);
  });

  it("should return the Groq result without calling Cerebras when Groq succeeds", async () => {
    groq.run.resolves(RESULT);

    const result = await service.run(PARAMS);

    expect(result).to.deep.equal(RESULT);
    expect(cerebras.run.called).to.equal(false);
  });

  it("should fall back to Cerebras when Groq throws", async () => {
    groq.run.rejects(
      new Error("404 The model does not exist or you do not have access to it"),
    );
    cerebras.run.resolves(RESULT);

    const result = await service.run(PARAMS);

    expect(result).to.deep.equal(RESULT);
    expect(cerebras.run.calledOnce).to.equal(true);
  });

  it("should fall back to Cerebras when Groq is rate-limited", async () => {
    groq.run.rejects(new Error("rate_limit_exceeded"));
    cerebras.run.resolves(RESULT);

    const result = await service.run(PARAMS);

    expect(result).to.deep.equal(RESULT);
    expect(cerebras.run.calledOnce).to.equal(true);
  });

  it("should pass the same params through to the fallback provider", async () => {
    groq.run.rejects(new Error("groq error"));
    cerebras.run.resolves(RESULT);

    await service.run(PARAMS);

    expect(cerebras.run.firstCall.args[0]).to.deep.equal(PARAMS);
  });

  it("should throw ServiceUnavailableException when both providers fail", async () => {
    groq.run.rejects(new Error("groq error"));
    cerebras.run.rejects(new Error("cerebras error"));

    try {
      await service.run(PARAMS);
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
