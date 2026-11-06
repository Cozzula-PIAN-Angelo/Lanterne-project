import "dotenv/config";
import { PgBoss } from "pg-boss";
import { systemClock } from "@/lib/clock/clock";
import { db } from "@/lib/db/client";
import { createStorage } from "@/lib/storage/s3";
import { registerJobs } from "./jobs";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
  // Senza questo ascolto, un errore di connessione di pg-boss chiuderebbe il processo.
  boss.on("error", (error) => console.error("Worker, pg-boss:", error.message));

  await boss.start();
  await registerJobs(boss, { db, storage: createStorage(process.env), clock: systemClock });
  console.log("Worker avviato");

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Worker non avviato:", error instanceof Error ? error.message : error);
  process.exit(1);
});
