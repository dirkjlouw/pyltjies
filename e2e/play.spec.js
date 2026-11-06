import { expect, test } from '@playwright/test';
import { dart, place, seedUser, uniqueName } from './helpers.js';

test.use({ serviceWorkers: 'block' });

const nav = (page) => page.getByRole('navigation', { name: 'Main' });

async function twoPlayers(context, page) {
  const meName = uniqueName('Dirk');
  const themName = uniqueName('Sam');
  await seedUser(context, { name: meName });
  await seedUser(null, { name: themName });
  await page.goto('/');
  await page.getByRole('group', { name: 'Players' }).getByRole('button', { name: themName }).click();
  return { meName, themName };
}

async function chooseRules(page, game, wanted) {
  await page.getByRole('group', { name: 'Game' }).getByRole('button', { name: game, exact: true }).click();
  for (const [label, on] of Object.entries(wanted)) await page.getByLabel(label).setChecked(on);
}

test('501: darts subtract, a typed total works, bust and undo behave', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  await chooseRules(page, '501', { 'Open on a double': false, 'Finish on a double': true });
  await page.getByRole('button', { name: 'Start game' }).click();

  const me = page.locator(`[data-player="${meName}"] .left`);
  const them = page.locator(`[data-player="${themName}"] .left`);
  await expect(me).toHaveText('501');

  await dart(page, '20', 'Treble');
  await expect(me).toHaveText('441');
  await dart(page, '20');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(me).toHaveText('441');
  await dart(page, '19', 'Treble');
  await dart(page, 'Miss');
  await expect(me).toHaveText('384');
  await expect(page.locator('.status')).toContainText(themName);

  await page.getByRole('button', { name: 'Three-dart total' }).click();
  await page.locator('#total-input').fill('179');
  await page.getByRole('button', { name: 'Score it' }).click();
  await expect(page.locator('.toast')).toContainText("can't make that");
  await page.locator('#total-input').fill('85');
  await page.getByRole('button', { name: 'Score it' }).click();
  await expect(them).toHaveText('416');
  await expect(page.locator('.status')).toContainText(meName);
});

test('a head start and double-out finish, saved to the ladder and banter, with banter added', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  await chooseRules(page, '301', { 'Open on a double': false, 'Finish on a double': true });
  await page.getByLabel(`${meName} head start`).fill('180');
  await page.getByLabel(`${meName} head start`).blur();
  await page.getByRole('button', { name: 'Start game' }).click();
  const me = page.locator(`[data-player="${meName}"] .left`);
  await expect(me).toHaveText('121');

  await dart(page, '20', 'Treble');
  await dart(page, '20');
  await dart(page, '1');
  await expect(me).toHaveText('40');
  await page.getByRole('button', { name: 'Three-dart total' }).click();
  await page.locator('#total-input').fill('60');
  await page.getByRole('button', { name: 'Score it' }).click();
  await page.getByRole('button', { name: 'Dart by dart' }).click();
  await dart(page, '20');
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(me).toHaveText('20');
  await dart(page, '10');
  await expect(me).toHaveText('10');
  await dart(page, '5', 'Double');
  await expect(page.getByRole('heading', { name: `${meName} wins` })).toBeVisible();

  await page.getByRole('button', { name: 'Undo last dart' }).click();
  await expect(me).toHaveText('10');
  await dart(page, '5', 'Double');
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await expect(page.locator('#waiting')).toHaveCount(0);

  await page.getByRole('button', { name: 'See the banter' }).click();
  const card = page.locator('.match', { hasText: meName }).first();
  await expect(card).toContainText('301, straight in, double out');
  await card.getByLabel('Add banter').fill('Pure skill, <b>obviously</b>');
  await card.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.match', { hasText: meName }).first().locator('.comments')).toContainText('Pure skill, <b>obviously</b>');

  await nav(page).getByRole('button', { name: 'Ladder' }).click();
  const row = page.locator('#ladder tr', { hasText: meName });
  await expect(row).toContainText('(you)');
  await expect(row.locator('td').nth(2)).toHaveText('3');
  await expect(page.locator('#rivals')).toContainText(`${themName}: 1 won, 0 lost`);
  await expect(page.locator('#handicaps')).toContainText('not rated yet');
});

