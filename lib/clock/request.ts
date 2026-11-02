import "server-only";
import { cookies } from "next/headers";
import { type Clock, DEV_OFFSET_COOKIE, offsetClock, parseDevOffset, systemClock } from "./clock";

export async function getRequestClock(): Promise<Clock> {
  const raw = (await cookies()).get(DEV_OFFSET_COOKIE)?.value;
  return offsetClock(systemClock, parseDevOffset(raw, process.env.NODE_ENV));
}
