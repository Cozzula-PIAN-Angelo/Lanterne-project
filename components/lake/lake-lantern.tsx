"use client";

import type { CSSProperties } from "react";
import type { LanternView } from "@/lib/access/lanterns";
import { lanternShape, lanternSize, type LakeArea } from "@/lib/lanterns/lake-layout";

/** Dove la lanterna arriva sull'acqua parte dalla riva lontana, poco sopra il 40 % della scena. */
const FAR_SHORE_Y = 40;

const RADIUS = { round: "9999px", dot: "9999px", square: "3px", oval: "50%" } as const;

type Props = {
  lantern: LanternView;
  label: string;
  color: string;
  lit: boolean;
  area: LakeArea;
  /** Posizione in % della scena; null quando le lanterne stanno ferme in fila. */
  spot: { x: number; y: number } | null;
  index: number;
  reflection: boolean;
  open: boolean;
  panelId: string;
  onToggle: () => void;
};

/**
 * Una lanterna del lago: un pulsante fermo, almeno 32 × 32 px anche quando il segno è
 * un puntino di 7 px. Il movimento (galleggiare, scivolare, arrivare) sta tutto nel segno
 * dentro il pulsante, così il punto da toccare non si sposta.
 */
export function LakeLantern({ lantern, label, color, lit, area, spot, index, reflection, open, panelId, onToggle }: Props) {
  const { w, h } = lanternSize(lantern);
  const moving = spot !== null;
  const arriving = moving && area === "water";

  const mark: CSSProperties & Record<"--lantern", string> = {
    "--lantern": color,
    width: w,
    height: h,
    borderRadius: RADIUS[lanternShape(lantern.type)],
    animationDelay: `${-((index * 1.7) % 6)}s`,
    // Al tramonto si accendono una alla volta.
    transitionDelay: `${Math.min(index, 8) * 0.4}s`,
  };
  const arrive: CSSProperties & Record<"--arrive-from", string> = {
    "--arrive-from": `calc(${FAR_SHORE_Y - (spot?.y ?? FAR_SHORE_Y)} * var(--lake-h) / 100)`,
    animationDelay: `${Math.min(index, 8) * 0.35}s`,
  };

  return (
    <div
      role="listitem"
      className={moving ? "absolute -translate-1/2" : undefined}
      style={spot ? { left: `${spot.x}%`, top: `${spot.y}%` } : undefined}
    >
      <button
        type="button"
        id={`lanterna-${lantern.id}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-lit={lit ? "true" : "false"}
        onClick={onToggle}
        className="pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--lake-text)"
      >
        <span
          className={arriving ? "lake-drift block" : "block"}
          style={arriving ? { animationDuration: `${8 + (index % 4)}s`, animationDirection: index % 2 ? "alternate-reverse" : "alternate" } : undefined}
        >
          <span className={arriving ? "lake-arrive relative block" : "relative block"} style={arriving ? arrive : undefined}>
            <span
              data-lit={lit ? "true" : "false"}
              className={`lake-mark block ${moving ? "lake-bob" : ""} ${open ? "outline-2 outline-offset-2 outline-(--lake-text)" : ""}`}
              style={mark}
            />
            {reflection && (
              <span
                aria-hidden
                className="lake-reflection absolute top-full left-1/2 mt-1 block -translate-x-1/2"
                style={{ "--lantern": color, width: Math.max(3, Math.round(w / 5)), height: Math.min(30, h * 1.5) } as CSSProperties}
              />
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
