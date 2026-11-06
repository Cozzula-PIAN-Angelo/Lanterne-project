import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm dev:web --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_E2E ?? "",
      S3_BUCKET: process.env.S3_BUCKET_E2E ?? "",
      BETTER_AUTH_URL: BASE_URL,
      DEMO_LOGIN: "true",
    },
  },
});
