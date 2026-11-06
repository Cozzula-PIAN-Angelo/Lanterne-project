import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { fixedClock } from "@/lib/clock/clock";
import { createStorage } from "@/lib/storage/s3";
import { JOBS, registerJobs, type WorkerDeps } from "@/worker/jobs";
import { getTestDb } from "../helpers/db";

const deps: WorkerDeps = {
  db: getTestDb(),
  storage: createStorage(process.env),
  clock: fixedClock(new Date("2026-11-02T22:00:00Z")),
};
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL_TEST, schema: "pgboss_test" });

beforeAll(async () => {
  boss.on("error", (error) => console.error("pg-boss:", error.message));
  await boss.start();
});
afterAll(() => boss.stop({ graceful: false }));
afterEach(() => vi.restoreAllMocks());

test("registerJobs pianifica tutti i job con il loro cron", async () => {
  await registerJobs(boss, deps);
  const schedules = await boss.getSchedules();
  for (const job of JOBS) {
    expect(schedules).toContainEqual(expect.objectContaining({ name: job.name, cron: job.cron }));
  }
  expect(JOBS.map((job) => [job.name, job.cron])).toEqual([
    ["cleanup-expired", "*/15 * * * *"],
    ["cleanup-abandoned", "*/15 * * * *"],
    ["drain-storage", "* * * * *"],
  ]);
});

test("un job che fallisce non ferma gli altri", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const healthy = vi.fn(async () => {});
  const suffix = Date.now();
  const failing = { name: `prova-guasto-${suffix}`, cron: "0 0 1 1 *" };
  const working = { name: `prova-sano-${suffix}`, cron: "0 0 1 1 *" };

  await registerJobs(boss, deps, [
    {
      ...failing,
      run: async () => {
        throw new Error("contenuto privato della lanterna");
      },
    },
    { ...working, run: healthy },
  ]);
  await boss.send(failing.name);
  await boss.send(working.name);

  await vi.waitFor(() => expect(healthy).toHaveBeenCalled(), { timeout: 15_000, interval: 200 });
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith(`Job non riuscito: ${failing.name}`), {
    timeout: 15_000,
    interval: 200,
  });
  // Il log non riporta mai il testo dell'errore, che potrebbe contenere dati delle lanterne.
  expect(JSON.stringify(log.mock.calls)).not.toContain("contenuto privato");

  await boss.unschedule(failing.name);
  await boss.unschedule(working.name);
});
