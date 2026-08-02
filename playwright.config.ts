import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/demo",
  fullyParallel: true,
  // Capped locally on measured evidence. Two separate effects were found, and an earlier
  // version of this comment conflated them -- a cold audit separated them:
  //
  //   1. COLD CACHE. First run of the day, uncapped, with the Supabase stack also running:
  //      96 failed in 8.9m, almost all `page.goto: Test timeout` as workers queued behind
  //      each other's first Turbopack compiles. Environmental. The cap fixes it.
  //   2. WARM CACHE. Uncapped on the same machine (32 logical processors, so the default
  //      is 16 workers, not the 6 first claimed here): 1 and 2 failures across two runs --
  //      and BOTH were the same role-switch test. That one is not environmental. The
  //      select moves to Coach while the URL and screen stay on the parent view, which
  //      looks like interaction landing on server-rendered HTML before the client-side
  //      router.push handler has hydrated.
  //
  // So the cap is justified for (1) and MASKS (2). Effect (2) is a real, reproducible
  // test/app race and is tracked as outstanding work -- do not read a green local run as
  // evidence it is gone. CI keeps the default and will surface it.
  //
  // Phase 15d puts this suite inside a loop. A suite that fails most of the time for
  // environmental reasons trains you to ignore it, which is worse than not running it.
  workers: process.env.CI ? undefined : 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3107",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
