import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/lib/db/client";
import { connections, lanterns, user } from "@/lib/db/schema";

type User = typeof user.$inferSelect;
type NewUser = typeof user.$inferInsert;
type NewConnection = typeof connections.$inferInsert;
type NewLantern = typeof lanterns.$inferInsert;

let testDb: Db | undefined;

export function getTestDb(): Db {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST mancante (vedi .env.example)");
  testDb ??= createDb(url);
  return testDb;
}

const TABLES = [
  "lanterns",
  "connections",
  "invites",
  "blocks",
  "rate_limits",
  "session",
  "account",
  "verification",
  "rate_limit",
  "user",
];

export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`),
  );
}

export async function makeUser(db: Db, overrides: Partial<NewUser> = {}): Promise<User> {
  const [row] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: "Utente",
      email: `utente-${randomUUID()}@example.test`,
      color: "#E8A75C",
      timezone: "Europe/Rome",
      allowSaving: true,
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeConnection(
  db: Db,
  a: Pick<User, "id">,
  b: Pick<User, "id">,
  overrides: Partial<NewConnection> = {},
) {
  const [userAId, userBId] = [a.id, b.id].sort();
  const [row] = await db
    .insert(connections)
    .values({ userAId, userBId, status: "active", revealTime: "21:30", ...overrides })
    .returning();
  return row;
}

export async function makeLantern(
  db: Db,
  overrides: Partial<NewLantern> &
    Pick<NewLantern, "connectionId" | "senderId" | "recipientId" | "revealAt" | "expiresAt">,
) {
  const [row] = await db
    .insert(lanterns)
    .values({ type: "text", text: "Ciao", status: "ready", savable: true, ...overrides })
    .returning();
  return row;
}
