import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4322", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "pnpm exec vite --config tests/vite.config.ts",
    url: "http://127.0.0.1:4322/tests/fixtures/editor.html",
    reuseExistingServer: !process.env.CI,
  },
})