test('a bust is called out and puts the score back', async ({ page, context }) => {
  const { meName } = await twoPlayers(context, page);
  await chooseRules(page, '301', { 'Open on a double': false, 'Finish on a double': false });
  await page.getByLabel(`${meName} head start`).fill('180');
  await page.getByLabel(`${meName} head start`).blur();
  await page.getByRole('button', { name: 'Start game' }).click();
  const me = page.locator(`[data-player="${meName}"] .left`);
  await page.getByRole('button', { name: 'Three-dart total' }).click();
  await page.locator('#total-input').fill('140');
  await page.getByRole('button', { name: 'Score it' }).click();
  await expect(me).toHaveText('121');
  await expect(page.locator('.toast')).toHaveText('Bust');
});

test('Killer: the board marks, opens, scores, closes and goes dead', async ({ page, context }) => {
  const { themName } = await twoPlayers(context, page);
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': true, 'Dead numbers count on D and T': true });
  await page.getByRole('button', { name: 'Start game' }).click();

  const row = (name) => page.locator(`.board tr[data-row="${name}"]`);
  const marks = (name, side) => row(name).locator(`td[data-side="${side}"]`);

  await dart(page, '20', 'Treble');
  await place(page, '20 row');
  await expect(marks(20, 0)).toHaveText('XXX');
  await dart(page, '20');
  await expect(page.locator('#score-0')).toHaveText('20');
  await dart(page, '5', 'Double');
  await expect(marks('D', 0)).toHaveText('X');
  await expect(page.locator('.status')).toContainText(themName);

  await dart(page, '20', 'Treble');
  await place(page, '20 row');
  await expect(marks(20, 1)).toHaveText('XXX');
  await expect(row(20)).toHaveClass(/dead/);
  await dart(page, 'Miss');
  await dart(page, 'Miss');

  await dart(page, '20');
  await expect(page.locator('.toast')).toContainText('dead');
  await expect(page.locator('#score-0')).toHaveText('20');
  await dart(page, '20', 'Treble');
  await expect(marks('T', 0)).toHaveText('X');
});

test('Killer: per-player rules, so his doubles count and mine place on a row', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  await page.getByRole('group', { name: 'Game' }).getByRole('button', { name: 'Killer', exact: true }).click();
  await page.getByLabel('Different rules per player').check();
  const mine = page.locator(`[data-rules-for="${meName}"]`);
  const theirs = page.locator(`[data-rules-for="${themName}"]`);
  await mine.getByLabel('1 to 9 count on D and T').uncheck();
  await page.locator(`[data-rules-for="${meName}"]`).getByLabel('Dead numbers count on D and T').uncheck();
  await expect(page.locator(`[data-rules-for="${themName}"]`).getByLabel('1 to 9 count on D and T')).toBeChecked();
  await expect(theirs).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();

  const marks = (name, side) => page.locator(`.board tr[data-row="${name}"] td[data-side="${side}"]`);

  // Mine: no 1 to 9 buttons.
  await page.getByRole('group', { name: 'Multiplier' }).getByRole('button', { name: 'Double', exact: true }).click();
  await expect(page.locator('.pad').getByRole('button', { name: '5', exact: true })).toHaveCount(0);
  await dart(page, '20', 'Treble');
  await place(page, 'T row');
  await expect(marks('T', 0)).toHaveText('X');
  await expect(marks(20, 0)).toHaveText('');
  await dart(page, '20', 'Treble');
  await place(page, '20 row');
  await expect(marks(20, 0)).toHaveText('XXX');
  await dart(page, 'Miss');

  // Theirs: a double 5 counts straight away, with no question.
  await dart(page, '5', 'Double');
  await expect(marks('D', 1)).toHaveText('X');

  await page.getByRole('button', { name: 'End now' }).click().catch(() => {});
});

test('Killer: the end-now button gives it to the higher score', async ({ page, context }) => {
  const { meName } = await twoPlayers(context, page);
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': true, 'Dead numbers count on D and T': true });
  await page.getByRole('button', { name: 'Start game' }).click();
  await dart(page, '20', 'Treble');
  await place(page, '20 row');
  await dart(page, '20');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'End now' }).click();
  await expect(page.getByRole('heading', { name: `${meName} wins` })).toBeVisible();
});

