import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3003),
  MONGODB_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  GROQ_API_KEY: z.string().min(1),
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1),
  OPENWEATHER_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables");
  }

  return result.data;
}
