import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { acceptInvite, createInvite, getInvitePreview } from "@/lib/access/invites";
import { blocks, connections, invites } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T10:00:00Z");
const later = new Date("2026-11-03T10:00:00Z");

beforeEach(() => resetDb(db));

async function inviteFrom(userId: string, proposedRevealTime = "21:30") {
  const res = await createInvite(db, { userId, proposedRevealTime, now });
  if (!res.ok) throw new Error(`createInvite: ${res.error}`);
  return res.value.code;
}

async function fillConnections(userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const other = await makeUser(db);
    await makeConnection(db, { id: userId }, other);
  }
}

describe("createInvite", () => {
  test("codice di 22 caratteri, scade dopo 7 giorni", async () => {
    const u = await makeUser(db);
    const res = await createInvite(db, { userId: u.id, proposedRevealTime: "21:30", now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(res.value.expiresAt).toEqual(new Date("2026-11-09T10:00:00Z"));
  });

  test("orario fuori fascia → invalid_reveal_time", async () => {
    const u = await makeUser(db);
    expect(await createInvite(db, { userId: u.id, proposedRevealTime: "16:00", now })).toEqual({
      ok: false,
      error: "invalid_reveal_time",
    });
  });

  test("utente senza onboarding → onboarding_required", async () => {
    const u = await makeUser(db, { color: null, timezone: "UTC" });
    expect(await createInvite(db, { userId: u.id, proposedRevealTime: "21:30", now })).toEqual({
      ok: false,
      error: "onboarding_required",
    });
  });

  test("con 5 connessioni → connection_limit_self", async () => {
    const u = await makeUser(db);
    await fillConnections(u.id, 5);
    expect(await createInvite(db, { userId: u.id, proposedRevealTime: "21:30", now })).toEqual({
      ok: false,
      error: "connection_limit_self",
    });
  });
});

describe("acceptInvite", () => {
  test("senza controproposta → connessione active con l'orario proposto", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    const res = await acceptInvite(db, { code, userId: b.id, now: later });
    expect(res).toMatchObject({ ok: true, value: { status: "active" } });
    if (!res.ok) return;
    const [conn] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, res.value.connectionId));
    expect(conn).toMatchObject({ status: "active", revealTime: "21:30" });
  });

  test("con controproposta → connessione pending proposta dall'invitato", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    const res = await acceptInvite(db, { code, userId: b.id, counterProposal: "22:00", now: later });
    expect(res).toMatchObject({ ok: true, value: { status: "pending" } });
    if (!res.ok) return;
    const [conn] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, res.value.connectionId));
    expect(conn).toMatchObject({
      status: "pending",
      revealTime: null,
      proposedRevealTime: "22:00",
      proposedBy: b.id,
      proposedAt: later,
    });
  });

  test("controproposta non valida → invalid_reveal_time", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    expect(
      await acceptInvite(db, { code, userId: b.id, counterProposal: "09:00", now: later }),
    ).toEqual({ ok: false, error: "invalid_reveal_time" });
  });

  test("codice inesistente → invite_invalid", async () => {
    const b = await makeUser(db);
    expect(await acceptInvite(db, { code: "nessuno", userId: b.id, now })).toEqual({
      ok: false,
      error: "invite_invalid",
    });
  });

  test("secondo utente sullo stesso invito → invite_used", async () => {
    const [a, b, c] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    expect((await acceptInvite(db, { code, userId: b.id, now: later })).ok).toBe(true);
    expect(await acceptInvite(db, { code, userId: c.id, now: later })).toEqual({
      ok: false,
      error: "invite_used",
    });
  });

  test("due accettazioni concorrenti → esattamente una ok", async () => {
    const [a, b, c] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    const results = await Promise.all([
      acceptInvite(db, { code, userId: b.id, now: later }),
      acceptInvite(db, { code, userId: c.id, now: later }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "invite_used" }]);
  });

  test("invito scaduto (creazione + 7 giorni) → invite_expired", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    expect(
      await acceptInvite(db, { code, userId: b.id, now: new Date("2026-11-09T10:00:00Z") }),
    ).toEqual({ ok: false, error: "invite_expired" });
  });

  test("il proprio invito → self_invite", async () => {
    const a = await makeUser(db);
    const code = await inviteFrom(a.id);
    expect(await acceptInvite(db, { code, userId: a.id, now: later })).toEqual({
      ok: false,
      error: "self_invite",
    });
  });

  test("blocco in entrambe le direzioni → invite_invalid", async () => {
    const [a, b, c] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const code1 = await inviteFrom(a.id);
    await db.insert(blocks).values({ blockerId: b.id, blockedId: a.id });
    expect(await acceptInvite(db, { code: code1, userId: b.id, now: later })).toEqual({
      ok: false,
      error: "invite_invalid",
    });
    const code2 = await inviteFrom(a.id);
    await db.insert(blocks).values({ blockerId: a.id, blockedId: c.id });
    expect(await acceptInvite(db, { code: code2, userId: c.id, now: later })).toEqual({
      ok: false,
      error: "invite_invalid",
    });
  });

  test("già collegati → already_connected", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    await makeConnection(db, a, b);
    const code = await inviteFrom(a.id);
    expect(await acceptInvite(db, { code, userId: b.id, now: later })).toEqual({
      ok: false,
      error: "already_connected",
    });
  });

  test("invitante arrivato a 5 dopo l'invito → connection_limit_other", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    await fillConnections(a.id, 5);
    expect(await acceptInvite(db, { code, userId: b.id, now: later })).toEqual({
      ok: false,
      error: "connection_limit_other",
    });
  });

  test("invitato con 5 connessioni → connection_limit_self", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    await fillConnections(b.id, 5);
    expect(await acceptInvite(db, { code, userId: b.id, now: later })).toEqual({
      ok: false,
      error: "connection_limit_self",
    });
  });

  test("invitato senza onboarding → onboarding_required", async () => {
    const a = await makeUser(db);
    const b = await makeUser(db, { color: null, timezone: "UTC" });
    const code = await inviteFrom(a.id);
    expect(await acceptInvite(db, { code, userId: b.id, now: later })).toEqual({
      ok: false,
      error: "onboarding_required",
    });
  });
});