test('a game survives closing the app, and a result made offline is sent later', async ({ page, context }) => {
  const { meName } = await twoPlayers(context, page);
  await chooseRules(page, '301', { 'Open on a double': false, 'Finish on a double': false });
  await page.getByLabel(`${meName} head start`).fill('180');
  await page.getByLabel(`${meName} head start`).blur();
  await page.getByRole('button', { name: 'Start game' }).click();
  await dart(page, '20', 'Treble');
  await page.reload();
  const me = page.locator(`[data-player="${meName}"] .left`);
  await expect(me).toHaveText('61');
  await dart(page, '20', 'Treble');
  await dart(page, '1');
  await expect(page.getByRole('heading', { name: `${meName} wins` })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.locator('#waiting')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => {
    const league = await page.request.get('/api/league').then((res) => res.json());
    return league.ladder.find((player) => player.name === meName)?.wins;
  }).toBe(1);
});

test('sharing sends the banter and scores', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.shared = [];
    navigator.canShare = () => false;
    navigator.share = async (data) => { window.shared.push(data); };
  });
  const { meName } = await twoPlayers(context, page);
  await chooseRules(page, '301', { 'Open on a double': false, 'Finish on a double': false });
  await page.getByLabel(`${meName} head start`).fill('180');
  await page.getByLabel(`${meName} head start`).blur();
  await page.getByRole('button', { name: 'Start game' }).click();
  await dart(page, '20', 'Treble');
  await dart(page, '20', 'Treble');
  await dart(page, '1');
  await page.getByRole('button', { name: 'Save result' }).click();
  await page.getByRole('button', { name: 'Share result' }).click();
  await expect.poll(() => page.evaluate(() => window.shared.length)).toBe(1);
  const { text } = await page.evaluate(() => window.shared[0]);
  expect(text).toContain(`${meName} 0 left`);
  expect(text).toContain('Pyltjies, for tossers');
});

