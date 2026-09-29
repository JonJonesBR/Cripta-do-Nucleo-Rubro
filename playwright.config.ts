import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:4188",
    headless: true,
    channel: "msedge"
  },
  webServer: {
    command: "npm run dev -- --port 4188 --strictPort",
    url: "http://localhost:4188",
    reuseExistingServer: false,
    timeout: 30000
  }
});
