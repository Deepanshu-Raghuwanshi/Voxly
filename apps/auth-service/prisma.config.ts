import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: "../../.env", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.AUTH_DATABASE_URL!,
  },
});