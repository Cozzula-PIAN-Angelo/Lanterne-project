import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/access/profile";
import { auth } from "./auth";

export type User = typeof auth.$Infer.Session.user;

const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

const withNext = (path: string, next?: string) =>
  next ? `${path}?next=${encodeURIComponent(next)}` : path;

/** Utente con sessione valida, altrimenti redirect a /accedi. `next`: dove tornare dopo. */
export async function requireUser(next?: string): Promise<User> {
  const session = await getSession();
  if (!session) redirect(withNext("/accedi", next));
  return session.user;
}

/** Come requireUser, ma chi non ha completato l'onboarding va a /benvenuto. */
export async function requireOnboardedUser(next?: string): Promise<User> {
  const user = await requireUser(next);
  if (!isOnboarded({ color: user.color ?? null })) redirect(withNext("/benvenuto", next));
  return user;
}
