import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("accetta un percorso interno, con la sua query", () => {
    expect(safeNextPath("/invito/abc_-1")).toBe("/invito/abc_-1");
    expect(safeNextPath("/invita?code=x")).toBe("/invita?code=x");
  });

  it.each([
    ["sito esterno", "https://evil.example/x"],
    ["protocol-relative", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["tab che il browser ignora", "/\t/evil.example"],
    ["schema", "javascript:alert(1)"],
    ["percorso relativo", "invito/abc"],
    ["vuoto", ""],
  ])("rifiuta: %s", (_name, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("rifiuta ciò che non è una stringa", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(["/a", "/b"])).toBeNull();
  });
});
