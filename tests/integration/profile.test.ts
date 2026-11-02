import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { saveProfile } from "@/lib/access/profile";
import { user } from "@/lib/db/schema";
import { getTestDb, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();

beforeEach(() => resetDb(db));

test("salva nome, colore e fuso validi", async () => {
  const u = await makeUser(db, { color: null, timezone: "UTC" });
  expect(
    await saveProfile(db, u.id, { name: "Giulia", color: "#E8A75C", timezone: "Europe/Rome" }),
  ).toEqual({ ok: true, value: undefined });
  const [row] = await db.select().from(user).where(eq(user.id, u.id));
  expect(row).toMatchObject({ name: "Giulia", color: "#E8A75C", timezone: "Europe/Rome" });
});

test("rifiuta un fuso inventato", async () => {
  const u = await makeUser(db);
  expect(
    await saveProfile(db, u.id, { name: "Giulia", color: "#E8A75C", timezone: "Mars/Base" }),
  ).toEqual({ ok: false, error: "invalid_input" });
});

test("rifiuta un colore fuori palette", async () => {
  const u = await makeUser(db);
  expect(
    await saveProfile(db, u.id, { name: "Giulia", color: "#FF00FF", timezone: "Europe/Rome" }),
  ).toEqual({ ok: false, error: "invalid_input" });
});
