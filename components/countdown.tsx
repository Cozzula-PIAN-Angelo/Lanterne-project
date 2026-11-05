"use client";

import { useState, useSyncExternalStore } from "react";
import { formatCountdown } from "@/lib/time/format";

const REFRESH_MS = 30_000;

function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, REFRESH_MS);
  return () => clearInterval(timer);
}

/** Conto alla rovescia sull'orologio del server: quello del dispositivo può essere sbagliato. */
export function Countdown({ target, serverNow }: { target: string; serverNow: string }) {
  const targetMs = new Date(target).getTime();
  const serverNowMs = new Date(serverNow).getTime();
  const [skew] = useState(() => serverNowMs - Date.now());

  const label = useSyncExternalStore(
    subscribe,
    () => formatCountdown(targetMs - (Date.now() + skew)),
    () => formatCountdown(targetMs - serverNowMs),
  );
  return <p className="text-sm text-muted-foreground">{label}</p>;
}
