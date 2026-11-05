import { expect, test } from "vitest";
import { isAllowedRevealTime, nextOccurrence, previousOccurrence } from "./reveal-time";

test.each([
  ["17:00", true], ["16:59", false], ["23:59", true], ["00:00", true],
  ["00:01", false], ["24:00", false], ["9:30", false], ["21:3", false],
])("isAllowedRevealTime(%s) = %s", (s, ok) => expect(isAllowedRevealTime(s)).toBe(ok));

test("21:30 a Roma: stesso giorno se prima, giorno dopo se all'orario esatto", () => {
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T20:29:59Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T20:30:00Z")).toISOString()).toBe("2026-11-03T20:30:00.000Z");
});

test("mezzanotte a Roma", () => {
  expect(nextOccurrence("00:00", "Europe/Rome", new Date("2026-11-02T22:50:00Z")).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  expect(nextOccurrence("00:00", "Europe/Rome", new Date("2026-11-02T23:10:00Z")).toISOString()).toBe("2026-11-03T23:00:00.000Z");
});

test("cambio d'ora legale a Roma (25 ottobre 2026)", () => {
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-10-24T20:00:00Z")).toISOString()).toBe("2026-10-25T20:30:00.000Z");
});

test("previousOccurrence", () => {
  expect(previousOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T22:00:00Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(previousOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T10:00:00Z")).toISOString()).toBe("2026-11-01T20:30:00.000Z");
});
