import { describe, expect, it } from "vitest";
import { errorMessage, sendErrorMessage } from "./messages";

describe("errorMessage", () => {
  it("usa i testi concordati", () => {
    expect(errorMessage("invite_used")).toBe("Questo invito è già stato usato.");
    expect(errorMessage("connection_limit_other")).toBe("Questa persona ha già 5 connessioni.");
    expect(errorMessage("invalid_reveal_time")).toBe("Scegli un orario tra le 17:00 e mezzanotte.");
  });

  it("per gli altri codici usa il messaggio generico", () => {
    expect(errorMessage("forbidden")).toBe("Qualcosa non è andato, riproviamo tra poco.");
  });
});

describe("sendErrorMessage", () => {
  it("una connessione che non esiste più non promette un nuovo tentativo", () => {
    expect(sendErrorMessage("not_found")).toBe("Questa connessione non c'è più.");
  });

  it("gli altri errori restano quelli di sempre", () => {
    expect(sendErrorMessage("rate_limited")).toBe(errorMessage("rate_limited"));
    expect(sendErrorMessage("connection_not_active")).toBe(errorMessage("connection_not_active"));
  });
});
