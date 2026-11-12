import { describe, expect, test } from "vitest";
import { localInstant, nextOccurrence, previousOccurrence } from "./reveal-time";
import { isLanternLit, nextSkyChange, skyPhase, type SkyLocation } from "./sky";

/** "2026-12-15 16:20" in ora locale di `tz`. */
function local(s: string, tz: string): Date {
  const [date, time] = s.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  return localInstant({ year, month, day }, time, tz);
}

/** Come farà il server: ultimo arrivo incluso l'istante, prossimo strettamente dopo. */
function input(now: Date, tz: string, revealTime: string, location?: SkyLocation) {
  return {
    now,
    tz,
    lastArrivalAt: previousOccurrence(revealTime, tz, now),
    nextArrivalAt: nextOccurrence(revealTime, tz, now),
    location,
  };
}

const ROME = "Europe/Rome";
const rome = { lat: 41.9, lng: 12.5 };

describe("senza posizione, apertura 21:30 a Roma", () => {
  test.each([
    ["2026-11-12 20:29", "day"],
    ["2026-11-12 20:30", "sunset"],
    ["2026-11-12 21:29", "sunset"],
    ["2026-11-12 21:30", "night"],
    ["2026-11-13 05:59", "night"],
    ["2026-11-13 06:00", "day"],
  ])("%s → %s", (at, phase) => {
    expect(skyPhase(input(local(at, ROME), ROME, "21:30"))).toBe(phase);
  });
});

test("apertura a mezzanotte: tramonto dalle 23, notte fino alle 06", () => {
  const phase = (at: string) => skyPhase(input(local(at, ROME), ROME, "00:00"));
  expect(phase("2026-11-12 22:59")).toBe("day");
  expect(phase("2026-11-12 23:00")).toBe("sunset");
  expect(phase("2026-11-13 00:00")).toBe("night");
  expect(phase("2026-11-13 05:59")).toBe("night");
  expect(phase("2026-11-13 06:00")).toBe("day");
});

test("notte del passaggio all'ora legale, mezzanotte a Roma", () => {
  const phase = (iso: string) => skyPhase(input(new Date(iso), ROME, "00:00"));
  expect(phase("2026-03-29T03:59:00Z")).toBe("night");
  expect(phase("2026-03-29T04:00:00Z")).toBe("day");
});

test("con posizione a Roma il 15 dicembre: tramonto reale, poi crepuscolo", () => {
  const phase = (at: string) => skyPhase(input(local(at, ROME), ROME, "21:30", rome));
  expect(phase("2026-12-15 15:00")).toBe("day");
  expect(phase("2026-12-15 16:20")).toBe("sunset");
  expect(phase("2026-12-15 18:00")).toBe("dusk");
  expect(phase("2026-12-15 21:29")).toBe("dusk");
  expect(phase("2026-12-15 21:30")).toBe("night");
});

test("con posizione a Roma il 21 giugno", () => {
  const phase = (at: string) => skyPhase(input(local(at, ROME), ROME, "21:30", rome));
  expect(phase("2026-06-21 19:30")).toBe("day");
  expect(phase("2026-06-21 20:30")).toBe("sunset");
  expect(phase("2026-06-21 21:00")).toBe("dusk");
  expect(phase("2026-06-21 21:30")).toBe("night");
});

test("tramonto dopo l'apertura: vince l'apertura", () => {
  const phase = (at: string) => skyPhase(input(local(at, ROME), ROME, "17:00", rome));
  expect(phase("2026-06-21 15:59")).toBe("day");
  expect(phase("2026-06-21 16:00")).toBe("sunset");
  expect(phase("2026-06-21 17:00")).toBe("night");
});

test("sole di mezzanotte a Tromsø: si usano le fasi senza posizione", () => {
  const tz = "Europe/Oslo";
  const tromso = { lat: 69.65, lng: 18.96 };
  const phase = (at: string) => skyPhase(input(local(at, tz), tz, "21:30", tromso));
  expect(phase("2026-06-21 20:29")).toBe("day");
  expect(phase("2026-06-21 20:30")).toBe("sunset");
  expect(phase("2026-06-21 21:30")).toBe("night");
});

test("senza orario concordato è sempre giorno", () => {
  const now = local("2026-11-12 22:00", ROME);
  expect(skyPhase({ now, tz: ROME, lastArrivalAt: null, nextArrivalAt: null })).toBe("day");
});

test("una propria lanterna si accende un'ora prima della partenza", () => {
  const departure = local("2026-11-12 21:00", ROME);
  const at = (minutes: number) => new Date(departure.getTime() + minutes * 60_000);
  expect(isLanternLit(at(-61), departure)).toBe(false);
  expect(isLanternLit(at(-60), departure)).toBe(true);
  expect(isLanternLit(at(5), departure)).toBe(true);
});

test("nextSkyChange trova il primo confine", () => {
  const departures = [local("2026-11-12 21:00", ROME)];
  const next = (at: string) => nextSkyChange({ ...input(local(at, ROME), ROME, "21:30") }, departures);
  expect(next("2026-11-12 19:50")?.toISOString()).toBe(local("2026-11-12 20:00", ROME).toISOString());
  expect(next("2026-11-12 20:10")?.toISOString()).toBe(local("2026-11-12 20:30", ROME).toISOString());
  expect(next("2026-11-12 21:45")?.toISOString()).toBe(local("2026-11-13 06:00", ROME).toISOString());
});

test("nextSkyChange senza niente in programma è null", () => {
  const now = local("2026-11-12 22:00", ROME);
  expect(nextSkyChange({ now, tz: ROME, lastArrivalAt: null, nextArrivalAt: null }, [])).toBeNull();
});
