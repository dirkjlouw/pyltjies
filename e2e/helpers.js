// Creates signed-in people straight in the database, so each test starts clean without using up the
// sign-in rate limits. e2e/auth.spec.js covers the real sign-in on screen.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const logFile = () => path.join(process.env.E2E_ROOT, 'server.log');

export async function seedUser(context, { role = 'member', name = 'Test person' } = {}) {
  const id = crypto.randomUUID();
  const email = `seed-${id}@example.com`;
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const db = new DatabaseSync(path.join(process.env.E2E_ROOT, 'data', 'pyltjies.db'));
  db.exec('PRAGMA busy_timeout = 5000');
  const now = Date.now();
  db.prepare('INSERT INTO users (id, email, name, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, name, role, now, now);
  if (context) {
    db.prepare('INSERT INTO sessions (id, user_id, token_hash, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), id, hash, 'Test', now, now);
    await context.addCookies([{ name: 'pyltjies', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  db.close();
  return { id, email, name };
}

export async function lastCode(email) {
  const pattern = new RegExp(`to=${email.replace(/[.+]/g, '\\$&')} subject="Pyltjies code: (\\d{6})"`, 'g');
  for (let i = 0; i < 40; i++) {
    const found = [...fs.readFileSync(logFile(), 'utf8').matchAll(pattern)];
    if (found.length) return found.at(-1)[1];
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  throw new Error(`No code logged for ${email}`);
}

/** Tests share one league, so each uses unique names. */
export const uniqueName = (base) => `${base} ${crypto.randomUUID().slice(0, 8)}`;

export async function dart(page, label, multiplier = 'Single') {
  await page.getByRole('group', { name: 'Multiplier' }).getByRole('button', { name: multiplier, exact: true }).click();
  const pad = page.locator('.pad');
  await pad.getByRole('button', { name: String(label), exact: true }).first().click();
}

/** A Killer double or treble that asks where it goes: `row` is the start of the button, such as '20 row' or 'T row'. */
export async function place(page, row) {
  await page.locator('.choices').getByRole('button', { name: new RegExp(`^${row}:`) }).click();
}
