import { expect } from "chai";
import * as sinon from "sinon";
import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CerebrasSummaryService } from "../../src/infrastructure/ai/cerebras-summary.service";

const MESSAGES: Array<{ role: "me" | "them"; content: string }> = [
  { role: "me", content: "Are you free Saturday?" },
  { role: "them", content: "Yes, Saturday works!" },
];

function makeConfigService(apiKey: string | undefined): ConfigService {
  return { get: sinon.stub().returns(apiKey) } as unknown as ConfigService;
}

describe("CerebrasSummaryService (Unit)", () => {
  afterEach(() => sinon.restore());

  describe("when CEREBRAS_API_KEY is not configured", () => {
    it("should throw ServiceUnavailableException immediately", async () => {
      const service = new CerebrasSummaryService(makeConfigService(undefined));

      try {
        await service.summarize(MESSAGES);
        expect.fail("Should have thrown ServiceUnavailableException");
      } catch (err) {
        expect(err).to.be.instanceOf(ServiceUnavailableException);
      }
    });
  });
});
