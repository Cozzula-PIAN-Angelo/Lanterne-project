import { describe, expect, test } from "vitest";
import {
  BUTTON_PX,
  lanternShape,
  lanternSize,
  lanternSpot,
  restingCapacity,
  SCENE_REF,
  Y_RANGE,
  type LakeArea,
} from "./lake-layout";

const AREAS = ["far", "water", "near"] as const;
/** Id sempre uguali ma sparsi come UUID. */
const ids = (n: number) => Array.from({ length: n }, (_, i) => `${(i * 2654435761) >>> 0}-lanterna-${i}`);
/** I centri in px alla misura di riferimento. */
const layout = (n: number, area: LakeArea) =>
  ids(n).map((id, i) => {
    const { x, y } = lanternSpot(id, i, n, area);
    return { x: (x * SCENE_REF.width) / 100, y: (y * SCENE_REF.height) / 100 };
  });

describe("lake-layout", () => {
  test("forma per tipo", () => {
    expect(lanternShape("audio")).toBe("round");
    expect(lanternShape("photo")).toBe("square");
    expect(lanternShape("text")).toBe("oval");
    expect(lanternShape("thought")).toBe("dot");
  });

  test("dimensione per lunghezza", () => {
    expect(lanternSize({ type: "audio", text: null, durationSec: 1 })).toEqual({ w: 14, h: 14 });
    expect(lanternSize({ type: "audio", text: null, durationSec: 600 })).toEqual({ w: 26, h: 26 });
    expect(lanternSize({ type: "audio", text: null, durationSec: 300 })).toEqual({ w: 20, h: 20 });
    expect(lanternSize({ type: "audio", text: null, durationSec: null })).toEqual({ w: 14, h: 14 });
    expect(lanternSize({ type: "text", text: "a".repeat(1000), durationSec: null })).toEqual({ w: 22, h: 11 });
    expect(lanternSize({ type: "text", text: "a", durationSec: null })).toEqual({ w: 12, h: 6 });
    expect(lanternSize({ type: "photo", text: null, durationSec: null })).toEqual({ w: 14, h: 14 });
    expect(lanternSize({ type: "thought", text: "ti-penso", durationSec: null })).toEqual({ w: 7, h: 7 });
  });

  test("la stessa lista ordinata dà sempre le stesse posizioni", () => {
    for (const area of AREAS) expect(layout(12, area)).toEqual(layout(12, area));
    expect(lanternSpot("abc", 2, 5, "water")).not.toEqual(lanternSpot("abd", 2, 5, "water"));
  });

  test("aggiungere una lanterna non sposta le altre finché c'è posto", () => {
    for (const area of AREAS) {
      const n = restingCapacity(area);
      expect(layout(n, area).slice(0, n - 1)).toEqual(layout(n - 1, area));
    }
  });

  test("40 lanterne restano tutte dentro la loro area", () => {
    for (const area of AREAS) {
      for (let i = 0; i < 40; i++) {
        const { x, y } = lanternSpot(`lanterna-${i}`, i, 40, area);
        expect(x).toBeGreaterThanOrEqual(6);
        expect(x).toBeLessThanOrEqual(94);
        expect(y).toBeGreaterThanOrEqual(Y_RANGE[area][0]);
        expect(y).toBeLessThanOrEqual(Y_RANGE[area][1]);
      }
    }
  });

  test("finché ci stanno, i centri della stessa area distano almeno 32 px (scena 390 × 416)", () => {
    for (const area of AREAS) {
      const capacity = restingCapacity(area);
      expect(capacity).toBeGreaterThanOrEqual(19);
      for (let n = 2; n <= capacity; n++) {
        const spots = layout(n, area);
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const d = Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y);
            expect(d, `${area}, ${n} lanterne, ${i}-${j}`).toBeGreaterThanOrEqual(BUTTON_PX);
          }
        }
      }
    }
  });

  test("tra aree vicine restano almeno 16 px tra i bordi dei pulsanti", () => {
    const px = (pct: number) => (pct * SCENE_REF.height) / 100;
    const gap = (upper: LakeArea, lower: LakeArea) =>
      px(Y_RANGE[lower][0]) - BUTTON_PX / 2 - (px(Y_RANGE[upper][1]) + BUTTON_PX / 2);
    expect(gap("far", "water")).toBeGreaterThanOrEqual(16);
    expect(gap("water", "near")).toBeGreaterThanOrEqual(16);
    // I pulsanti restano dentro la scena.
    expect(px(Y_RANGE.far[0]) - BUTTON_PX / 2).toBeGreaterThan(0);
    expect(px(Y_RANGE.near[1]) + BUTTON_PX / 2).toBeLessThan(SCENE_REF.height);
  });

  test("con più lanterne di quante ne stanno, il centro di ognuna resta scoperto", () => {
    for (const area of AREAS) {
      for (const n of [restingCapacity(area) + 1, 40, 63]) {
        const spots = layout(n, area);
        for (let i = 0; i < n; i++) {
          // Le lanterne dopo nella lista sono disegnate sopra: nessuna deve coprire il centro di i.
          for (let j = i + 1; j < n; j++) {
            const covered =
              Math.abs(spots[i].x - spots[j].x) <= BUTTON_PX / 2 && Math.abs(spots[i].y - spots[j].y) <= BUTTON_PX / 2;
            expect(covered, `${area}, ${n} lanterne, ${i} coperta da ${j}`).toBe(false);
          }
        }
      }
    }
  });
});
