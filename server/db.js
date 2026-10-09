'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

if (config.dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// users 1 ── n registrations n ── 1 events
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  category    TEXT    NOT NULL,
  date        TEXT    NOT NULL,              -- YYYY-MM-DD (campus local time)
  time        TEXT    NOT NULL,              -- HH:MM      (campus local time)
  venue       TEXT    NOT NULL,
  organizer   TEXT    NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  image_url   TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date     ON events(date, time);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_status   ON events(status);

CREATE TABLE IF NOT EXISTS registrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','cancelled')),
  code          TEXT    NOT NULL UNIQUE,     -- unique registration ID used for check-in
  checked_in_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, event_id)                 -- a user can never hold two rows for one event
);
CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_reg_user  ON registrations(user_id, status);
`);

/** Run fn inside a write transaction; rolls back if it throws. */
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** "Now" on the campus clock, formatted YYYY-MM-DDTHH:MM (comparable to date||'T'||time). */
function campusNow() {
  return new Date(Date.now() + config.tzOffsetMinutes * 60000).toISOString().slice(0, 16);
}

module.exports = { db, transaction, campusNow };
