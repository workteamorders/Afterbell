import { defineConfig } from "@playwright/test";

/**
 * Uji e2e berjalan terhadap hasil build statis (out/) yang dilayani scripts/static-server.mjs.
 * Seluruh jaringan (Jupiter, /api/rpc) dipalsukan di tests/e2e/mocks.ts, jadi uji tidak menyentuh jaringan nyata.
 * CHROME_PATH dapat menunjuk ke Chromium yang sudah terpasang.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
  },
  webServer: {
    command: "node scripts/static-server.mjs",
    url: "http://localhost:4173/explore",
    reuseExistingServer: true,
    env: { PORT: "4173" },
  },
});