test('the game screen fits a phone with no sideways scrolling', async ({ page, context }) => {
  await twoPlayers(context, page);
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': true, 'Dead numbers count on D and T': true });
  await page.getByRole('button', { name: 'Start game' }).click();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('the saloon look: DOS header and menu, snooker ball ranks, nothing unreadable', async ({ page, context }) => {
  const { meName } = await twoPlayers(context, page);
  await expect(page.locator('.prompt')).toHaveText('C:\\DARTS>');
  await expect(page.locator('#who')).toHaveText(meName);
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(255, 255, 85)');
  await expect(page.locator('.top')).toHaveCSS('background-color', 'rgb(0, 0, 170)');
  await nav(page).getByRole('button', { name: 'Ladder' }).click();
  const firstBall = page.locator('#ladder .ball').first();
  await expect(firstBall).toHaveText('1');
  await expect(firstBall).toHaveClass(/ball-1/);
  await expect(page.locator('#ladder .rank').first()).toHaveText('Sheriff');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('Killer: the choice shows what each option would do', async ({ page, context }) => {
  await twoPlayers(context, page);
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': false, 'Dead numbers count on D and T': false });
  await page.getByRole('button', { name: 'Start game' }).click();
  const choices = page.locator('.choices');

  await dart(page, '18', 'Treble');
  await expect(choices).toContainText('18 row: 3 marks');
  await expect(choices).toContainText('T row: 1 mark');
  await choices.getByRole('button', { name: 'Back' }).click();
  await expect(choices).toHaveCount(0);

  await dart(page, '18', 'Treble');
  await place(page, '18 row');
  await dart(page, '18', 'Treble');
  await expect(choices).toContainText('18 row: 54 points');
  await place(page, '18 row');
  await expect(page.locator('#score-0')).toHaveText('54');
});

for (const width of [340, 390, 560, 600, 800, 1400]) {
  test(`the header, menu and cards share the same edges at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await twoPlayers(context, page);
    const box = async (selector) => page.locator(selector).first().boundingBox();
    const frame = await box('.dos-frame');
    const card = await box('#screen .card');
    const tabs = await box('.nav button:first-child');
    const lastTab = await box('.nav button:last-child');
    expect(Math.abs(frame.x - card.x)).toBeLessThan(1);
    expect(Math.abs(frame.width - card.width)).toBeLessThan(1);
    expect(Math.abs(tabs.x - card.x)).toBeLessThan(1);
    expect(Math.abs(lastTab.x + lastTab.width - (card.x + card.width))).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a guest can be added, invited and removed', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.shared = [];
    navigator.share = async (data) => { window.shared.push(data); };
  });
  await twoPlayers(context, page);
  const name = uniqueName('Rudine');
  await page.getByLabel('Add a guest').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Players' })).toContainText(`3. ${name} (guest)`);

  await page.getByRole('button', { name: `Invite ${name}` }).click();
  await expect.poll(() => page.evaluate(() => window.shared.length)).toBe(1);
  const invite = await page.evaluate(() => window.shared[0]);
  expect(invite.url).toContain('?invite=');
  expect(invite.text).toContain(name);
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();

  await page.getByRole('button', { name: `Remove ${name}` }).click();
  await expect(page.getByRole('group', { name: 'Players' })).not.toContainText(name);
  await expect(page.locator('#guests')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Players' })).not.toContainText(name);
});

test('three players take turns in 501', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  const third = uniqueName('Jo');
  await page.getByLabel('Add a guest').fill(third);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await chooseRules(page, '501', { 'Open on a double': false, 'Finish on a double': false });
  await page.getByRole('button', { name: 'Start game' }).click();
  for (const [name, next] of [[meName, themName], [themName, third], [third, meName]]) {
    await expect(page.locator('.status')).toContainText(`${name} to throw`);
    await page.getByRole('button', { name: 'Three-dart total' }).click();
    await page.locator('#total-input').fill('60');
    await page.getByRole('button', { name: 'Score it' }).click();
    await expect(page.locator(`[data-player="${name}"] .left`)).toHaveText('441');
    await expect(page.locator('.status')).toContainText(`${next} to throw`);
  }
});

test('Killer with four players: teams from throwing order, sharing the board', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  const three = uniqueName('Jo');
  const four = uniqueName('Ben');
  for (const guest of [three, four]) {
    await page.getByLabel('Add a guest').fill(guest);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': true, 'Dead numbers count on D and T': true });
  await expect(page.locator('#teams')).toContainText(`${meName} and ${three} against ${themName} and ${four}`);
  await page.getByRole('button', { name: 'Start game' }).click();

  const heads = page.locator('.board thead tr').first().locator('th');
  await expect(heads.first()).toHaveText(`${meName} and ${three}`);
  await expect(heads.last()).toHaveText(`${themName} and ${four}`);
  await expect(page.locator('.status')).toContainText(`${meName} to throw`);
  await dart(page, '20', 'Treble');
  await place(page, '20 row');
  await dart(page, 'Miss');
  await dart(page, 'Miss');
  await expect(page.locator('.status')).toContainText(`${themName} to throw`);
  await dart(page, 'Miss');
  await dart(page, 'Miss');
  await dart(page, 'Miss');
  await expect(page.locator('.status')).toContainText(`${three} to throw`);
  await dart(page, '20');
  await expect(page.locator('#score-0')).toHaveText('20');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'End now' }).click();
  await expect(page.getByRole('heading', { name: `${meName} and ${three} win` })).toBeVisible();
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await expect(page.locator('.score')).toContainText(`${meName} and ${three} 20`);
  await expect(page.locator('#waiting')).toHaveCount(0);
});

test('Killer 2 against 1 asks how often the player alone throws', async ({ page, context }) => {
  const { meName, themName } = await twoPlayers(context, page);
  const third = uniqueName('Jo');
  await page.getByLabel('Add a guest').fill(third);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await chooseRules(page, 'Killer', { '1 to 9 count on D and T': true, 'Dead numbers count on D and T': true });
  await expect(page.locator('#teams')).toContainText(`${meName} and ${third} against ${themName}`);

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#setup-error')).toContainText(`how often ${themName} throws`);

  await page.getByRole('group', { name: 'Turns for the player alone' }).getByRole('button', { name: /^Once a round/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  const throwers = [meName, themName, third, meName];
  for (const name of throwers) {
    await expect(page.locator('.status')).toContainText(`${name} to throw`);
    await dart(page, 'Miss');
    await dart(page, 'Miss');
    await dart(page, 'Miss');
  }
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'End now' }).click();
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.locator('#waiting')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
});
