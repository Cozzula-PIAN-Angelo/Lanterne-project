import "server-only";
import { cookies } from "next/headers";
import { type Clock, DEV_OFFSET_COOKIE, offsetClock, parseDevOffset, systemClock } from "./clock";

export async function getDevOffsetMs(): Promise<number> {
  const raw = (await cookies()).get(DEV_OFFSET_COOKIE)?.value;
  return parseDevOffset(raw, process.env.NODE_ENV);
}

export async function getRequestClock(): Promise<Clock> {
  return offsetClock(systemClock, await getDevOffsetMs());
}
