import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  return drizzle(postgres(url), { schema });
}

export type Db = ReturnType<typeof createDb>;

// In sviluppo il modulo viene ricaricato a ogni modifica: si riusa lo stesso pool
// invece di aprirne uno nuovo ogni volta (altrimenti "too many clients").
const globalForDb = globalThis as unknown as { lanterneDb?: Db };

export const db: Db = globalForDb.lanterneDb ?? createDb(process.env.DATABASE_URL ?? "");
if (process.env.NODE_ENV !== "production") globalForDb.lanterneDb = db;

/** Transazione drizzle: le funzioni di accesso accettano sia il db sia una transazione. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
