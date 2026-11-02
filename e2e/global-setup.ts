import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { MAILPIT } from "./helpers";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_E2E;
  if (!url) throw new Error("DATABASE_URL_E2E mancante (vedi .env.example)");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "lib/db/migrations" });
    await client.unsafe(
      `TRUNCATE "lanterns", "connections", "invites", "blocks", "rate_limits",
        "session", "account", "verification", "rate_limit", "user" CASCADE`,
    );
  } finally {
    await client.end();
  }
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}
