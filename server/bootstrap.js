'use strict';
const { db } = require('./db');
const config = require('./config');
const { hashPassword } = require('./auth');

/** Make sure the admin account described by the env vars exists. */
function ensureAdmin() {
  const { name, email, password } = config.admin;
  if (!email || !password) {
    console.warn('[bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set – no admin account created');
    return;
  }
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
  if (!existing) {
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
      .run(name, email.toLowerCase(), hashPassword(password));
    console.log(`[bootstrap] created admin ${email}`);
  } else if (existing.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(existing.id);
  }
}

module.exports = { ensureAdmin };
