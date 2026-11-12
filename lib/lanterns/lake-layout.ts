import type { LanternView } from "@/lib/access/lanterns";

export type LanternShape = "round" | "square" | "oval" | "dot";
export type LakeArea = "near" | "water" | "far";

/** Fasce verticali (in % della scena) e margini orizzontali. */
const Y_RANGE: Record<LakeArea, [number, number]> = {
  far: [34, 40],
  water: [46, 74],
  near: [76, 86],
};
const X_MIN = 6;
const X_MAX = 94;
const GOLDEN = 0.6180339887498949;

export function lanternShape(type: LanternView["type"]): LanternShape {
  switch (type) {
    case "audio":
      return "round";
    case "photo":
      return "square";
    case "text":
      return "oval";
    case "thought":
      return "dot";
  }
}

/** Dimensione in px, arrotondata all'intero. */
export function lanternSize(l: Pick<LanternView, "type" | "text" | "durationSec">): { w: number; h: number } {
  switch (l.type) {
    case "audio": {
      const sec = Math.min(600, Math.max(1, l.durationSec ?? 1));
      const d = Math.round(14 + ((sec - 1) / 599) * 12);
      return { w: d, h: d };
    }
    case "text": {
      const len = Math.min(1000, Math.max(1, l.text?.length ?? 1));
      const w = Math.round(12 + ((len - 1) / 999) * 10);
      return { w, h: Math.round(w / 2) };
    }
    case "photo":
      return { w: 14, h: 14 };
    case "thought":
      return { w: 7, h: 7 };
  }
}

/** FNV-1a a 32 bit. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const frac = (n: number) => n - Math.floor(n);

/**
 * Posizione sul lago in % della scena. Deterministica: dipende da id e index
 * (l'offset aureo da `index` allarga le lanterne ed evita sovrapposizioni).
 * `count` non serve qui: lo usa solo `lanternRow`.
 */
export function lanternSpot(id: string, index: number, _count: number, area: LakeArea): { x: number; y: number } {
  const u = frac(fnv1a(id) / 2 ** 32 + index * GOLDEN);
  const v = frac(fnv1a(`${id}:y`) / 2 ** 32 + index * GOLDEN * GOLDEN);
  const [y0, y1] = Y_RANGE[area];
  return { x: X_MIN + u * (X_MAX - X_MIN), y: y0 + v * (y1 - y0) };
}

/** Disposizione in fila per `prefers-reduced-motion`: stessa altezza, da sinistra a destra. */
export function lanternRow(index: number, count: number, area: LakeArea): { x: number; y: number } {
  const [y0, y1] = Y_RANGE[area];
  const t = count <= 1 ? 0.5 : index / (count - 1);
  return { x: X_MIN + t * (X_MAX - X_MIN), y: (y0 + y1) / 2 };
}
