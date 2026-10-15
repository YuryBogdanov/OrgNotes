import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '1420';

// The app runs inside WKWebView, i.e. WebKit — that is the engine these tests use.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // in CI one more try, and a test that passed only then is reported «flaky» — not hidden
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1360, height: 860 } } }],
  // reuses a dev server that is already running on the port (e.g. `tauri dev`), otherwise starts one
  webServer: { command: `npx vite --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
});
