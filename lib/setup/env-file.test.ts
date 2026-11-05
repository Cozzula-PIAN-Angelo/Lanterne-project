import { describe, expect, it } from "vitest";
import { prepareEnvFile } from "./env-file";

const EXAMPLE = "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=\nDEMO_LOGIN=true\n";
const SECRET = (value: string) => ({ BETTER_AUTH_SECRET: value });

describe("prepareEnvFile", () => {
  it("senza .env parte dall'esempio e genera il segreto", () => {
    expect(prepareEnvFile(EXAMPLE, undefined, SECRET("s3gret0"))).toBe(
      "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=s3gret0\nDEMO_LOGIN=true\n",
    );
  });

  it("non sovrascrive un segreto già impostato né le altre scelte", () => {
    const existing = "DATABASE_URL=postgres://mio\nBETTER_AUTH_SECRET=vecchio\nDEMO_LOGIN=false\n";
    expect(prepareEnvFile(EXAMPLE, existing, SECRET("nuovo"))).toBe(existing);
  });

  it("riempie un segreto vuoto in un .env esistente, anche con i ritorni a capo di Windows", () => {
    const existing = "DATABASE_URL=a\r\nBETTER_AUTH_SECRET=\r\nDEMO_LOGIN=b\r\n";
    expect(prepareEnvFile(EXAMPLE, existing, SECRET("nuovo"))).toBe(
      "DATABASE_URL=a\r\nBETTER_AUTH_SECRET=nuovo\r\nDEMO_LOGIN=b\r\n",
    );
  });

  it("aggiunge le chiavi nuove a un .env esistente senza toccare le altre", () => {
    const result = prepareEnvFile("A=1\nS3_BUCKET=lanterne\n", "A=personale\n", {});
    expect(result).toBe("A=personale\nS3_BUCKET=lanterne\n");
  });

  it("aggiunge le chiavi nuove anche se manca l'ultimo a capo, con quello del file", () => {
    expect(prepareEnvFile("A=1\nB=2\n", "A=personale", {})).toBe("A=personale\nB=2\n");
    expect(prepareEnvFile("A=1\nB=2\n", "A=personale\r\n", {})).toBe("A=personale\r\nB=2\r\n");
  });

  it("genera solo i segreti vuoti, comprese le chiavi appena aggiunte", () => {
    const result = prepareEnvFile(
      "BETTER_AUTH_SECRET=\nVAPID_PRIVATE_KEY=\n",
      "BETTER_AUTH_SECRET=gia\n",
      { BETTER_AUTH_SECRET: "x", VAPID_PRIVATE_KEY: "y" },
    );
    expect(result).toBe("BETTER_AUTH_SECRET=gia\nVAPID_PRIVATE_KEY=y\n");
  });

  it("ignora commenti e righe vuote dell'esempio", () => {
    expect(prepareEnvFile("# nota\n\nA=1\n", "A=2\n", {})).toBe("A=2\n");
  });
});
