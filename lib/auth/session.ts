import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/access/profile";
import { auth } from "./auth";

export type User = typeof auth.$Infer.Session.user;

const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Utente con sessione valida, altrimenti redirect a /accedi. */
export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/accedi");
  return session.user;
}

/** Come requireUser, ma chi non ha completato l'onboarding va a /benvenuto. */
export async function requireOnboardedUser(): Promise<User> {
  const user = await requireUser();
  if (!isOnboarded({ color: user.color ?? null })) redirect("/benvenuto");
  return user;
}
