import { expect } from "chai";
import * as sinon from "sinon";
import { PersonaController } from "../../src/interfaces/controllers/persona.controller";
import { RunPersonaAgentUseCase } from "../../src/application/use-cases/run-persona-agent.use-case";
import { GetPersonaHistoryUseCase } from "../../src/application/use-cases/get-persona-history.use-case";
import { ClearPersonaHistoryUseCase } from "../../src/application/use-cases/clear-persona-history.use-case";
import { RequestWithUser } from "../../src/interfaces/request-with-user.interface";

function makeReq(userId: string): RequestWithUser {
  return { user: { id: userId } } as RequestWithUser;
}

describe("PersonaController", () => {
  let controller: PersonaController;
  let runAgentStub: sinon.SinonStubbedInstance<RunPersonaAgentUseCase>;
  let getHistoryStub: sinon.SinonStubbedInstance<GetPersonaHistoryUseCase>;
  let clearHistoryStub: sinon.SinonStubbedInstance<ClearPersonaHistoryUseCase>;

  beforeEach(() => {
    runAgentStub = {
      execute: sinon
        .stub()
        .resolves({ reply: "Hi", personaId: "nova", toolUsed: "web_search" }),
    } as unknown as sinon.SinonStubbedInstance<RunPersonaAgentUseCase>;

    getHistoryStub = {
      execute: sinon.stub().resolves({ personaId: "nova", messages: [] }),
    } as unknown as sinon.SinonStubbedInstance<GetPersonaHistoryUseCase>;

    clearHistoryStub = {
      execute: sinon.stub().resolves({ deleted: 3 }),
    } as unknown as sinon.SinonStubbedInstance<ClearPersonaHistoryUseCase>;

    controller = new PersonaController(
      runAgentStub as unknown as RunPersonaAgentUseCase,
      getHistoryStub as unknown as GetPersonaHistoryUseCase,
      clearHistoryStub as unknown as ClearPersonaHistoryUseCase,
    );
  });

  afterEach(() => sinon.restore());

  describe("POST chat", () => {
    it("should delegate to RunPersonaAgentUseCase with correct userId from JWT", async () => {
      const req = makeReq("user-42");
      const dto = { personaId: "nova" as const, message: "What is AI?" };

      const result = await controller.chat(req, dto);

      const executeCall = runAgentStub.execute as sinon.SinonStub;
      expect(executeCall.calledOnce).to.equal(true);
      expect(executeCall.firstCall.args[0]).to.deep.include({
        userId: "user-42",
        personaId: "nova",
        message: "What is AI?",
      });
      expect(result.reply).to.equal("Hi");
    });
  });

  describe("GET history/:personaId", () => {
    it("should delegate to GetPersonaHistoryUseCase with correct userId and personaId", async () => {
      const req = makeReq("user-99");

      const result = await controller.history(req, "atlas");

      const executeCall = getHistoryStub.execute as sinon.SinonStub;
      expect(executeCall.calledOnce).to.equal(true);
      expect(executeCall.firstCall.args[0]).to.equal("user-99");
      expect(executeCall.firstCall.args[1]).to.equal("atlas");
      expect(result.personaId).to.equal("nova"); // from stub
    });
  });

  describe("DELETE history/:personaId", () => {
    it("should delegate to ClearPersonaHistoryUseCase with correct userId and personaId", async () => {
      const req = makeReq("user-7");

      const result = await controller.clearHistory(req, "lex");

      const executeCall = clearHistoryStub.execute as sinon.SinonStub;
      expect(executeCall.calledOnce).to.equal(true);
      expect(executeCall.firstCall.args[0]).to.equal("user-7");
      expect(executeCall.firstCall.args[1]).to.equal("lex");
      expect(result.deleted).to.equal(3);
    });
  });
});
