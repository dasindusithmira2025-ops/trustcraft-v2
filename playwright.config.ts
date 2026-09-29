import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // A private database and build directory: e2e never touches (or is disturbed by) the main dev server.
  webServer: {
    // A production build: faster than compiling routes on demand, and it proves the build itself.
    command: `pnpm build && pnpm start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 420_000,
    env: { PGLITE_DIR: ".data/e2e", UPLOADS_DIR: ".data/e2e-uploads", NEXT_DIST_DIR: ".next-e2e", TC_RATE_LIMIT_IP_SCALE: "1000", TC_DEMO: "1" },
  },
});
