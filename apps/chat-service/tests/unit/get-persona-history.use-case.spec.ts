import { expect } from "chai";
import * as sinon from "sinon";
import { BadRequestException } from "@nestjs/common";
import { GetPersonaHistoryUseCase } from "../../src/application/use-cases/get-persona-history.use-case";
import { PersonaMessageRepository } from "../../src/application/ports/persona-message.repository";

const MOCK_MESSAGES = [
  {
    id: "msg-1",
    userId: "user-1",
    personaId: "nova" as const,
    role: "user" as const,
    content: "hello",
    toolUsed: null,
    createdAt: new Date(),
  },
  {
    id: "msg-2",
    userId: "user-1",
    personaId: "nova" as const,
    role: "assistant" as const,
    content: "hi there",
    toolUsed: "web_search",
    createdAt: new Date(),
  },
];

describe("GetPersonaHistoryUseCase", () => {
  let useCase: GetPersonaHistoryUseCase;
  let repoStub: sinon.SinonStubbedInstance<PersonaMessageRepository>;

  beforeEach(() => {
    repoStub = {
      save: sinon.stub(),
      findByUserAndPersona: sinon.stub().resolves(MOCK_MESSAGES),
      deleteByUserAndPersona: sinon.stub(),
    };
    useCase = new GetPersonaHistoryUseCase(
      repoStub as unknown as PersonaMessageRepository,
    );
  });

  afterEach(() => sinon.restore());

  describe("success path", () => {
    it("should return personaId and messages for a valid personaId", async () => {
      const result = await useCase.execute("user-1", "nova");

      expect(result.personaId).to.equal("nova");
      expect(result.messages).to.deep.equal(MOCK_MESSAGES);
    });

    it("should call findByUserAndPersona with correct userId, personaId, and limit 50", async () => {
      await useCase.execute("user-1", "nova");

      const findCall = repoStub.findByUserAndPersona as sinon.SinonStub;
      expect(findCall.calledOnce).to.equal(true);
      expect(findCall.firstCall.args[0]).to.equal("user-1");
      expect(findCall.firstCall.args[1]).to.equal("nova");
      expect(findCall.firstCall.args[2]).to.equal(50);
    });

    it("should return an empty messages array when no history exists", async () => {
      (repoStub.findByUserAndPersona as sinon.SinonStub).resolves([]);

      const result = await useCase.execute("user-1", "sage");

      expect(result.personaId).to.equal("sage");
      expect(result.messages).to.deep.equal([]);
    });

    it("should work for all valid personaIds", async () => {
      const personaIds = ["nova", "atlas", "lex", "sage", "pulse"] as const;

      for (const personaId of personaIds) {
        (repoStub.findByUserAndPersona as sinon.SinonStub).resolves([]);
        const result = await useCase.execute("user-1", personaId);
        expect(result.personaId).to.equal(personaId);
      }
    });
  });

  describe("personaId validation", () => {
    it("should throw BadRequestException for an unknown personaId", async () => {
      let caught: unknown;
      try {
        await useCase.execute("user-1", "unknown");
      } catch (e) {
        caught = e;
      }
      expect(caught).to.be.instanceOf(BadRequestException);
    });

    it("should throw BadRequestException for an empty personaId", async () => {
      let caught: unknown;
      try {
        await useCase.execute("user-1", "");
      } catch (e) {
        caught = e;
      }
      expect(caught).to.be.instanceOf(BadRequestException);
    });

    it("should NOT call repository when personaId is invalid", async () => {
      try {
        await useCase.execute("user-1", "invalid");
      } catch {
        // expected
      }
      expect(
        (repoStub.findByUserAndPersona as sinon.SinonStub).callCount,
      ).to.equal(0);
    });
  });
});
