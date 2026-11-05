import { describe, expect, it } from "vitest";
import { nextOccurrence } from "@/lib/time/reveal-time";
import { devOffsetCookieValue } from "./clock";

describe("devOffsetCookieValue", () => {
  it("in sviluppo restituisce il valore del cookie", () => {
    expect(devOffsetCookieValue(3_600_000, "development")).toBe("3600000");
    expect(devOffsetCookieValue(0, "development")).toBe("0");
  });

  it.each(["production", "test", undefined])("fuori dallo sviluppo si rifiuta (%s)", (env) => {
    expect(() => devOffsetCookieValue(1000, env)).toThrow();
  });

  it("rifiuta un valore che non è un numero finito", () => {
    expect(() => devOffsetCookieValue(Number.NaN, "development")).toThrow();
    expect(() => devOffsetCookieValue(Number.POSITIVE_INFINITY, "development")).toThrow();
  });
});

describe('"Domani mattina" del pannello', () => {
  it("sono le prossime 08:00 nel fuso di chi guarda", () => {
    const after = new Date("2026-11-05T09:00:00Z"); // le 10:00 a Roma: le 8 di oggi sono passate
    expect(nextOccurrence("08:00", "Europe/Rome", after).toISOString()).toBe("2026-11-06T07:00:00.000Z");
    const early = new Date("2026-11-05T05:00:00Z"); // le 6:00 a Roma
    expect(nextOccurrence("08:00", "Europe/Rome", early).toISOString()).toBe("2026-11-05T07:00:00.000Z");
  });
});
