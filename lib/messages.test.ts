import { describe, expect, it } from "vitest";
import { errorMessage } from "./messages";

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
