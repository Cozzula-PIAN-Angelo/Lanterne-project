import { expect, test } from "vitest";
import { errorMessage, sendErrorMessage } from "./messages";

test("inviando, una connessione che non esiste più non promette un nuovo tentativo", () => {
  expect(sendErrorMessage("not_found")).toBe("Questa connessione non c'è più.");
});

test("inviando, gli altri errori restano quelli di sempre", () => {
  expect(sendErrorMessage("rate_limited")).toBe(errorMessage("rate_limited"));
  expect(sendErrorMessage("connection_not_active")).toBe(errorMessage("connection_not_active"));
});
