import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", grep: /@desktop/, use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "ipad", grep: /@tablet/, use: { ...devices["iPad Pro 11"], browserName: "chromium" } },
    { name: "phone", grep: /@compact/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
