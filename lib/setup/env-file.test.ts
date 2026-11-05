import { describe, expect, it } from "vitest";
import { prepareEnvFile } from "./env-file";

const EXAMPLE = "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=\nDEMO_LOGIN=true\n";

describe("prepareEnvFile", () => {
  it("senza .env parte dall'esempio e genera il segreto", () => {
    expect(prepareEnvFile(EXAMPLE, undefined, "s3gret0")).toBe(
      "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=s3gret0\nDEMO_LOGIN=true\n",
    );
  });

  it("non sovrascrive un segreto già impostato né le altre scelte", () => {
    const existing = "DATABASE_URL=postgres://mio\nBETTER_AUTH_SECRET=vecchio\n";
    expect(prepareEnvFile(EXAMPLE, existing, "nuovo")).toBe(existing);
  });

  it("riempie un segreto vuoto in un .env esistente, anche con i ritorni a capo di Windows", () => {
    expect(prepareEnvFile(EXAMPLE, "A=1\r\nBETTER_AUTH_SECRET=\r\nB=2\r\n", "nuovo")).toBe(
      "A=1\r\nBETTER_AUTH_SECRET=nuovo\r\nB=2\r\n",
    );
  });
});
