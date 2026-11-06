// Flows in real browser engines: WebKit = Safari, Chromium = Chrome, Edge and Brave, Gecko = Firefox.
// These are the engines with simulated devices, not real phones.
// Run in the Playwright Docker image (same as CI):
//   docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.64.1-noble sh -c "npm ci && npx playwright test"

import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8294;
// Workers reload this config, so the runner's folder is passed down in the environment.
const ROOT = (process.env.E2E_ROOT ||= fs.mkdtempSync(path.join(os.tmpdir(), 'pyltjies-e2e-')));

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', timezoneId: 'Africa/Johannesburg', locale: 'en-ZA' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    // Sideways skips sign-in: more runs would hit the app's limit of 10 code requests per 15 minutes.
    { name: 'iphone-sideways', use: { ...devices['iPhone 13 landscape'] }, testIgnore: 'auth.spec.js' },
    { name: 'android-sideways', use: { ...devices['Pixel 7 landscape'] }, testIgnore: 'auth.spec.js' },
  ],
  webServer: {
    command: `node --disable-warning=ExperimentalWarning server/server.js > "${path.join(ROOT, 'server.log')}" 2>&1`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT), APP_DIR: 'app', DATA_DIR: path.join(ROOT, 'data'), OWNER_EMAIL: 'owner@example.com',
      SMTP_HOST: '', TRUST_PROXY: '0',
    },
  },
});
