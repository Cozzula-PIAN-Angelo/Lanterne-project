import { expect, test } from "vitest";
import { fixedClock, offsetClock, parseDevOffset } from "./clock";

test("fixedClock restituisce sempre lo stesso istante", () => {
  const c = fixedClock(new Date("2026-11-02T10:00:00Z"));
  expect(c.now().toISOString()).toBe("2026-11-02T10:00:00.000Z");
});

test("offsetClock sposta in avanti", () => {
  const c = offsetClock(fixedClock(new Date("2026-11-02T10:00:00Z")), 3_600_000);
  expect(c.now().toISOString()).toBe("2026-11-02T11:00:00.000Z");
});

test("parseDevOffset vale solo in development", () => {
  expect(parseDevOffset("3600000", "development")).toBe(3_600_000);
  expect(parseDevOffset("3600000", "production")).toBe(0);
  expect(parseDevOffset("3600000", "test")).toBe(0);
  expect(parseDevOffset("abc", "development")).toBe(0);
  expect(parseDevOffset(undefined, "development")).toBe(0);
});
