"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrivedLantern, SentLantern } from "@/components/lantern-item";
import type { LanternView } from "@/lib/access/lanterns";
import { lanternLabel } from "@/lib/lanterns/labels";
import { lanternSpot, Y_RANGE, type LakeArea } from "@/lib/lanterns/lake-layout";
import { isLanternLit, nextSkyChange, skyPhase, type SkyInput, type SkyPhase } from "@/lib/time/sky";
import { LakeLantern } from "./lake-lantern";
import { useServerClock } from "./use-server-clock";

type Person = { name: string; color: string };

type Props = {
  serverNow: string;
  tz: string;
  lastArrivalAt: string | null;
  nextArrivalAt: string | null;
  me: Person;
  partner: Person;
  sent: LanternView[];
  arrived: LanternView[];
  partnerLeftNothing: boolean;
  connectionId: string;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Il sole o la luna: niente al crepuscolo, quando il sole è appena sceso. */
const DISC: Record<SkyPhase, CSSProperties | null> = {
  day: { top: "9%", right: "16%", width: 44, height: 44 },
  sunset: { top: "34%", left: "12%", width: 52, height: 52 },
  dusk: null,
  night: { top: "8%", right: "18%", width: 26, height: 26 },
};

/**
 * Un'area del lago. Di solito è solo un livello sopra la scena, dove ogni lanterna ha il suo
 * posto; con meno movimento diventa una fila che va a capo, ferma, nella fascia dell'area.
 */
function Area({ area, reduced, children }: { area: LakeArea; reduced: boolean; children: ReactNode }) {
  if (!reduced) return <div className="absolute inset-0">{children}</div>;
  const [y0, y1] = Y_RANGE[area];
  return (
    <div
      className="pointer-events-auto absolute inset-x-[6%] flex flex-wrap content-start gap-1 overflow-y-auto"
      style={{ top: `calc(${y0}% - 1rem)`, maxHeight: `calc(${y1 - y0}% + 2rem)` }}
    >
      {children}
    </div>
  );
}

function plural(n: number) {
  return n === 1 ? "1 lanterna pronta" : `${n} lanterne pronte`;
}

/**
 * Il canale come un lago (spec §10): la riva dell'altra persona in alto, l'acqua, la propria
 * riva in basso. I colori seguono il cielo (§6.5) sull'orologio del server.
 */
export function LakeScene({
  serverNow,
  tz,
  lastArrivalAt,
  nextArrivalAt,
  me,
  partner,
  sent,
  arrived,
  partnerLeftNothing,
  connectionId,
}: Props) {
  const gradientId = useId();
  const panelId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  const last = lastArrivalAt ? new Date(lastArrivalAt) : null;
  const next = nextArrivalAt ? new Date(nextArrivalAt) : null;
  // Passata l'apertura, la sera comincia subito, senza aspettare i dati nuovi dal server.
  const skyAt = (now: Date): SkyInput =>
    next && now.getTime() >= next.getTime()
      ? { now, tz, lastArrivalAt: next, nextArrivalAt: null }
      : { now, tz, lastArrivalAt: last, nextArrivalAt: next };
  const departures = sent.filter((l) => l.sealed).map((l) => l.revealAt);
  const now = useServerClock(serverNow, (at) => nextSkyChange(skyAt(at), departures));
  const phase = skyPhase(skyAt(now));

  useEffect(() => {
    if (openId) panelRef.current?.focus();
  }, [openId]);

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));
  const renderLantern = (l: LanternView, index: number, count: number, area: LakeArea, person: Person, lit: boolean) => (
    <LakeLantern
      key={l.id}
      lantern={l}
      label={lanternLabel({ ...l, senderName: person.name, viewerTz: tz })}
      color={person.color}
      lit={lit}
      area={area}
      spot={reduced ? null : lanternSpot(l.id, index, count, area)}
      index={index}
      reflection={!reduced && area === "water" && phase === "night"}
      open={openId === l.id}
      panelId={panelId}
      onToggle={() => toggle(l.id)}
    />
  );

  // L'indice è la posizione nella lista del server: le inviate per creazione, le arrivate per apertura.
  const mine = sent.map((l, index) => ({ l, index, sealed: l.revealAt.getTime() > now.getTime() }));
  const waiting = mine.filter((m) => m.sealed);
  const departed = mine.filter((m) => !m.sealed);

  const status =
    phase === "night" && partnerLeftNothing && arrived.length === 0
      ? `Stasera l'acqua è tranquilla: ${partner.name} non ha lasciato lanterne.`
      : arrived.length > 0
        ? "Tocca una lanterna per aprirla."
        : waiting.length > 0
          ? plural(waiting.length)
          : null;

  const openArrived = arrived.find((l) => l.id === openId);
  const openSent = sent.find((l) => l.id === openId);
  const disc = DISC[phase];

  return (
    <div className="space-y-4">
      <section
        aria-label="Il lago"
        data-phase={phase}
        className="lake-scene relative -mx-4 h-(--lake-h) overflow-hidden bg-linear-to-b from-(--lake-sky-top) to-(--lake-sky-bottom) to-40% sm:mx-0 sm:rounded-2xl"
      >
        {disc && <div aria-hidden className="absolute rounded-full bg-(--lake-disc)" style={disc} />}
        <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--lake-water-top)" }} />
              <stop offset="1" style={{ stopColor: "var(--lake-water-bottom)" }} />
            </linearGradient>
          </defs>
          <rect x="0" y="41.8" width="100" height="58.2" fill={`url(#${gradientId})`} />
          <path d="M0 41.5 Q12 37.6 25 39.4 T50 38.6 T75 39.2 T100 39.8 V42 H0Z" style={{ fill: "var(--lake-far)" }} />
          <g style={{ stroke: "var(--lake-ripple)", strokeOpacity: "var(--lake-ripple-opacity)" }}>
            <line x1="10" y1="51" x2="24" y2="51" vectorEffect="non-scaling-stroke" />
            <line x1="60" y1="57" x2="78" y2="57" vectorEffect="non-scaling-stroke" />
            <line x1="28" y1="65" x2="42" y2="65" vectorEffect="non-scaling-stroke" />
          </g>
          <path d="M0 74.5 Q14 71.6 28 73 T56 72.6 T100 73.2 V100 H0Z" style={{ fill: "var(--lake-near)" }} />
        </svg>

        <p className="absolute inset-x-0 top-[22%] text-center text-sm italic">la riva di {partner.name}</p>

        {arrived.length > 0 && (
          <div role="list" aria-label="Arrivate" className="pointer-events-none absolute inset-0">
            <Area area="water" reduced={reduced}>
              {arrived.map((l, index) => renderLantern(l, index, arrived.length, "water", partner, true))}
            </Area>
          </div>
        )}

        {sent.length > 0 && (
          <div role="list" aria-label="Le tue lanterne" className="pointer-events-none absolute inset-0">
            {departed.length > 0 && (
              <Area area="far" reduced={reduced}>
                {departed.map(({ l, index }) => renderLantern(l, index, sent.length, "far", me, isLanternLit(now, l.revealAt)))}
              </Area>
            )}
            {waiting.length > 0 && (
              <Area area="near" reduced={reduced}>
                {waiting.map(({ l, index }) => renderLantern(l, index, sent.length, "near", me, isLanternLit(now, l.revealAt)))}
              </Area>
            )}
          </div>
        )}

        {status && <p className="absolute inset-x-4 bottom-3 text-center text-sm italic">{status}</p>}
      </section>

      {(openArrived || openSent) && (
        <section
          ref={panelRef}
          id={panelId}
          aria-label="Lanterna aperta"
          tabIndex={-1}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {openArrived ? (
            <ArrivedLantern lantern={openArrived} connectionId={connectionId} viewerTz={tz} senderName={partner.name} />
          ) : (
            openSent && (
              <SentLantern lantern={openSent} connectionId={connectionId} viewerTz={tz} partnerName={partner.name} />
            )
          )}
        </section>
      )}
    </div>
  );
}
