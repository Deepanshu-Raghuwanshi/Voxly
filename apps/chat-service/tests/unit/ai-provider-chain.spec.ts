import { expect } from "chai";
import * as sinon from "sinon";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  isProviderRateLimitError,
  runWithFallbackChain,
} from "../../src/infrastructure/ai/ai-provider-chain";

function makeLogger(): Logger {
  return {
    warn: sinon.stub(),
    log: sinon.stub(),
    error: sinon.stub(),
  } as unknown as Logger;
}

describe("isProviderRateLimitError", () => {
  it("should return true for rate_limit_exceeded", () => {
    expect(isProviderRateLimitError(new Error("rate_limit_exceeded"))).to.equal(
      true,
    );
  });

  it("should return true for 'rate limit reached for model' (case-insensitive)", () => {
    expect(
      isProviderRateLimitError(new Error("Rate limit reached for model llama")),
    ).to.equal(true);
  });

  it("should return true for 'tokens per day'", () => {
    expect(
      isProviderRateLimitError(new Error("exceeded tokens per day limit")),
    ).to.equal(true);
  });

  it("should return true for 'quota exceeded'", () => {
    expect(
      isProviderRateLimitError(new Error("quota exceeded for this key")),
    ).to.equal(true);
  });

  it("should return false for a generic error", () => {
    expect(isProviderRateLimitError(new Error("network failure"))).to.equal(
      false,
    );
  });

  it("should return false for non-Error values", () => {
    expect(isProviderRateLimitError("rate_limit_exceeded")).to.equal(false);
    expect(isProviderRateLimitError(null)).to.equal(false);
    expect(isProviderRateLimitError(429)).to.equal(false);
  });
});

describe("runWithFallbackChain", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  afterEach(() => sinon.restore());

  it("should return first provider result when it succeeds", async () => {
    const first = sinon.stub().resolves("first-result");
    const second = sinon.stub().resolves("second-result");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(result).to.equal("first-result");
  });

  it("should not call second provider when first succeeds", async () => {
    const first = sinon.stub().resolves("ok");
    const second = sinon.stub().resolves("ok2");

    await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(second.called).to.equal(false);
  });

  it("should fall back to second provider when first throws rate_limit_exceeded", async () => {
    const first = sinon.stub().rejects(new Error("rate_limit_exceeded"));
    const second = sinon.stub().resolves("fallback-result");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(result).to.equal("fallback-result");
    expect(second.calledOnce).to.equal(true);
  });

  it("should fall back to second provider when first throws 'tokens per day'", async () => {
    const first = sinon.stub().rejects(new Error("tokens per day exceeded"));
    const second = sinon.stub().resolves("ok");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(result).to.equal("ok");
  });

  it("should fall back to second provider when first throws 'quota exceeded'", async () => {
    const first = sinon.stub().rejects(new Error("quota exceeded"));
    const second = sinon.stub().resolves("ok");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(result).to.equal("ok");
  });

  it("should fall back to second provider when first throws a non-rate-limit error", async () => {
    const first = sinon.stub().rejects(new Error("connection timed out"));
    const second = sinon.stub().resolves("fallback-result");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
      ],
      logger,
    );

    expect(result).to.equal("fallback-result");
  });

  it("should throw ServiceUnavailableException when all providers fail", async () => {
    const first = sinon.stub().rejects(new Error("first error"));
    const second = sinon.stub().rejects(new Error("second error"));

    try {
      await runWithFallbackChain(
        [
          { name: "first", fn: first },
          { name: "second", fn: second },
        ],
        logger,
      );
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });

  it("should call third provider only when second also fails", async () => {
    const first = sinon.stub().rejects(new Error("first error"));
    const second = sinon.stub().rejects(new Error("second error"));
    const third = sinon.stub().resolves("third-result");

    const result = await runWithFallbackChain(
      [
        { name: "first", fn: first },
        { name: "second", fn: second },
        { name: "third", fn: third },
      ],
      logger,
    );

    expect(result).to.equal("third-result");
    expect(first.calledOnce).to.equal(true);
    expect(second.calledOnce).to.equal(true);
    expect(third.calledOnce).to.equal(true);
  });

  it("should throw ServiceUnavailableException with 3+ providers when all fail", async () => {
    const providers = [
      { name: "a", fn: sinon.stub().rejects(new Error("a")) },
      { name: "b", fn: sinon.stub().rejects(new Error("b")) },
      { name: "c", fn: sinon.stub().rejects(new Error("c")) },
    ];

    try {
      await runWithFallbackChain(providers, logger);
      expect.fail("Should have thrown ServiceUnavailableException");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceUnavailableException);
    }
  });
});
