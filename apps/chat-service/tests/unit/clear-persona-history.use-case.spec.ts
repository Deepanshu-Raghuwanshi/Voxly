import { expect } from "chai";
import * as sinon from "sinon";
import { BadRequestException } from "@nestjs/common";
import { ClearPersonaHistoryUseCase } from "../../src/application/use-cases/clear-persona-history.use-case";
import { PersonaMessageRepository } from "../../src/application/ports/persona-message.repository";

describe("ClearPersonaHistoryUseCase", () => {
  let useCase: ClearPersonaHistoryUseCase;
  let repoStub: sinon.SinonStubbedInstance<PersonaMessageRepository>;

  beforeEach(() => {
    repoStub = {
      save: sinon.stub(),
      findByUserAndPersona: sinon.stub(),
      deleteByUserAndPersona: sinon.stub().resolves(5),
    } as unknown as sinon.SinonStubbedInstance<PersonaMessageRepository>;
    useCase = new ClearPersonaHistoryUseCase(
      repoStub as unknown as PersonaMessageRepository,
    );
  });

  afterEach(() => sinon.restore());

  describe("success path", () => {
    it("should return the number of deleted messages", async () => {
      const result = await useCase.execute("user-1", "nova");

      expect(result.deleted).to.equal(5);
    });

    it("should call deleteByUserAndPersona with correct userId and personaId", async () => {
      await useCase.execute("user-1", "nova");

      const deleteCall = repoStub.deleteByUserAndPersona as sinon.SinonStub;
      expect(deleteCall.calledOnce).to.equal(true);
      expect(deleteCall.firstCall.args[0]).to.equal("user-1");
      expect(deleteCall.firstCall.args[1]).to.equal("nova");
    });

    it("should return deleted=0 when no history existed", async () => {
      (repoStub.deleteByUserAndPersona as sinon.SinonStub).resolves(0);

      const result = await useCase.execute("user-1", "sage");

      expect(result.deleted).to.equal(0);
    });

    it("should work for all valid personaIds", async () => {
      const personaIds = ["nova", "atlas", "lex", "sage", "pulse"] as const;

      for (const personaId of personaIds) {
        (repoStub.deleteByUserAndPersona as sinon.SinonStub).resolves(1);
        const result = await useCase.execute("user-1", personaId);
        expect(result.deleted).to.equal(1);
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
        (repoStub.deleteByUserAndPersona as sinon.SinonStub).callCount,
      ).to.equal(0);
    });
  });
});
