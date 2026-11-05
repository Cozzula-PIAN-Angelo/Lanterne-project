import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { prepareEnvFile } from "@/lib/setup/env-file";

const ENV_PATH = ".env";

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : undefined;
const content = prepareEnvFile(
  readFileSync(".env.example", "utf8"),
  existing,
  randomBytes(32).toString("base64url"),
);
if (content !== existing) {
  writeFileSync(ENV_PATH, content);
  console.log(".env aggiornato.");
}

execSync("pnpm db:migrate", { stdio: "inherit" });
execSync("pnpm db:seed", { stdio: "inherit" });

console.log(`
Tutto pronto.
  pnpm dev                 avvia l'app su http://localhost:3000
  Mailpit                  la posta di sviluppo è su http://localhost:8025
  Utenti demo              giulia@, marco@ e sara@lanterne.local (bottoni in /accedi)
`);
