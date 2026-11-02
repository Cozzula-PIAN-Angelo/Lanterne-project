import { expect, test } from "vitest";
import { cityFromTimeZone, isValidTimeZone } from "./timezone";

test("isValidTimeZone", () => {
  expect(isValidTimeZone("Europe/Rome")).toBe(true);
  expect(isValidTimeZone("Mars/Base")).toBe(false);
  expect(isValidTimeZone("")).toBe(false);
});

test("cityFromTimeZone", () => expect(cityFromTimeZone("America/New_York")).toBe("New York"));