describe("acceptInvite concorrenti", () => {
  test("invitante a 4 con un'altra accettazione in corso → aspetta e dà connection_limit_other", async () => {
    const [a, b, x] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    await fillConnections(a.id, 4);
    const code = await inviteFrom(a.id);

    // Simula un'accettazione concorrente: blocca l'invitante e gli aggiunge la 5ª connessione,
    // senza ancora fare commit.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let markLocked!: () => void;
    const locked = new Promise<void>((r) => (markLocked = r));
    const other = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${a.id} FOR UPDATE`);
      const [userAId, userBId] = [a.id, x.id].sort();
      await tx.insert(connections).values({ userAId, userBId, status: "active", revealTime: "21:30" });
      markLocked();
      await gate;
    });
    await locked;

    const accepting = acceptInvite(db, { code, userId: b.id, now: later });
    await new Promise((r) => setTimeout(r, 200));
    release();
    await other;
    expect(await accepting).toEqual({ ok: false, error: "connection_limit_other" });
  });

  test("inviti incrociati A→B e B→A accettati insieme → already_connected, non un errore", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const [fromA, fromB] = [await inviteFrom(a.id), await inviteFrom(b.id)];
    const results = await Promise.all([
      acceptInvite(db, { code: fromA, userId: b.id, now: later }),
      acceptInvite(db, { code: fromB, userId: a.id, now: later }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "already_connected" }]);
  });
});

describe("getInvitePreview", () => {
  test("invito valido → nome dell'invitante e orario proposto", async () => {
    const a = await makeUser(db, { name: "Giulia" });
    const b = await makeUser(db);
    const code = await inviteFrom(a.id, "22:30");
    expect(await getInvitePreview(db, { code, viewerId: b.id, now: later })).toEqual({
      ok: true,
      value: {
        inviterName: "Giulia",
        proposedRevealTime: "22:30",
        expiresAt: new Date("2026-11-09T10:00:00Z"),
      },
    });
  });
});

describe("orari e blocchi in corso", () => {
  test("createdAt e activatedAt vengono dal now passato, non dall'orologio del DB", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    const [invite] = await db.select().from(invites).where(eq(invites.code, code));
    expect(invite.createdAt).toEqual(now);
    const res = await acceptInvite(db, { code, userId: b.id, now: later });
    if (!res.ok) throw new Error(res.error);
    const [conn] = await db.select().from(connections).where(eq(connections.id, res.value.connectionId));
    expect(conn.createdAt).toEqual(later);
    expect(conn.activatedAt).toEqual(later);
  });

  test("un blocco in corso tra le due persone fa fallire l'accettazione", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const code = await inviteFrom(a.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let markLocked!: () => void;
    const locked = new Promise<void>((r) => (markLocked = r));
    const blocking = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "user" WHERE id IN (${a.id}, ${b.id}) ORDER BY id FOR UPDATE`);
      await tx.insert(blocks).values({ blockerId: a.id, blockedId: b.id });
      markLocked();
      await gate;
    });
    await locked;
    const accepting = acceptInvite(db, { code, userId: b.id, now: later });
    await new Promise((r) => setTimeout(r, 200));
    release();
    await blocking;
    expect(await accepting).toEqual({ ok: false, error: "invite_invalid" });
  });
});
