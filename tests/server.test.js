import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../server/server.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OWNER = 'owner@example.com';
const cleanups = [];

after(() => { for (const cleanup of cleanups) cleanup(); });

async function start() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'pyltjies-test-'));
  const codes = new Map();
  const invited = [];
  const mailer = {
    sendCode: async (to, code) => { codes.set(to, code); },
    sendInvite: async (to, from, url) => { invited.push({ to, from, url }); },
  };
  const server = createApp({ appDir: 'app', dataDir, ownerEmail: OWNER, publicUrl: 'https://darts.test', mailer });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  cleanups.push(() => { server.close(); server.closeAllConnections(); rmSync(dataDir, { recursive: true, force: true }); });

  const client = (cookie = '') => async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => ({})) };
  };
  const anon = client();

  async function join(email, name, invite) {
    const started = await anon('POST', '/api/auth/start', { email, invite });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const verified = await anon('POST', '/api/auth/verify', { email, code: codes.get(email), name, invite });
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    const cookie = verified.headers.get('set-cookie').split(';')[0];
    return { call: client(cookie), user: verified.data.user };
  }

  async function friend(inviter, email, name) {
    const { data } = await inviter('POST', '/api/invites', {});
    return join(email, name, data.invites[0].code);
  }

  return { base, anon, join, friend, invited };
}

const uuid = () => crypto.randomUUID();
// From 121 left: T20, T20, 1.
const WIN = [{ t: 'dart', n: 20, m: 3 }, { t: 'dart', n: 20, m: 3 }, { t: 'dart', n: 1, m: 1 }];
const shortGame = (a, b, over = {}) => ({
  id: uuid(),
  playedAt: Date.now(),
  config: {
    game: 'x01', start: 301,
    sides: [{ userId: a, head: 180 }, { userId: b, head: 0 }],
  },
  events: WIN,
  ...over,
});

test('health reports the version without signing in', async () => {
  const { anon } = await start();
  const { data } = await anon('GET', '/api/health');
  assert.deepEqual(data, { ok: true, version: pkg.version });
});

test('the release numbers match', async () => {
  const { APP_VERSION } = await import('../app/version.js');
  assert.equal(APP_VERSION, pkg.version);
  assert.match(readFileSync('app/sw.js', 'utf8'), new RegExp(`'pyltjies-${pkg.version.replaceAll('.', '\\.')}'`));
});

test('every file the service worker caches exists', () => {
  const list = /const SHELL = (\[.*\]);/.exec(readFileSync('app/sw.js', 'utf8'))[1];
  for (const file of JSON.parse(list.replaceAll("'", '"'))) {
    if (file !== './') readFileSync(path.join('app', file));
  }
});

test('the league is private: no sign-in, no data, and strangers are refused', async () => {
  const { anon } = await start();
  assert.equal((await anon('GET', '/api/league')).status, 401);
  assert.equal((await anon('POST', '/api/matches', {})).status, 401);
  assert.equal((await anon('POST', '/api/auth/start', { email: 'stranger@example.com' })).status, 403);
});

test('any member can invite, and an invite link only works once', async () => {
  const { anon, join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const { data } = await sam.call('POST', '/api/invites', {});
  const { code } = data.invites[0];
  await join('jo@example.com', 'Jo', code);
  const again = await anon('POST', '/api/auth/start', { email: 'ben@example.com', invite: code });
  assert.equal(again.status, 404);
  assert.equal((await owner.call('GET', '/api/league')).data.members.length, 3);
});

test('a finished game is saved, and the league works it out from the darts', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = shortGame(owner.user.id, sam.user.id);
  assert.equal((await owner.call('POST', '/api/matches', game)).status, 200);
  const { data } = await sam.call('GET', '/api/league');
  assert.equal(data.matches.length, 1);
  assert.equal(data.matches[0].sides[0].name, 'Dirk');
  assert.equal(data.matches[0].sides[0].won, true);
  assert.equal(data.ladder[0].name, 'Dirk');
  assert.equal(data.ladder[0].points, 2);
  assert.equal(data.ladder[1].losses, 1);
  assert.equal(data.formats['301'], '301, straight in, straight out');
});

test('sending the same game twice only counts once', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = shortGame(owner.user.id, sam.user.id);
  await owner.call('POST', '/api/matches', game);
  const second = await sam.call('POST', '/api/matches', game);
  assert.equal(second.data.duplicate, true);
  assert.equal((await owner.call('GET', '/api/league')).data.matches.length, 1);
});

test('games that do not add up are refused', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const ids = [owner.user.id, sam.user.id];
  const send = (over) => owner.call('POST', '/api/matches', shortGame(...ids, over));
  const config = shortGame(...ids).config;

  assert.equal((await send({ events: [] })).status, 400, 'not finished');
  assert.equal((await send({ events: [{ t: 'dart', n: 99, m: 1 }] })).status, 400, 'not a dart');
  assert.equal((await send({ events: [...WIN, { t: 'dart', n: 1, m: 1 }] })).status, 400, 'darts after the end');
  assert.equal((await send({ id: 'nope' })).status, 400);
  assert.equal((await send({ config: { ...config, game: 'golf' } })).status, 400);
  assert.equal((await send({ config: { ...config, start: 1001 } })).status, 400);
  assert.equal((await send({ config: { ...config, sides: [{ userId: ids[0], head: 181 }, { userId: ids[1], head: 0 }] } })).status, 400, 'head start over the ceiling');
  assert.equal((await send({ config: { ...config, sides: [{ userId: ids[0] }, { userId: ids[0] }] } })).status, 400, 'same player twice');
  assert.equal((await send({ config: { ...config, sides: [{ userId: 'ghost' }, { userId: ids[1] }] } })).status, 400, 'not in the league');
  assert.equal((await send({ config: { game: 'killer', sides: [{ userId: ids[0] }, { userId: ids[1] }, { name: 'Guest' }] }, events: [{ t: 'end' }] })).status, 400, 'three in Killer');
  assert.equal((await owner.call('GET', '/api/league')).data.matches.length, 0);
});

