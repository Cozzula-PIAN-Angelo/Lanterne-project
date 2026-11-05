"use server";

import { cookies } from "next/headers";
import { DEV_OFFSET_COOKIE, devOffsetCookieValue } from "@/lib/clock/clock";

/** Sposta l'orologio del server per questo browser. Solo in sviluppo. */
export async function setDevOffsetAction(ms: number): Promise<void> {
  const value = devOffsetCookieValue(ms, process.env.NODE_ENV);
  (await cookies()).set(DEV_OFFSET_COOKIE, value, { path: "/", sameSite: "lax", httpOnly: true });
}
