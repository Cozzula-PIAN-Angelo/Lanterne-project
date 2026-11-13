"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TICK_MS = 30_000;

/**
 * L'ora del server vista dal dispositivo: `serverNow` più il tempo passato, misurato
 * sull'orologio del dispositivo, che può essere avanti o indietro (§6.6).
 * Si aggiorna ogni 30 secondi e al prossimo confine dato da `nextChange`; al confine
 * chiede alla pagina dati nuovi, così le lanterne arrivano senza ricaricare.
 */
export function useServerClock(serverNow: string, nextChange: (now: Date) => Date | null): Date {
  const router = useRouter();
  const serverMs = Date.parse(serverNow);
  const skew = useRef(0);
  // L'ultimo battito vale solo per l'orario del server da cui è partito: un refresh o un
  // viaggio nel tempo portano un `serverNow` nuovo e si riparte da quello.
  const [tick, setTick] = useState<{ serverNow: string; nowMs: number } | null>(null);
  const nowMs = tick?.serverNow === serverNow ? tick.nowMs : serverMs;
  const boundary = nextChange(new Date(nowMs))?.getTime() ?? null;

  useEffect(() => {
    skew.current = serverMs - Date.now();
  }, [serverMs]);

  useEffect(() => {
    const wait = boundary === null ? TICK_MS : Math.min(TICK_MS, Math.max(0, boundary - nowMs));
    const timer = setTimeout(() => {
      const next = Date.now() + skew.current;
      setTick({ serverNow, nowMs: next });
      if (boundary !== null && next >= boundary) router.refresh();
    }, wait);
    return () => clearTimeout(timer);
  }, [boundary, nowMs, serverNow, router]);

  return new Date(nowMs);
}
