'use strict';
const { db } = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');
const { reply, conflict, HttpError } = require('../http');
const { validateRegistration, validateLogin } = require('../validators');

// Very small in-memory limiter: 10 failed logins / 15 min per (ip + email).
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function limiterKey(ctx, email) {
  return `${ctx.req.socket.remoteAddress}|${email}`;
}
function assertNotLocked(key) {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.first < WINDOW_MS && entry.count >= MAX_FAILS) {
    throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.', 'RATE_LIMITED');
  }
}
function recordFail(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first >= WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function register(router) {
  router.post('/api/auth/register', (ctx) => {
    const { name, email, password } = validateRegistration(ctx.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), 'student');
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    return reply(201, { token: signToken(user), user: publicUser(user) });
  });

  router.post('/api/auth/login', (ctx) => {
    const { email, password } = validateLogin(ctx.body);
    const key = limiterKey(ctx, email);
    assertNotLocked(key);

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Same message for unknown email and wrong password: don't reveal which accounts exist.
    if (!row || !verifyPassword(password, row.password_hash)) {
      recordFail(key);
      throw new HttpError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');
    }
    attempts.delete(key);
    return { token: signToken(row), user: publicUser(row) };
  });

  router.get('/api/auth/me', requireAuth, (ctx) => ({ user: publicUser(ctx.user) }));
}

module.exports = { register };
