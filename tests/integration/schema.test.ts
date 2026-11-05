import { beforeEach, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { connections } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();

beforeEach(() => resetDb(db));

test("una sola connessione non terminata per coppia", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  await makeConnection(db, a, b);
  await expect(makeConnection(db, a, b)).rejects.toThrow();
});

test("dopo la chiusura ci si può ricollegare", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  await makeConnection(db, a, b, { status: "ended" });
  await expect(makeConnection(db, a, b)).resolves.toBeDefined();
});

test("CHECK user_a_id < user_b_id", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  const [lo, hi] = [a.id, b.id].sort();
  await expect(
    db.insert(connections).values({ userAId: hi, userBId: lo, status: "active" }),
  ).rejects.toThrow();
});

// Le coppie si ordinano in JS (ordine per code unit). Il CHECK deve usare lo stesso ordine
// qualunque sia la collation del database di produzione (gli id di Better Auth hanno maiuscole).
test("il CHECK sull'ordine della coppia usa la collation C", async () => {
  const rows = await db.execute<{ def: string }>(
    sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'connections_user_order'`,
  );
  expect(rows[0].def).toContain('COLLATE "C"');
});

test("id con maiuscole e minuscole: la coppia ordinata in JS è accettata", async () => {
  const a = await makeUser(db, { id: "Bx0000000000000000000000000000AA" });
  const b = await makeUser(db, { id: "ax0000000000000000000000000000AA" });
  await expect(makeConnection(db, a, b)).resolves.toBeDefined();
});

test("indici sulle colonne usate nelle ricerche", async () => {
  const rows = await db.execute<{ indexdef: string }>(
    sql`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const defs = rows.map((r) => r.indexdef).join("\n");
  expect(defs).toMatch(/ON public\.lanterns USING btree \(sender_id/);
  expect(defs).toMatch(/ON public\.invites USING btree \(inviter_id/);
  expect(defs).toMatch(/ON public\.connections USING btree \(user_b_id/);
});
