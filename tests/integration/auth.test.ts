import { randomUUID } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { user } from "@/lib/db/schema";
import { getTestDb, resetDb } from "../helpers/db";

const db = getTestDb();
const PASSWORD = "lanterne-demo";

beforeEach(() => resetDb(db));

const rowByEmail = async (email: string) =>
  (await db.select().from(user).where(eq(user.email, email)))[0];

// I campi del profilo si scrivono solo da saveProfile (validato), mai dalle API di Better Auth.
test("la registrazione ignora fuso, colore e salvataggio inviati dal client", async () => {
  const email = `x-${randomUUID()}@example.test`;
  await auth.api
    .signUpEmail({
      // un client malevolo può mandare qualsiasi campo: i tipi lo vieterebbero, il cast lo simula
      body: {
        name: "X",
        email,
        password: PASSWORD,
        ...{ timezone: "Mars/Base", color: "x", allowSaving: false },
      } as { name: string; email: string; password: string },
    })
    .catch(() => undefined);
  const row = await rowByEmail(email);
  expect(row?.timezone ?? "UTC").toBe("UTC");
  expect(row?.color ?? null).toBeNull();
  expect(row?.allowSaving ?? true).toBe(true);
});

test("update-user non può cambiare il fuso", async () => {
  const email = `x-${randomUUID()}@example.test`;
  const { headers } = await auth.api.signUpEmail({
    body: { name: "X", email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = (headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toContain("session_token");

  await auth.api
    .updateUser({ body: { timezone: "Mars/Base" } as unknown as Record<string, never>, headers: new Headers({ cookie }) })
    .catch(() => undefined);
  expect((await rowByEmail(email)).timezone).toBe("UTC");
});
