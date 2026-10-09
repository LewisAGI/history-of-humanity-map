import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** The test workflow installs Chromium only. WebKit is added when that browser is already present. */
function webkitInstalled(): boolean {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    return readdirSync(root).some((name) => name.startsWith('webkit-'));
  } catch {
    return existsSync(root);
  }
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'iphone',
      use: {
        browserName: 'chromium',
        userAgent: devices['iPhone 13'].userAgent,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'landscape',
      use: {
        browserName: 'chromium',
        userAgent: devices['iPhone 15 landscape'].userAgent,
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
    ...(webkitInstalled()
      ? [
          {
            name: 'landscape-webkit',
            use: {
              ...devices['iPhone 15 landscape'],
              browserName: 'webkit' as const,
              deviceScaleFactor: 1,
            },
          },
        ]
      : []),
  ],
});
