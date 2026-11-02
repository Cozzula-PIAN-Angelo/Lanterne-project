import { beforeEach, expect, test } from "vitest";
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
