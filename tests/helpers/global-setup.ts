import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createStorage } from "../../lib/storage/s3";

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST mancante (vedi .env.example)");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "lib/db/migrations" });
    await client`DROP SCHEMA IF EXISTS pgboss_test CASCADE`;
  } finally {
    await client.end();
  }
  await createStorage({ ...process.env, S3_BUCKET: process.env.S3_BUCKET_TEST }).ensureBucket();
}
