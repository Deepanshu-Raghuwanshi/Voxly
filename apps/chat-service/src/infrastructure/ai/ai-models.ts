// All generative features share this model. Groq adds a provider namespace.
const MODEL_ID = "gpt-oss-120b";
export const GROQ_MODEL = `openai/${MODEL_ID}`;
export const CEREBRAS_MODEL = MODEL_ID;

// GPT-OSS uses its completion budget for reasoning and visible output.
export const REASONING_EFFORT = "low" as const;
