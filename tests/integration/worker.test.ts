import { eq } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fixedClock } from "@/lib/clock/clock";
import { lanterns, storageDeletions } from "@/lib/db/schema";
import { createStorage } from "@/lib/storage/s3";
import { JOBS, registerJobs, type WorkerDeps } from "@/worker/jobs";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const now = new Date("2026-11-02T22:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
const db = getTestDb();
const deps: WorkerDeps = { db, storage: createStorage(process.env), clock: fixedClock(now) };

afterEach(() => vi.restoreAllMocks());

// Prima dei test con pg-boss: da lì in poi i job veri sono registrati e il cron può farli partire.
describe("cosa fanno i job", () => {
  beforeEach(() => resetDb(db));

  const jobNamed = (name: string) => {
    const job = JOBS.find((candidate) => candidate.name === name);
    if (!job) throw new Error(`Job mancante: ${name}`);
    return job;
  };

  async function lantern(over: Partial<Parameters<typeof makeLantern>[1]>) {
    const giulia = await makeUser(db);
    const marco = await makeUser(db);
    const conn = await makeConnection(db, giulia, marco);
    return makeLantern(db, {
      connectionId: conn.id,
      senderId: giulia.id,
      recipientId: marco.id,
      revealAt: hours(5),
      expiresAt: hours(29),
      ...over,
    });
  }
  const exists = async (id: string) => (await db.select().from(lanterns).where(eq(lanterns.id, id))).length === 1;

  test("cleanup-expired usa l'orologio e toglie le scadute", async () => {
    const expired = await lantern({ revealAt: hours(-30), expiresAt: hours(-1) });
    const valid = await lantern({});
    await jobNamed("cleanup-expired").run(deps);
    expect(await exists(expired.id)).toBe(false);
    expect(await exists(valid.id)).toBe(true);
  });

  test("cleanup-abandoned usa l'orologio e toglie gli upload fermi", async () => {
    const abandoned = await lantern({ status: "uploading", createdAt: hours(-2) });
    const recent = await lantern({ status: "uploading", createdAt: hours(0) });
    await jobNamed("cleanup-abandoned").run(deps);
    expect(await exists(abandoned.id)).toBe(false);
    expect(await exists(recent.id)).toBe(true);
  });

  test("drain-storage usa l'orologio e svuota la coda", async () => {
    await db.insert(storageDeletions).values([
      { key: "test/vecchia", createdAt: hours(-2) },
      { key: "test/recente", createdAt: now },
    ]);
    await jobNamed("drain-storage").run(deps);
    const left = await db.select().from(storageDeletions);
    expect(left.map((row) => row.key)).toEqual(["test/recente"]);
  });

  test("se lo storage non risponde il log dice quanti file, mai quali", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(storageDeletions).values([
      { key: "media/chiave-privata-1", createdAt: hours(-2) },
      { key: "media/chiave-privata-2", createdAt: hours(-2) },
    ]);
    const broken = {
      ...deps.storage,
      remove: async () => {
        throw new Error("storage non raggiungibile");
      },
    };
    await jobNamed("drain-storage").run({ ...deps, storage: broken });
    expect(log).toHaveBeenCalledWith("drain-storage: 2 file non rimossi");
    expect(JSON.stringify(log.mock.calls)).not.toContain("chiave-privata");
  });

  test("se la coda si svuota senza errori il log tace", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(storageDeletions).values({ key: "test/ok", createdAt: hours(-2) });
    await jobNamed("drain-storage").run(deps);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("pg-boss", () => {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL_TEST, schema: "pgboss_test" });

  beforeAll(async () => {
    boss.on("error", (error) => console.error("pg-boss:", error.message));
    await boss.start();
  });
  afterAll(() => boss.stop({ graceful: false }));

  const jobState = async (name: string, id: string) => (await boss.findJobs(name, { id }))[0];

  test("registerJobs pianifica tutti i job con il loro cron", async () => {
    // Lo schema si azzera a ogni avvio dei test: senza, i job già salvati coprirebbero un registerJobs rotto.
    expect(await boss.getSchedules()).toEqual([]);
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

  test("un job che fallisce risulta fallito, senza dati privati, e la sua coda continua a lavorare", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const name = `prova-guasto-${Date.now()}`;
    let broken = true;
    const run = vi.fn(async () => {
      if (broken) throw new Error("contenuto privato della lanterna");
    });
    await registerJobs(boss, deps, [{ name, cron: "0 0 1 1 *", run }]);

    const failedId = await boss.send(name);
    await vi.waitFor(
      async () => {
        const job = await jobState(name, failedId!);
        expect(["retry", "failed"]).toContain(job.state);
        // Quel che pg-boss conserva nelle sue tabelle conta quanto il log.
        expect(JSON.stringify(job.output)).toContain(name);
        expect(JSON.stringify(job.output)).not.toContain("contenuto privato");
      },
      { timeout: 15_000, interval: 200 },
    );
    expect(log).toHaveBeenCalledWith(`Job non riuscito: ${name}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain("contenuto privato");

    broken = false;
    const nextId = await boss.send(name);
    await vi.waitFor(async () => expect((await jobState(name, nextId!)).state).toBe("completed"), {
      timeout: 15_000,
      interval: 200,
    });

    await boss.unschedule(name);
  }, 30_000);
});
