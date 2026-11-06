import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { lastCode, seedUser, uniqueName } from './helpers.js';

test.use({ serviceWorkers: 'block' });

const nav = (page) => page.getByRole('navigation', { name: 'Main' });
const freshEmail = () => `person-${crypto.randomUUID()}@example.com`;

test('signed out, the app asks you to sign in and hides everything else', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(nav(page)).toBeHidden();
});

test("a stranger's email is refused", async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(freshEmail());
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('#signin-error')).toContainText('Ask a friend');
});

test('a member invites a friend, who joins with the link and sees the league', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const hostName = uniqueName('Dirk');
  await seedUser(hostContext, { name: hostName });
  const host = await hostContext.newPage();
  await host.goto('/');
  await nav(host).getByRole('button', { name: 'You' }).click();
  await host.evaluate(() => { window.sharedInvites = []; navigator.share = async (data) => { window.sharedInvites.push(data); }; });
  await host.getByRole('button', { name: 'Share an invite' }).click();
  await expect(host.locator('#invites .invite-link').first()).toBeVisible();
  await expect.poll(() => host.evaluate(() => window.sharedInvites.length)).toBe(1);
  expect(await host.evaluate(() => window.sharedInvites[0].url)).toContain('?invite=');
  const url = (await host.locator('#invites .invite-link').first().textContent()).trim();
  const invite = new URL(url).search;

  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await friend.goto(`/${invite}`);
  const email = freshEmail();
  await friend.getByLabel('Email', { exact: true }).fill(email);
  await friend.getByRole('button', { name: 'Send code' }).click();
  const friendName = uniqueName('Sam');
  await friend.getByLabel('Your name').fill(friendName);
  await friend.getByLabel('6-digit code').fill(await lastCode(email));
  await friend.getByRole('button', { name: 'Sign in' }).click();
  await expect(friend.locator('#who')).toHaveText(friendName);
  expect(new URL(friend.url()).search).toBe('');
  await expect(friend.getByRole('button', { name: hostName })).toBeVisible();
  await nav(friend).getByRole('button', { name: 'You' }).click();
  const line = friend.locator('#people li', { hasText: friendName });
  await expect(line).toContainText('New');
  await expect(line).toContainText('Joined');
  await expect(friend.locator('#people')).not.toContainText('last seen');

  await hostContext.close();
  await friendContext.close();
});

test('you stay signed in after closing and reopening', async ({ page, context }) => {
  const name = uniqueName('Stayer');
  await seedUser(context, { name });
  await page.goto('/');
  await expect(page.locator('#who')).toHaveText(name);
  await page.close();
  const again = await context.newPage();
  await again.goto('/');
  await expect(again.locator('#who')).toHaveText(name);
  await expect(again.getByRole('heading', { name: 'Sign in' })).toBeHidden();
});

test('signing out clears this phone', async ({ page, context }) => {
  await seedUser(context, { name: uniqueName('Leaver') });
  await page.goto('/');
  await expect(nav(page)).toBeVisible();
  await nav(page).getByRole('button', { name: 'You' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('pyltjies')))).toEqual([]);
});
