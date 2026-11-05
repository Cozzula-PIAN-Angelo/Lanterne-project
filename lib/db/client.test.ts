import { expect, test, vi } from "vitest";

test("fuori produzione il client del DB sopravvive al ricaricamento del modulo", async () => {
  const first = (await import("./client")).db;
  vi.resetModules();
  const second = (await import("./client")).db;
  expect(second).toBe(first);
});
