import { expect } from "chai";
import { PersonaRateLimiterService } from "../../src/infrastructure/ai/persona-rate-limiter.service";

describe("PersonaRateLimiterService", () => {
  let service: PersonaRateLimiterService;

  beforeEach(() => {
    service = new PersonaRateLimiterService();
  });

  it("should allow the first call for a new user", () => {
    const result = service.check("user-1");
    expect(result.allowed).to.equal(true);
  });

  it("should block the second call within 5 seconds (cooldown)", () => {
    service.check("user-1");
    const result = service.check("user-1");
    expect(result.allowed).to.equal(false);
    expect(result.reason).to.equal("cooldown");
    expect(result.secondsRemaining).to.be.at.least(1);
  });

  it("should allow a call after the cooldown window has passed", () => {
    const svc = new PersonaRateLimiterService();
    const userId = "cooldown-pass-user";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = (svc as unknown as { records: Map<string, unknown> })
      .records;
    records.set(userId, {
      lastCallAt: Date.now() - 6_000,
      hourlyCount: 1,
      hourWindowStart: Date.now(),
    });
    const result = svc.check(userId);
    expect(result.allowed).to.equal(true);
  });

  it("should allow the 20th call in the same hour (hourly cap not yet reached)", () => {
    const svc = new PersonaRateLimiterService();
    const userId = "high-volume-user";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = (svc as unknown as { records: Map<string, unknown> })
      .records;
    records.set(userId, {
      lastCallAt: 0,
      hourlyCount: 19,
      hourWindowStart: Date.now(),
    });
    const result = svc.check(userId);
    expect(result.allowed).to.equal(true);
  });

  it("should block the 21st call in the same hour for the same user by reaching hourly cap via the Map", () => {
    const svc = new PersonaRateLimiterService();
    const userId = "power-user";

    // Seed the internal Map to simulate 20 already-used slots with no cooldown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = (svc as unknown as { records: Map<string, unknown> })
      .records;
    records.set(userId, {
      lastCallAt: 0,
      hourlyCount: 20,
      hourWindowStart: Date.now(),
    });

    const result = svc.check(userId);
    expect(result.allowed).to.equal(false);
    expect(result.reason).to.equal("hourly");
    expect(result.secondsRemaining).to.be.at.least(1);
  });

  it("should reset the hourly count after the hour window expires", () => {
    const svc = new PersonaRateLimiterService();
    const userId = "reset-user";
    const oneHourAgo = Date.now() - 61 * 60 * 1000;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = (svc as unknown as { records: Map<string, unknown> })
      .records;
    records.set(userId, {
      lastCallAt: 0,
      hourlyCount: 20,
      hourWindowStart: oneHourAgo,
    });

    const result = svc.check(userId);
    expect(result.allowed).to.equal(true);
  });
});
