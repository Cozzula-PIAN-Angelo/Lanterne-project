import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

// I test di integrazione non devono mai toccare il database di sviluppo.
const env = config({ quiet: true }).parsed ?? {};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["lib/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["tests/helpers/global-setup.ts"],
          env: { ...env, DATABASE_URL: env.DATABASE_URL_TEST ?? "" },
        },
      },
    ],
  },
});
