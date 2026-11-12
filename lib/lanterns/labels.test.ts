import { describe, expect, it } from "vitest";
import { lanternLabel } from "./labels";

const label = (type: "audio" | "photo" | "text" | "thought", durationSec: number | null, iso: string) =>
  lanternLabel({ type, senderName: "Giulia", durationSec, createdAt: new Date(iso), viewerTz: "Europe/Rome" });

describe("lanternLabel", () => {
  it("descrive tipo, persona, durata e ora locale di chi guarda", () => {
    expect(label("audio", 180, "2026-11-02T08:14:00Z")).toBe("Vocale di Giulia, 3 minuti, delle 9:14");
    expect(label("audio", 20, "2026-11-02T08:14:00Z")).toBe("Vocale di Giulia, meno di un minuto, delle 9:14");
    expect(label("photo", null, "2026-11-02T08:14:00Z")).toBe("Foto di Giulia, delle 9:14");
    expect(label("text", null, "2026-11-02T08:14:00Z")).toBe("Testo di Giulia, delle 9:14");
    expect(label("thought", null, "2026-11-02T08:14:00Z")).toBe("Pensiero di Giulia, delle 9:14");
  });

  it("scrive bene l'una e la mezzanotte", () => {
    expect(label("photo", null, "2026-11-02T00:15:00Z")).toBe("Foto di Giulia, dell'1:15");
    expect(label("photo", null, "2026-11-01T23:00:00Z")).toBe("Foto di Giulia, di mezzanotte");
  });
});
