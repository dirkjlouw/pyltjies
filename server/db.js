// SQLite schema and migrations (PRAGMA user_version). New changes go at the end; never edit an old entry.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS = [
  // 1: accounts, the same as Dosie and Peusel, except anyone in the league can invite a friend.
  `CREATE TABLE users (
     id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
     role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL, last_login INTEGER);
   CREATE TABLE otps (
     email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT UNIQUE NOT NULL,
     device TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX sessions_user ON sessions (user_id);
   CREATE TABLE invites (
     code TEXT PRIMARY KEY, email TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
     expires INTEGER NOT NULL, used_by TEXT REFERENCES users(id), used_at INTEGER);
   CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL);`,

  // 2: finished games and the banter on them. A voided game stays in the table but stops counting.
  `CREATE TABLE matches (
     id TEXT PRIMARY KEY, played_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
     config TEXT NOT NULL, events TEXT NOT NULL, sides TEXT NOT NULL, created_at INTEGER NOT NULL,
     voided_at INTEGER, voided_by TEXT REFERENCES users(id));
   CREATE INDEX matches_played ON matches (played_at DESC);
   CREATE TABLE comments (
     id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id), user_id TEXT NOT NULL REFERENCES users(id),
     text TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE INDEX comments_match ON comments (match_id, created_at);`,
];

export function openDb(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'pyltjies.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
