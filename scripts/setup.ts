import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import webPush from "web-push";
import { prepareEnvFile } from "@/lib/setup/env-file";
import { createStorage } from "@/lib/storage/s3";

const ENV_PATH = ".env";

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : undefined;
const hasVapid = /^VAPID_PRIVATE_KEY=\S/m.test(existing ?? "");
const vapid = hasVapid ? undefined : webPush.generateVAPIDKeys();
const content = prepareEnvFile(readFileSync(".env.example", "utf8"), existing, {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  // Le due chiavi VAPID sono una coppia: si generano solo insieme.
  ...(vapid && { NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey }),
});
if (content !== existing) {
  writeFileSync(ENV_PATH, content);
  console.log(".env aggiornato.");
}

async function main() {
  const env = { ...process.env, ...config({ quiet: true }).parsed };
  for (const name of ["S3_BUCKET", "S3_BUCKET_TEST", "S3_BUCKET_E2E"]) {
    await createStorage({ ...env, S3_BUCKET: env[name] }).ensureBucket();
  }

  execSync("pnpm db:migrate", { stdio: "inherit" });
  execSync("pnpm db:seed", { stdio: "inherit" });

  console.log(`
Tutto pronto.
  pnpm dev                 avvia l'app su http://localhost:3000
  Mailpit                  la posta di sviluppo è su http://localhost:8025
  Storage S3               parte con pnpm s3, sulla porta 9000
  Utenti demo              giulia@, marco@ e sara@lanterne.local (bottoni in /accedi)
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
