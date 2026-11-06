import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// An app left open has to pick up a new release by itself. This serves its own copy of app/,
// so a release can be swapped in underneath the open page.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

test('an open app reloads itself when a new release ships', async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyltjies-update-'));
  fs.cpSync('app', dir, { recursive: true });
  const release = (version) => {
    fs.writeFileSync(path.join(dir, 'version.js'), `export const APP_VERSION = '${version}';\n`);
    const worker = fs.readFileSync('app/sw.js', 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = 'pyltjies-${version}'`);
    fs.writeFileSync(path.join(dir, 'sw.js'), worker);
  };
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html');
    const file = path.join(dir, name);
    if (name.includes('..') || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  try {
    release('9.0.0');
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.locator('#version')).toHaveText('Pyltjies 9.0.0');
    // The first install must not reload the page.
    await page.evaluate(() => { window.stillThisPage = true; });

    release('9.0.1');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#version')).toHaveText('Pyltjies 9.0.1');
    expect(await page.evaluate(() => window.stillThisPage ?? false)).toBe(false);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
