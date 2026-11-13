import type { LanternView } from "@/lib/access/lanterns";

export type LanternShape = "round" | "square" | "oval" | "dot";
export type LakeArea = "near" | "water" | "far";

/**
 * Dimensione di riferimento della scena (26rem di altezza su un telefono di 390 px) e lato del
 * pulsante di una lanterna. Le distanze garantite più sotto valgono a questa misura; le posizioni
 * sono in %, quindi su schermi più larghi le lanterne si allontanano.
 */
export const SCENE_REF = { width: 390, height: 416 } as const;
export const BUTTON_PX = 32;

/**
 * Fasce verticali dei centri (in % della scena), con file a 8 punti (33 px): due per riva, tre sull'acqua;
 * tra fasce vicine restano almeno 48 px tra i centri, cioè 16 px tra i bordi dei pulsanti.
 */
export const Y_RANGE: Record<LakeArea, [number, number]> = {
  far: [30, 38],
  water: [50, 66],
  near: [79, 87],
};
const X_MIN = 6;
const X_MAX = 94;

/** Passo verticale tra le file: 33 px a riposo, 16,6 px quando l'area è affollata. */
const ROW_STEP = 8;
const DENSE_ROW_STEP = 4;
/** Colonne delle file pari; le dispari sono sfalsate di mezzo passo e ne hanno una in meno. */
const COLUMNS = 10;
/** Un piccolo scarto orizzontale dall'id (±2 px) toglie l'aria da griglia senza avvicinare troppo. */
const JITTER_PX = 2;
const JITTER = (JITTER_PX / SCENE_REF.width) * 100;

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

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

/** I posti a riposo di un'area, in ordine di file: file sfalsate, centri ad almeno 33 px. */
function restingSlots(area: LakeArea): { x: number; y: number }[] {
  const [y0, y1] = Y_RANGE[area];
  const left = X_MIN + JITTER;
  const pitch = (X_MAX - JITTER - left) / (COLUMNS - 1);
  return range(y0, y1, ROW_STEP).flatMap((y, row) => {
    const columns = row % 2 === 0 ? COLUMNS : COLUMNS - 1;
    const offset = row % 2 === 0 ? 0 : pitch / 2;
    return Array.from({ length: columns }, (_, col) => ({ x: left + offset + col * pitch, y }));
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Un passo vicino a 0,382 × n e primo con n: le prime lanterne finiscono lontane tra loro. */
function spreadStep(n: number): number {
  let step = Math.max(1, Math.round(n * 0.382));
  while (gcd(step, n) !== 1) step++;
  return step;
}

/** Quante lanterne entrano in un'area con i centri ad almeno 32 px. */
export function restingCapacity(area: LakeArea): number {
  return restingSlots(area).length;
}

/**
 * Posizione sul lago in % della scena, deterministica per la stessa lista ordinata.
 * Finché l'area ne contiene `count`, ogni lanterna ha un posto fisso (dipende solo da `index`,
 * così aggiungerne una non sposta le altre) e i centri restano ad almeno 32 px. Se sono di più,
 * l'area passa a file fitte a 16,6 px con le colonne ristrette: i pulsanti si toccano, ma il
 * centro di ognuno resta scoperto finché il passo orizzontale supera 16 px.
 */
export function lanternSpot(id: string, index: number, count: number, area: LakeArea): { x: number; y: number } {
  const slots = restingSlots(area);
  if (count <= slots.length) {
    const slot = slots[(index * spreadStep(slots.length)) % slots.length];
    const jitter = ((fnv1a(id) / 2 ** 32) * 2 - 1) * JITTER;
    return { x: slot.x + jitter, y: slot.y };
  }
  const [y0, y1] = Y_RANGE[area];
  const rows = range(y0, y1, DENSE_ROW_STEP);
  const columns = Math.ceil(count / rows.length);
  const col = Math.floor(index / rows.length);
  const x = columns <= 1 ? (X_MIN + X_MAX) / 2 : X_MIN + (col * (X_MAX - X_MIN)) / (columns - 1);
  return { x, y: rows[index % rows.length] };
}
