// Pyltjies server: the PWA, sign-in, the private league and its matches. Node 24 built-ins + nodemailer.
// Sign-in, invites, backups and static files follow Dosie and Peusel.

import crypto from 'node:crypto';
import fs, { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { replay, summarize } from '../app/games.js';
import { buildLeague, maxHead } from '../app/rating.js';
import { openDb } from './db.js';
import { createMailer } from './mail.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const INVITE_DAYS = 7;
const SESSION_DAYS = 400; // browsers cap cookies at 400 days
const COOKIE = 'pyltjies';
const MAX_BODY = 100_000;
const MAX_EVENTS = 3000;
const MAX_COMMENT = 280;
const LOG_LENGTH = 100;
const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// No look-alikes (0/O, 1/I/L), so a code read out over the phone still works.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const normCode = (text) => String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const cleanName = (text) => String(text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function normEmail(text) {
  const email = String(text || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function deviceKind(req) {
  const agent = String(req.headers['user-agent'] || '');
  if (/iPhone|iPad/.test(agent)) return 'iPhone';
  return /Android/.test(agent) ? 'Android' : 'Computer';
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/** The file for a request path, or null if it isn't a file inside the app folder. */
async function findFile(appDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = path.join(appDir, decoded.endsWith('/') ? `${decoded}index.html` : decoded);
  if (file !== appDir && !file.startsWith(`${appDir}${path.sep}`)) return null;
  if (path.basename(file).startsWith('.')) return null;
  try {
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

export function createApp({
  appDir, dataDir, ownerEmail, publicUrl = 'http://localhost:8080', trustProxy = false,
  mailer = createMailer({}), backupKeep = 14,
}) {
  const root = path.resolve(appDir);
  const owner = normEmail(ownerEmail);
  const db = openDb(dataDir);

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, name, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)'),
    login: db.prepare("UPDATE users SET last_login = ?, role = CASE WHEN ? THEN 'owner' ELSE role END WHERE id = ?"),
    members: db.prepare("SELECT id, name, role FROM users ORDER BY role = 'owner' DESC, created_at"),

    otp: db.prepare('SELECT * FROM otps WHERE email = ?'),
    putOtp: db.prepare('INSERT OR REPLACE INTO otps (email, code_hash, expires, attempts, created_at) VALUES (?, ?, ?, 0, ?)'),
    otpAttempt: db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?'),
    deleteOtp: db.prepare('DELETE FROM otps WHERE email = ?'),
    purgeOtps: db.prepare('DELETE FROM otps WHERE expires < ?'),

    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0'),
    insertSession: db.prepare('INSERT INTO sessions (id, user_id, token_hash, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)'),
    touch: db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?'),
    revokeSession: db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?'),

    invite: db.prepare('SELECT * FROM invites WHERE code = ? AND used_by IS NULL AND expires > ?'),
    inviteForEmail: db.prepare('SELECT * FROM invites WHERE email = ? AND used_by IS NULL AND expires > ? ORDER BY created_at DESC LIMIT 1'),
    insertInvite: db.prepare('INSERT INTO invites (code, email, created_by, created_at, expires) VALUES (?, ?, ?, ?, ?)'),
    useInvite: db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?'),
    myInvites: db.prepare('SELECT code, email, expires FROM invites WHERE used_by IS NULL AND expires > ? AND created_by = ? ORDER BY created_at DESC'),

    audit: db.prepare('INSERT INTO audit (at, actor, action) VALUES (?, ?, ?)'),

    match: db.prepare('SELECT * FROM matches WHERE id = ?'),
    insertMatch: db.prepare('INSERT INTO matches (id, played_at, created_by, config, events, sides, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    liveMatches: db.prepare('SELECT id, played_at, created_by, config, sides FROM matches WHERE voided_at IS NULL ORDER BY played_at DESC, created_at DESC'),
    voidMatch: db.prepare('UPDATE matches SET voided_at = ?, voided_by = ? WHERE id = ? AND voided_at IS NULL'),
    comments: db.prepare(`SELECT comments.id, comments.match_id, comments.user_id, comments.text, comments.created_at, users.name
      FROM comments JOIN users ON users.id = comments.user_id ORDER BY comments.created_at`),
    insertComment: db.prepare('INSERT INTO comments (id, match_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)'),
  };

  const buckets = new Map();
  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { n: 1, resetAt: now + windowMs });
      return;
    }
    bucket.n += 1;
    if (bucket.n > max) throw new HttpError(429, 'Too many attempts. Try again later.');
  }

  function clientIp(req) {
    if (trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress;
  }

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function readCookie(req) {
    const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
    return match ? match[1] : null;
  }

  function cookieHeader(req, value, maxAgeS) {
    const https = trustProxy && req.headers['x-forwarded-proto'] === 'https';
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${https ? '; Secure' : ''}`;
  }

  function signedIn(req) {
    const token = readCookie(req);
    const session = token && q.session.get(hash(token));
    const user = session && q.userById.get(session.user_id);
    if (!session || !user) throw new HttpError(401, 'Please sign in.');
    if (Date.now() - session.last_seen > 3_600_000) q.touch.run(Date.now(), session.id);
    return user;
  }

  const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });
  const inviteUrl = (code) => `${publicUrl.replace(/\/$/, '')}/?invite=${code}`;

  // Who may get a code: the owner, anyone already in, or someone with a valid invite.
  function signInPass(email, inviteCode) {
    const user = q.userByEmail.get(email);
    if (user) return { user };
    if (email === owner) return { isOwner: true };
    const now = Date.now();
    const invite = (inviteCode && q.invite.get(normCode(inviteCode), now)) || q.inviteForEmail.get(email, now);
    if (invite && (!invite.email || invite.email === email)) return { invite };
    if (inviteCode) throw new HttpError(404, 'That invite is wrong or has expired. Ask for a new one.');
    throw new HttpError(403, "This email can't sign in yet. Ask a friend in the league for an invite.");
  }

  // Everything the league shares. Email addresses never leave through this: names only.
  function league(me) {
    const members = q.members.all().map((user) => ({ id: user.id, name: user.name, role: user.role, you: user.id === me.id }));
    const all = q.liveMatches.all().map((row) => ({
      id: row.id, playedAt: row.played_at, createdBy: row.created_by, config: JSON.parse(row.config), sides: JSON.parse(row.sides),
    }));
    const { ladder, formats } = buildLeague(all, members);
    const byMatch = new Map();
    for (const comment of q.comments.all()) {
      const list = byMatch.get(comment.match_id) ?? [];
      list.push({ id: comment.id, name: comment.name, text: comment.text, at: comment.created_at });
      byMatch.set(comment.match_id, list);
    }
    const matches = all.slice(0, LOG_LENGTH).map((match) => ({
      ...match,
      comments: byMatch.get(match.id) ?? [],
      canVoid: me.role === 'owner' || match.createdBy === me.id || match.sides.some((side) => side.userId === me.id),
    }));
    return { members, ladder, formats, matches };
  }

  function myInvites(user) {
    return q.myInvites.all(Date.now(), user.id).map((invite) => ({
      code: invite.code, email: invite.email, expiresAt: invite.expires, url: inviteUrl(invite.code),
    }));
  }

  const validAt = (at) => Number.isSafeInteger(at) && at > 0 && at <= Date.now() + 86_400_000;

  /** Rebuilds a sent game from its darts. Only the darts and the setup are believed, never a sent score. */
  function checkMatch(body) {
    if (!MATCH_ID.test(String(body.id))) throw new HttpError(400, 'That game has no valid id.');
    if (!validAt(body.playedAt)) throw new HttpError(400, 'That game has no valid time.');
    const sent = body.config;
    if (!isObject(sent) || !Array.isArray(sent.sides) || !Array.isArray(body.events)) throw new HttpError(400, 'That game is incomplete.');
    if (body.events.length > MAX_EVENTS || !body.events.every(isObject)) throw new HttpError(400, 'That game is incomplete.');

    let config;
    if (sent.game === 'killer') {
      if (sent.sides.length !== 2) throw new HttpError(400, 'Killer is played by two sides.');
      config = { game: 'killer' };
    } else if (sent.game === 'x01' && (sent.start === 301 || sent.start === 501)) {
      if (sent.sides.length < 2 || sent.sides.length > 4) throw new HttpError(400, 'Play with 2 to 4 people.');
      config = { game: 'x01', start: sent.start };
    } else {
      throw new HttpError(400, "That isn't a game we know.");
    }

    const limit = maxHead(config);
    const seen = new Set();
    config.sides = sent.sides.map((side) => {
      if (!isObject(side)) throw new HttpError(400, 'That game has a bad player.');
      const head = side.head ?? 0;
      const given = isObject(side.rules) ? side.rules : {};
      const rules = config.game === 'killer'
        ? { countLow: given.countLow === true, countDead: given.countDead === true }
        : { doubleIn: given.doubleIn === true, doubleOut: given.doubleOut === true };
      if (!Number.isInteger(head) || head < 0 || head > limit) throw new HttpError(400, 'That head start is out of range.');
      if (side.userId === null || side.userId === undefined) {
        const name = cleanName(side.name);
        if (!name) throw new HttpError(400, 'A guest needs a name.');
        return { name, userId: null, head, rules };
      }
      const user = q.userById.get(String(side.userId));
      if (!user) throw new HttpError(400, "A player in that game isn't in the league.");
      if (seen.has(user.id)) throw new HttpError(400, 'A player is in that game twice.');
      seen.add(user.id);
      return { name: user.name, userId: user.id, head, rules };
    });

    let state;
    try {
      state = replay(config, body.events);
    } catch (error) {
      throw new HttpError(400, `That game doesn't add up: ${error.message}.`);
    }
    if (!state.finished) throw new HttpError(400, "That game isn't finished.");
    return { config, sides: summarize(config, state), events: body.events, playedAt: body.playedAt };
  }

  const routes = {
    'GET /api/health': () => {
      db.prepare('SELECT 1').get();
      return { ok: true, version: VERSION };
    },

    'POST /api/auth/start': async (req) => {
      const body = await readJson(req);
      const email = normEmail(body.email);
      if (!email) throw new HttpError(400, "That email address doesn't look right.");
      rateLimit(`otp-ip:${clientIp(req)}`, 10, 15 * 60_000);
      const pass = signInPass(email, body.invite);
      rateLimit(`otp-email:${email}`, 5, 3_600_000);
      const previous = q.otp.get(email);
      if (previous && Date.now() - previous.created_at < 30_000) throw new HttpError(429, 'Wait 30 seconds before asking for another code.');
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      q.putOtp.run(email, hash(`${email}:${code}`), Date.now() + OTP_MINUTES * 60_000, Date.now());
      try {
        await mailer.sendCode(email, code);
      } catch (error) {
        console.error('send code failed:', error.message);
        q.deleteOtp.run(email);
        throw new HttpError(502, 'Could not send the code. Try again in a minute.');
      }
      return { ok: true, email, isNew: !pass.user };
    },

    'POST /api/auth/verify': async (req, res) => {
      const body = await readJson(req);
      const email = normEmail(body.email);
      rateLimit(`verify-ip:${clientIp(req)}`, 30, 15 * 60_000);
      const otp = email && q.otp.get(email);
      if (!otp || otp.expires < Date.now()) throw new HttpError(400, 'That code has expired. Ask for a new one.');
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        q.deleteOtp.run(email);
        throw new HttpError(400, 'Too many wrong codes. Ask for a new one.');
      }
      const expected = Buffer.from(otp.code_hash);
      const got = Buffer.from(hash(`${email}:${String(body.code || '').replace(/\D/g, '')}`));
      if (!crypto.timingSafeEqual(expected, got)) {
        q.otpAttempt.run(email);
        throw new HttpError(400, "That code isn't right.");
      }

      const user = tx(() => {
        const pass = signInPass(email, body.invite);
        const now = Date.now();
        const isOwner = email === owner;
        let found = pass.user;
        if (found) {
          q.login.run(now, isOwner ? 1 : 0, found.id);
        } else {
          const name = cleanName(body.name);
          if (!name) throw new HttpError(400, 'Please tell us your name.');
          const id = crypto.randomUUID();
          q.insertUser.run(id, email, name, isOwner ? 'owner' : 'member', now, now);
          if (pass.invite) q.useInvite.run(id, now, pass.invite.code);
          q.audit.run(now, id, 'user.joined');
          found = { id };
        }
        q.deleteOtp.run(email);
        return q.userById.get(found.id);
      });
      const token = crypto.randomBytes(32).toString('base64url');
      q.insertSession.run(crypto.randomUUID(), user.id, hash(token), deviceKind(req), Date.now(), Date.now());
      res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_DAYS * 86_400));
      return { user: publicUser(user) };
    },

    'POST /api/auth/logout': (req, res) => {
      const token = readCookie(req);
      const session = token && q.session.get(hash(token));
      if (session) q.revokeSession.run(session.id);
      res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
      return { ok: true };
    },

    'GET /api/me': (req) => ({ user: publicUser(signedIn(req)) }),

    'GET /api/league': (req) => league(signedIn(req)),

    'GET /api/invites': (req) => ({ invites: myInvites(signedIn(req)) }),

    // Anyone in the league can bring in a friend. Each link works for one person.
    'POST /api/invites': async (req) => {
      const user = signedIn(req);
      rateLimit(`invite:${user.id}`, 20, 24 * 3_600_000);
      const body = await readJson(req);
      let email = null;
      if (body.email) {
        email = normEmail(body.email);
        if (!email) throw new HttpError(400, "That email address doesn't look right.");
        if (q.userByEmail.get(email)) throw new HttpError(409, 'That person has already joined.');
      }
      const code = [...crypto.randomBytes(8)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
      q.insertInvite.run(code, email, user.id, Date.now(), Date.now() + INVITE_DAYS * 86_400_000);
      q.audit.run(Date.now(), user.id, 'invite.created');
      if (email) {
        try {
          await mailer.sendInvite(email, user.name || 'Someone', inviteUrl(code));
        } catch (error) {
          console.error('send invite failed:', error.message);
          throw new HttpError(502, 'Could not send the invite email. Share the link instead.');
        }
      }
      return { invites: myInvites(user) };
    },

    // Sending the same game twice is fine: phones retry after going offline.
    'POST /api/matches': async (req) => {
      const user = signedIn(req);
      const body = await readJson(req);
      const match = checkMatch(body);
      const existing = q.match.get(body.id);
      if (existing) return { ok: true, duplicate: true };
      const now = Date.now();
      q.insertMatch.run(body.id, match.playedAt, user.id, JSON.stringify(match.config), JSON.stringify(match.events), JSON.stringify(match.sides), now);
      q.audit.run(now, user.id, 'match.saved');
      return { ok: true };
    },

    'POST /api/matches/void': async (req) => {
      const user = signedIn(req);
      const { id } = await readJson(req);
      const match = MATCH_ID.test(String(id)) ? q.match.get(id) : null;
      if (!match) throw new HttpError(404, "That game isn't there.");
      const players = JSON.parse(match.sides);
      if (user.role !== 'owner' && match.created_by !== user.id && !players.some((side) => side.userId === user.id)) {
        throw new HttpError(403, 'Only someone who played in or logged that game can void it.');
      }
      q.voidMatch.run(Date.now(), user.id, id);
      q.audit.run(Date.now(), user.id, 'match.voided');
      return { ok: true };
    },

    'POST /api/comments': async (req) => {
      const user = signedIn(req);
      rateLimit(`comment:${user.id}`, 60, 3_600_000);
      const body = await readJson(req);
      const text = String(body.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
      if (!text) throw new HttpError(400, 'Say something first.');
      if (text.length > MAX_COMMENT) throw new HttpError(400, `Keep it under ${MAX_COMMENT} characters.`);
      if (!MATCH_ID.test(String(body.matchId)) || !q.match.get(body.matchId)) throw new HttpError(404, "That game isn't there.");
      q.insertComment.run(crypto.randomUUID(), body.matchId, user.id, text, Date.now());
      return { ok: true };
    },
  };

  function send(res, status, body) {
    res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function backup() {
    const dir = path.join(dataDir, 'backups');
    const file = path.join(dir, `pyltjies-${new Date().toISOString().slice(0, 10)}.db`);
    if (fs.existsSync(file)) return;
    try {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      const old = fs.readdirSync(dir).filter((name) => /^pyltjies-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort().slice(0, -backupKeep);
      for (const name of old) fs.unlinkSync(path.join(dir, name));
    } catch (error) {
      console.error('backup failed:', error.message);
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    if (pathname.startsWith('/api/')) {
      const handler = routes[`${req.method} ${pathname}`];
      if (!handler) return send(res, 404, { error: 'Not found' });
      // Other sites' forms can't send JSON, so this plus SameSite=Lax keeps them from acting with the cookie.
      if (req.method !== 'GET' && !/^application\/json\b/.test(req.headers['content-type'] || '')) {
        return send(res, 415, { error: 'Send JSON' });
      }
      try {
        return send(res, 200, await handler(req, req.method === 'GET' ? url : res));
      } catch (error) {
        if (!(error instanceof HttpError)) console.error(req.method, pathname, error.message);
        return send(res, error.status || 500, { error: error instanceof HttpError ? error.message : 'Server error' });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, HEADERS);
      return res.end('Method not allowed');
    }
    const file = await findFile(root, pathname);
    if (!file) {
      res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });

  backup();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
    q.purgeOtps.run(now);
    backup();
  }, 3_600_000);
  timer.unref();
  server.on('close', () => {
    clearInterval(timer);
    db.close();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { env } = process;
  const port = Number(env.PORT || 8080);
  const mailer = createMailer(env);
  const server = createApp({
    appDir: env.APP_DIR || 'app',
    dataDir: path.resolve(env.DATA_DIR || './data/app'),
    ownerEmail: env.OWNER_EMAIL,
    publicUrl: env.PUBLIC_URL || `http://localhost:${port}`,
    trustProxy: env.TRUST_PROXY === '1',
    backupKeep: Number(env.BACKUP_KEEP || 14),
    mailer,
  });
  server.listen(port, () => {
    console.log(`pyltjies ${VERSION} listening on :${port}; email=${mailer.configured ? 'smtp' : 'log'}; owner=${env.OWNER_EMAIL ? 'set' : 'none'}`);
    if (!env.OWNER_EMAIL) console.warn('WARNING: OWNER_EMAIL is not set, so nobody can sign in.');
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
    });
  }
}
