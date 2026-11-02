import { expect, test } from "vitest";
import { cityFromTimeZone, isValidTimeZone } from "./timezone";

test("isValidTimeZone", () => {
  expect(isValidTimeZone("Europe/Rome")).toBe(true);
  expect(isValidTimeZone("Mars/Base")).toBe(false);
  expect(isValidTimeZone("")).toBe(false);
});

test("cityFromTimeZone", () => expect(cityFromTimeZone("America/New_York")).toBe("New York"));

test("isValidTimeZone rifiuta offset fissi e nomi non canonici", () => {
  expect(isValidTimeZone("+01:00")).toBe(false);
  expect(isValidTimeZone("europe/rome")).toBe(false);
  expect(isValidTimeZone("EST")).toBe(false);
  expect(isValidTimeZone("UTC")).toBe(true);
  expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
});
