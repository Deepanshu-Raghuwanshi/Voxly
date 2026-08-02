/**
 * Model ids for every AI provider, in one place.
 *
 * These were previously duplicated across each service and again in the
 * fallback-chain log labels. When Groq decommissioned
 * `meta-llama/llama-4-scout-17b-16e-instruct` every Groq call started failing
 * with 404 model_not_found, and the log labels had to be kept in sync by hand.
 * Import from here so a provider retiring a model is a one-line change.
 */

/** Groq, tool-calling paths. Reasoning model — always pass GROQ_REASONING_EFFORT. */
export const GROQ_TOOL_MODEL = "openai/gpt-oss-120b";

/** Groq, plain completions. Non-reasoning, so max_tokens is spent purely on output. */
export const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";

/** Cerebras, all features. Reasoning model — always pass CEREBRAS_REASONING_EFFORT. */
export const CEREBRAS_MODEL = "gpt-oss-120b";

/**
 * gpt-oss models draw reasoning tokens from max_tokens before emitting any
 * content, so an unconstrained effort can burn the whole budget and return
 * finish_reason=length with empty content. Every call to a gpt-oss model must
 * pass this.
 */
export const REASONING_EFFORT = "low" as const;
