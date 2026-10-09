import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '1420';

// The app runs inside WKWebView, i.e. WebKit — that is the engine these tests use.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1360, height: 860 } } }],
  // reuses a dev server that is already running on the port (e.g. `tauri dev`), otherwise starts one
  webServer: { command: `npx vite --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
});
