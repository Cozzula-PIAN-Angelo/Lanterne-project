import { expect, test } from "vitest";
import { formatCountdown, formatDepartureLabel, formatRevealLabel } from "./format";

test("formatRevealLabel", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  expect(formatRevealLabel(new Date("2026-11-02T20:30:00Z"), "Europe/Rome", now)).toBe("stasera alle 21:30");
  expect(formatRevealLabel(new Date("2026-11-02T23:00:00Z"), "Europe/Rome", now)).toBe("stanotte a mezzanotte");
  expect(formatRevealLabel(new Date("2026-11-03T20:30:00Z"), "Europe/Rome", now)).toBe("domani alle 21:30");
});

test("formatDepartureLabel mostra l'ora del destinatario se il fuso è diverso", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  expect(formatDepartureLabel(new Date("2026-11-03T02:30:00Z"), "Europe/Rome", "America/New_York", "Marco", now))
    .toBe("partono stanotte alle 3:30, le 21:30 di Marco");
  expect(formatDepartureLabel(new Date("2026-11-02T20:30:00Z"), "Europe/Rome", "Europe/Rome", "Giulia", now))
    .toBe("partono stasera alle 21:30");
});

test.each([
  [30_000, "tra meno di un minuto"], [60_000, "tra 1 minuto"], [25 * 60_000, "tra 25 minuti"],
  [60 * 60_000, "tra 1 ora"], [4.5 * 3_600_000, "tra 4 ore"],
])("formatCountdown(%d)", (ms, s) => expect(formatCountdown(ms)).toBe(s));

test("la parola dipende dall'ora locale di chi guarda", () => {
  expect(formatRevealLabel(new Date("2026-11-03T02:30:00Z"), "Europe/Rome", new Date("2026-11-03T00:00:00Z"))).toBe("stanotte alle 3:30");
  expect(formatRevealLabel(new Date("2026-11-02T20:30:00Z"), "America/New_York", new Date("2026-11-02T13:00:00Z"))).toBe("oggi alle 15:30");
  expect(formatRevealLabel(new Date("2026-11-04T23:00:00Z"), "Europe/Rome", new Date("2026-11-02T10:00:00Z"))).toBe("il 5 novembre a mezzanotte");
});

test("la mezzanotte del destinatario non si scrive 0:00", () => {
  expect(formatDepartureLabel(new Date("2026-11-03T05:00:00Z"), "Europe/Rome", "America/New_York", "Marco", new Date("2026-11-02T10:00:00Z")))
    .toBe("partono domani alle 6:00, la mezzanotte di Marco");
});
