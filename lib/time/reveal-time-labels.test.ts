import { describe, expect, it } from "vitest";
import { atRevealTime, ofRevealTime } from "./format";
import { isAllowedRevealTime, revealTimeOptions } from "./reveal-time";

describe("etichette di un orario di apertura", () => {
  it("scrive l'ora con la preposizione giusta", () => {
    expect(atRevealTime("21:30")).toBe("alle 21:30");
    expect(ofRevealTime("21:30")).toBe("delle 21:30");
  });

  it("non scrive mai 00:00", () => {
    expect(atRevealTime("00:00")).toBe("a mezzanotte");
    expect(ofRevealTime("00:00")).toBe("di mezzanotte");
  });
});

describe("revealTimeOptions", () => {
  it("va dalle 17:00 alle 23:45 ogni 15 minuti, più mezzanotte", () => {
    const options = revealTimeOptions();
    expect(options).toHaveLength(29);
    expect(options[0]).toEqual({ value: "17:00", label: "17:00" });
    expect(options[1].value).toBe("17:15");
    expect(options[27].value).toBe("23:45");
    expect(options[28]).toEqual({ value: "00:00", label: "mezzanotte" });
  });

  it("propone solo orari consentiti", () => {
    expect(revealTimeOptions().every((o) => isAllowedRevealTime(o.value))).toBe(true);
  });
});
