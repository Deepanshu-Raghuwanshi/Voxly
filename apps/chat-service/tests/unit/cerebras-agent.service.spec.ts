import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CerebrasAgentService } from "../../src/infrastructure/ai/cerebras-agent.service";

function makeConfigService(apiKey: string | undefined): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

describe("CerebrasAgentService (Unit)", () => {
  afterEach(() => sinon.restore());

  describe("when CEREBRAS_API_KEY is not configured", () => {
    it("should throw ServiceUnavailableException immediately", async () => {
      const service = new CerebrasAgentService(
        makeConfigService(undefined),
        null as never,
        null as never,
        null as never,
      );

      try {
        await service.run("What is the weather?", [], "user-1");
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
