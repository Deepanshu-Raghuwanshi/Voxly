import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CerebrasRewriteService } from "../../src/infrastructure/ai/cerebras-rewrite.service";

function makeConfigService(apiKey: string | undefined): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

describe("CerebrasRewriteService (Unit)", () => {
  afterEach(() => sinon.restore());

  describe("when CEREBRAS_API_KEY is not configured", () => {
    it("should throw ServiceUnavailableException immediately", async () => {
      const service = new CerebrasRewriteService(makeConfigService(undefined));

      try {
        await service.rewrite("Hello there", "professional");
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
