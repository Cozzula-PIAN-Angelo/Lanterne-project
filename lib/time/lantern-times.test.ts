import { expect, test } from "vitest";
import { computeRevealAt } from "./lantern-times";

const plain = { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null };

test("esempio della spec: Giulia (Roma) alle 23:00 → Marco (New York) alle sue 21:30", () => {
  expect(computeRevealAt(plain, "America/New_York", new Date("2026-11-02T22:00:00Z")).toISOString()).toBe("2026-11-03T02:30:00.000Z");
});

const changed = { revealTime: "20:00", previousRevealTime: "21:30", revealTimeChangedAt: new Date("2026-11-02T09:00:00Z") };

test("il cambio d'orario vale dal giorno dopo", () => {
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-02T12:00:00Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-02T21:00:00Z")).toISOString()).toBe("2026-11-03T19:00:00.000Z");
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-03T08:00:00Z")).toISOString()).toBe("2026-11-03T19:00:00.000Z");
});
