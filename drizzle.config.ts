import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./lib/db/auth-schema.ts", "./lib/db/schema.ts"],
  out: "./lib/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
