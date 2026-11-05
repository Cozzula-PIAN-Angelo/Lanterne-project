import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTextLantern } from "@/lib/access/lanterns";
import { saveProfile, setAllowSaving, updateTimezone } from "@/lib/access/profile";
import { user } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeUser, resetDb } from "../helpers/db";

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

describe("updateTimezone", () => {
  test("rifiuta un fuso inventato", async () => {
    const u = await makeUser(db);
    expect(await updateTimezone(db, u.id, "Mars/Base")).toEqual({ ok: false, error: "invalid_input" });
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.timezone).toBe(u.timezone);
  });

  test("salva un fuso valido", async () => {
    const u = await makeUser(db);
    expect(await updateTimezone(db, u.id, "Asia/Tokyo")).toEqual({ ok: true, value: undefined });
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.timezone).toBe("Asia/Tokyo");
  });
});

describe("setAllowSaving", () => {
  test("vale per le lanterne create da quel momento", async () => {
    const a = await makeUser(db);
    const b = await makeUser(db);
    const connection = await makeConnection(db, a, b, { status: "active", revealTime: "21:30" });
    const now = new Date("2026-11-05T10:00:00Z");
    const send = () =>
      createTextLantern(db, { connectionId: connection.id, senderId: a.id, text: "ciao", now });

    const before = await send();
    expect(await setAllowSaving(db, a.id, false)).toEqual({ ok: true, value: undefined });
    const after = await send();

    expect(before.ok && before.value.savable).toBe(true);
    expect(after.ok && after.value.savable).toBe(false);
  });
});