test('a sent score is ignored: only the darts count', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = shortGame(owner.user.id, sam.user.id);
  game.sides = [{ won: false }, { won: true }];
  game.config.sides[0].name = 'Someone else';
  await owner.call('POST', '/api/matches', game);
  const { data } = await owner.call('GET', '/api/league');
  assert.equal(data.matches[0].sides[0].won, true);
  assert.equal(data.matches[0].sides[0].name, 'Dirk');
});

test('guests can play and do not reach the ladder', async () => {
  const { join } = await start();
  const owner = await join(OWNER, 'Dirk');
  const game = shortGame(owner.user.id, null);
  game.config.sides[1] = { name: 'Uncle Piet', userId: null };
  assert.equal((await owner.call('POST', '/api/matches', game)).status, 200);
  const { data } = await owner.call('GET', '/api/league');
  assert.equal(data.matches[0].sides[1].name, 'Uncle Piet');
  assert.equal(data.ladder.length, 1);
});

test('Killer is checked and rated by marks per round', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = {
    id: uuid(),
    playedAt: Date.now(),
    config: { game: 'killer', sides: [{ userId: owner.user.id, head: 20, rules: { countLow: true } }, { userId: sam.user.id }] },
    events: [{ t: 'dart', n: 20, m: 3 }, { t: 'end' }],
  };
  assert.equal((await owner.call('POST', '/api/matches', game)).status, 200);
  const { data } = await owner.call('GET', '/api/league');
  assert.equal(data.matches[0].sides[0].score, 20);
  assert.equal(data.matches[0].sides[0].won, true);
  assert.equal(data.matches[0].sides[0].stat, 9);
  assert.equal(data.ladder[0].points, 4);
});

test('each player has their own rules, and is rated and paid under them', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = shortGame(owner.user.id, sam.user.id);
  game.config.sides[0].rules = { doubleOut: false };
  game.config.sides[1].rules = { doubleOut: true, ignored: 1 };
  assert.equal((await owner.call('POST', '/api/matches', game)).status, 200);
  const { data } = await owner.call('GET', '/api/league');
  assert.deepEqual(data.matches[0].config.sides[1].rules, { doubleIn: false, doubleOut: true });
  assert.equal(data.ladder[0].points, 2);
  assert.equal(data.formats['301'], '301, straight in, straight out');
  assert.equal(data.formats['301-do'], '301, straight in, double out');
});

test('banter comments show for everyone, and email addresses never do', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const game = shortGame(owner.user.id, sam.user.id);
  await owner.call('POST', '/api/matches', game);
  assert.equal((await sam.call('POST', '/api/comments', { matchId: game.id, text: 'Lucky <b>' })).status, 200);
  assert.equal((await sam.call('POST', '/api/comments', { matchId: game.id, text: '   ' })).status, 400);
  assert.equal((await sam.call('POST', '/api/comments', { matchId: game.id, text: 'x'.repeat(281) })).status, 400);
  assert.equal((await sam.call('POST', '/api/comments', { matchId: uuid(), text: 'hi' })).status, 404);
  const { data } = await owner.call('GET', '/api/league');
  assert.equal(data.matches[0].comments[0].text, 'Lucky <b>');
  assert.equal(data.matches[0].comments[0].name, 'Sam');
  assert.equal(JSON.stringify(data).includes('@example.com'), false);
});

test('players can void a game and it stops counting; others cannot', async () => {
  const { join, friend } = await start();
  const owner = await join(OWNER, 'Dirk');
  const sam = await friend(owner.call, 'sam@example.com', 'Sam');
  const jo = await friend(owner.call, 'jo@example.com', 'Jo');
  const game = shortGame(owner.user.id, sam.user.id);
  await sam.call('POST', '/api/matches', game);
  assert.equal((await jo.call('POST', '/api/matches/void', { id: game.id })).status, 403);
  assert.equal((await jo.call('GET', '/api/league')).data.matches[0].canVoid, false);
  assert.equal((await sam.call('GET', '/api/league')).data.matches[0].canVoid, true);
  assert.equal((await sam.call('POST', '/api/matches/void', { id: game.id })).status, 200);
  const { data } = await owner.call('GET', '/api/league');
  assert.equal(data.matches.length, 0);
  assert.equal(data.ladder[0].points, 0);
});

test('invite email goes out, and the app files are served with a strict policy', async () => {
  const { base, join, invited } = await start();
  const owner = await join(OWNER, 'Dirk');
  await owner.call('POST', '/api/invites', { email: 'friend@example.com' });
  assert.equal(invited[0].to, 'friend@example.com');
  assert.match(invited[0].url, /^https:\/\/darts\.test\/\?invite=/);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
});
