import { beforeEach, expect, test } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTestDb, resetDb } from "../helpers/db";

const db = getTestDb();

beforeEach(() => resetDb(db));

test("consente fino al limite, poi blocca con retryAfter", async () => {
  const now = new Date("2026-11-02T10:00:00Z");
  for (let i = 0; i < 3; i++)
    expect(await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now })).toEqual({ ok: true });
  expect(
    await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:00:20Z") }),
  ).toEqual({ ok: false, retryAfterSec: 40 });
});

test("la finestra si azzera", async () => {
  for (let i = 0; i < 3; i++)
    await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:00:00Z") });
  expect(
    await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:01:00Z") }),
  ).toEqual({ ok: true });
});
