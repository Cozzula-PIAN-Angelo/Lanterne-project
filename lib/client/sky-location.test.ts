import { expect, test } from "vitest";
import { readSkyLocation, roundCoord, saveSkyLocation } from "./sky-location";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as unknown as Storage,
  };
}

test("arrotonda a un decimale", () => {
  expect(roundCoord(41.9028)).toBe(41.9);
  expect(roundCoord(12.4964)).toBe(12.5);
  expect(roundCoord(-0.04)).toBe(-0);
});

test("salva e rilegge solo valori arrotondati", () => {
  const { data, storage } = memoryStorage();
  saveSkyLocation({ lat: 41.9028, lng: 12.4964 }, storage);
  const raw = [...data.values()].join("");
  expect(raw).toContain("41.9");
  expect(raw).toContain("12.5");
  expect(raw).not.toContain("41.90");
  expect(readSkyLocation(storage)).toEqual({ lat: 41.9, lng: 12.5 });
});

test("dati rotti o fuori intervallo → null", () => {
  const key = "lanterne:sky-location";
  for (const raw of ["{", JSON.stringify({ lat: 91, lng: 0 }), JSON.stringify({ lat: "a", lng: 0 }), JSON.stringify({ lat: 0, lng: 181 })]) {
    expect(readSkyLocation(memoryStorage({ [key]: raw }).storage)).toBeNull();
  }
  expect(readSkyLocation(memoryStorage().storage)).toBeNull();
});

test("storage che lancia → null, nessuna eccezione", () => {
  const throwing = {
    getItem: () => {
      throw new Error("bloccato");
    },
    setItem: () => {
      throw new Error("bloccato");
    },
    removeItem: () => {
      throw new Error("bloccato");
    },
  } as unknown as Storage;
  expect(readSkyLocation(throwing)).toBeNull();
  expect(() => saveSkyLocation({ lat: 1, lng: 1 }, throwing)).not.toThrow();
});
