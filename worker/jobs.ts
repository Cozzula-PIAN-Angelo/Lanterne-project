import type { PgBoss } from "pg-boss";
import { cleanupAbandoned, cleanupExpired, drainStorageDeletions } from "@/lib/access/cleanup";
import type { Clock } from "@/lib/clock/clock";
import type { Db } from "@/lib/db/client";
import type { MediaStorage } from "@/lib/storage/s3";

export type WorkerDeps = { db: Db; storage: MediaStorage; clock: Clock };

export type Job = { name: string; cron: string; run: (deps: WorkerDeps) => Promise<unknown> };

export const JOBS: readonly Job[] = [
  {
    name: "cleanup-expired",
    cron: "*/15 * * * *",
    run: ({ db, clock }) => cleanupExpired(db, { now: clock.now() }),
  },
  {
    name: "cleanup-abandoned",
    cron: "*/15 * * * *",
    run: ({ db, clock }) => cleanupAbandoned(db, { now: clock.now() }),
  },
  {
    name: "drain-storage",
    cron: "* * * * *",
    run: async ({ db, storage, clock }) => {
      const { failed } = await drainStorageDeletions(db, storage, { now: clock.now() });
      // Il job riesce lo stesso e riprova da solo: senza questa riga, uno storage guasto
      // lascerebbe i file al loro posto senza che nessuno se ne accorga. Mai le chiavi nel log.
      if (failed > 0) console.error(`drain-storage: ${failed} file non rimossi`);
    },
  },
];

export async function registerJobs(boss: PgBoss, deps: WorkerDeps, jobs: readonly Job[] = JOBS): Promise<void> {
  for (const job of jobs) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron);
    await boss.work(job.name, async () => {
      try {
        await job.run(deps);
      } catch {
        // Solo il nome: il testo di un errore potrebbe contenere dati delle lanterne.
        // Lo stesso vale per quel che pg-boss salva, quindi il nuovo errore non porta la causa.
        const message = `Job non riuscito: ${job.name}`;
        console.error(message);
        throw new Error(message);
      }
    });
  }
}
