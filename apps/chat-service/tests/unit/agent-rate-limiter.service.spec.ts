import { expect } from "chai";
import { AgentRateLimiterService } from "../../src/infrastructure/ai/agent-rate-limiter.service";

describe("AgentRateLimiterService (Unit)", () => {
  let service: AgentRateLimiterService;

  beforeEach(() => {
    service = new AgentRateLimiterService();
  });

  it("should allow the first call for a user", () => {
    const result = service.check("user-1");
    expect(result.allowed).to.equal(true);
  });

  it("should deny a second call within 10 seconds and return secondsRemaining", () => {
    service.check("user-2");
    const result = service.check("user-2");
    expect(result.allowed).to.equal(false);
    expect(result.secondsRemaining).to.be.greaterThan(0);
    expect(result.secondsRemaining).to.be.lessThanOrEqual(10);
  });

  it("should allow calls for different users independently", () => {
    service.check("user-a");
    const resultB = service.check("user-b");
    expect(resultB.allowed).to.equal(true);
  });

  it("should allow a second call after the 10-second window passes", async function () {
    // Use a shorter window by directly setting a past timestamp
    const limiter = service as unknown as {
      lastCallAt: Map<string, number>;
      windowMs: number;
    };

    // Record a call 11 seconds ago
    limiter.lastCallAt.set("user-past", Date.now() - 11_000);

    const result = service.check("user-past");
    expect(result.allowed).to.equal(true);
  });

  it("secondsRemaining should be at most 10 when denied", () => {
    service.check("user-x");
    const result = service.check("user-x");
    expect(result.allowed).to.equal(false);
    expect(result.secondsRemaining).to.be.at.most(10);
  });
});
