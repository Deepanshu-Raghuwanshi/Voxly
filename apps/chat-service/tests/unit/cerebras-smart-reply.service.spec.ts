import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CerebrasSmartReplyService } from "../../src/infrastructure/ai/cerebras-smart-reply.service";

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "them", content: "Are you free this weekend?" },
];

function makeConfigService(apiKey: string | undefined): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

describe("CerebrasSmartReplyService (Unit)", () => {
  afterEach(() => sinon.restore());

  describe("when CEREBRAS_API_KEY is not configured", () => {
    it("should throw ServiceUnavailableException immediately", async () => {
      const service = new CerebrasSmartReplyService(
        makeConfigService(undefined),
      );

      try {
        await service.generateReplies(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
