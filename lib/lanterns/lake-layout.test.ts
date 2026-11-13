import { describe, expect, test } from "vitest";
import { lanternShape, lanternSize, lanternSpot, type LakeArea } from "./lake-layout";

const Y: Record<LakeArea, [number, number]> = { far: [34, 40], water: [46, 74], near: [76, 86] };

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

  test("la posizione dipende solo dall'id", () => {
    expect(lanternSpot("abc", 2, 5, "water")).toEqual(lanternSpot("abc", 2, 5, "water"));
    expect(lanternSpot("abc", 2, 5, "water")).not.toEqual(lanternSpot("abd", 2, 5, "water"));
  });

  test("40 lanterne restano tutte dentro la loro area", () => {
    for (const area of ["near", "water", "far"] as const) {
      for (let i = 0; i < 40; i++) {
        const { x, y } = lanternSpot(`lanterna-${i}`, i, 40, area);
        expect(x).toBeGreaterThanOrEqual(6);
        expect(x).toBeLessThanOrEqual(94);
        expect(y).toBeGreaterThanOrEqual(Y[area][0]);
        expect(y).toBeLessThanOrEqual(Y[area][1]);
      }
    }
  });
});
