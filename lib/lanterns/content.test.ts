import { describe, expect, it } from "vitest";
import { lanternContent } from "./content";

describe("lanternContent", () => {
  it("un pensiero si legge con la sua frase, non con l'id salvato", () => {
    expect(lanternContent({ type: "thought", text: "giornata-pesante" })).toBe("giornata pesante, ci sono");
  });

  it("un testo si legge così com'è", () => {
    expect(lanternContent({ type: "text", text: "ti-penso" })).toBe("ti-penso");
  });

  it("vocali e foto si descrivono a parole", () => {
    expect(lanternContent({ type: "audio", text: null, durationSec: 180 })).toBe("Vocale, 3 minuti");
    expect(lanternContent({ type: "photo", text: null })).toBe("Foto");
  });

  it("senza contenuto restituisce una stringa vuota", () => {
    expect(lanternContent({ type: "text", text: null })).toBe("");
  });
});
