import { describe, expect, it } from "vitest";
import { baseMime, durationLabel } from "./media";

describe("baseMime", () => {
  it("toglie i parametri e normalizza", () => {
    expect(baseMime("audio/mp4;codecs=opus")).toBe("audio/mp4");
    expect(baseMime("Audio/WEBM; codecs=opus")).toBe("audio/webm");
    expect(baseMime("image/jpeg")).toBe("image/jpeg");
  });
});

describe("durationLabel", () => {
  it("dice la durata in minuti, senza numeri inutili sotto il minuto", () => {
    expect(durationLabel(30)).toBe("meno di un minuto");
    expect(durationLabel(59)).toBe("meno di un minuto");
    expect(durationLabel(60)).toBe("1 minuto");
    expect(durationLabel(90)).toBe("2 minuti");
    expect(durationLabel(180)).toBe("3 minuti");
    expect(durationLabel(600)).toBe("10 minuti");
  });
});
