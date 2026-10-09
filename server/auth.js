'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { db } = require('./db');
const { unauthorized, forbidden } = require('./http');

// ---------- passwords (scrypt, per-user random salt) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- JWT (HS256) ----------
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: user.role, iat: now, exp: now + config.jwtTtlSeconds })}`;
  return `${data}.${sign(data)}`;
}

function verifyToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = Buffer.from(sign(`${h}.${p}`));
  const given = Buffer.from(s);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- middleware ----------
function loadUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const payload = verifyToken(header.slice(7));
  if (!payload) return null;
  // Always re-read the user so deleted users / role changes take effect immediately.
  return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.sub) || null;
}

/** Attach ctx.user if a valid token is present; never rejects. */
function optionalAuth(ctx) {
  ctx.user = loadUser(ctx.req);
}

function requireAuth(ctx) {
  ctx.user = loadUser(ctx.req);
  if (!ctx.user) throw unauthorized();
}

function requireAdmin(ctx) {
  requireAuth(ctx);
  if (ctx.user.role !== 'admin') throw forbidden('Only organizers can do that');
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, optionalAuth, requireAuth, requireAdmin };
