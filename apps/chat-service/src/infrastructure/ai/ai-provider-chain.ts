import { Logger, ServiceUnavailableException } from "@nestjs/common";

const RATE_LIMIT_SIGNALS = [
  "rate_limit_exceeded",
  "rate limit reached for model",
  "tokens per day",
  "quota exceeded",
];

export function isProviderRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const lower = err.message.toLowerCase();
  return RATE_LIMIT_SIGNALS.some((s) => lower.includes(s));
}

export async function runWithFallbackChain<T>(
  providers: Array<{ name: string; model: string; feature: string; fn: () => Promise<T> }>,
  logger: Logger,
): Promise<T> {
  for (const provider of providers) {
    logger.log(
      `[AI] feature=${provider.feature} provider=${provider.name} model=${provider.model}`,
    );
    try {
      return await provider.fn();
    } catch (err) {
      const isRateLimit = isProviderRateLimitError(err);
      logger.warn(
        `[AI] feature=${provider.feature} provider=${provider.name} failed — ${isRateLimit ? "rate-limited, trying next" : "error, trying next"}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new ServiceUnavailableException("All AI providers are unavailable");
}
