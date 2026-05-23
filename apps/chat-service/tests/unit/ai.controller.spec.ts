import { expect } from "chai";
import * as sinon from "sinon";
import { AiController } from "../../src/interfaces/controllers/ai.controller";
import { RewriteMessageUseCase } from "../../src/application/use-cases/rewrite-message.use-case";
import { GenerateSmartRepliesUseCase } from "../../src/application/use-cases/generate-smart-replies.use-case";
import { SummarizeConversationUseCase } from "../../src/application/use-cases/summarize-conversation.use-case";
import { AiSummarizeDto } from "../../src/application/dto/ai-summarize.dto";
import { RunAiAgentUseCase } from "../../src/application/use-cases/run-ai-agent.use-case";
import { RequestWithUser } from "../../src/interfaces/request-with-user.interface";

function makeReq(userId = "user-1"): RequestWithUser {
  return { user: { id: userId, email: "user@example.com" } } as RequestWithUser;
}

describe("AiController — summarize (Unit)", () => {
  let controller: AiController;
  let summarizeUseCase: { execute: sinon.SinonStub };

  beforeEach(() => {
    summarizeUseCase = { execute: sinon.stub() };

    controller = new AiController(
      {} as unknown as RewriteMessageUseCase,
      {} as unknown as GenerateSmartRepliesUseCase,
      summarizeUseCase as unknown as SummarizeConversationUseCase,
      {} as unknown as RunAiAgentUseCase,
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should delegate to SummarizeConversationUseCase with userId, conversationId, and limit", async () => {
    summarizeUseCase.execute.resolves({ summary: "• They discussed plans." });

    const dto = { conversationId: "conv-uuid", limit: 25 } as AiSummarizeDto;
    await controller.summarize(makeReq("user-1"), dto);

    expect(summarizeUseCase.execute.calledOnce).to.equal(true);
    const args = summarizeUseCase.execute.firstCall.args[0];
    expect(args.userId).to.equal("user-1");
    expect(args.conversationId).to.equal("conv-uuid");
    expect(args.limit).to.equal(25);
  });

  it("should return { summary } from the use case", async () => {
    summarizeUseCase.execute.resolves({
      summary: "• They agreed on Saturday.",
    });

    const dto = { conversationId: "conv-uuid", limit: 50 } as AiSummarizeDto;
    const result = await controller.summarize(makeReq(), dto);

    expect(result).to.deep.equal({ summary: "• They agreed on Saturday." });
  });

  it("should pass undefined limit when dto.limit is not provided", async () => {
    summarizeUseCase.execute.resolves({ summary: "• summary" });

    const dto = { conversationId: "conv-uuid" } as AiSummarizeDto;
    await controller.summarize(makeReq(), dto);

    const args = summarizeUseCase.execute.firstCall.args[0];
    expect(args.limit).to.equal(undefined);
  });

  it("should propagate exceptions thrown by the use case", async () => {
    const error = new Error("use case failed");
    summarizeUseCase.execute.rejects(error);

    try {
      await controller.summarize(makeReq(), {
        conversationId: "conv-uuid",
      } as AiSummarizeDto);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).to.equal(error);
    }
  });
});
