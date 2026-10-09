'use strict';
// Integration tests: spin up the real server against an in-memory database.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.dev';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.SEED_DEMO = 'false';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, server } = require('../server/index');

let base;
before(async () => {
  await start(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const eventBody = (over = {}) => ({
  title: 'Test Event', description: 'desc', category: 'Technical', date: future(5), time: '10:00',
  venue: 'Hall A', organizer: 'ACM', capacity: 2, ...over,
});

let adminToken;
let studentToken;
let eventId;

test('register validates input and rejects duplicates', async () => {
  let r = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'bad', password: '123' } });
  assert.equal(r.status, 400);
  assert.ok(r.body.error.details.email && r.body.error.details.password);

  r = await call('POST', '/api/auth/register', { body: { name: 'Stu Dent', email: 'stu@test.dev', password: 'Passw0rd!' } });
  assert.equal(r.status, 201);
  studentToken = r.body.token;
  assert.equal(r.body.user.role, 'student');
  assert.equal(r.body.user.password_hash, undefined);

  r = await call('POST', '/api/auth/register', { body: { name: 'Stu Dent', email: 'STU@test.dev', password: 'Passw0rd!' } });
  assert.equal(r.status, 409);
});

test('login works and wrong password is a 401', async () => {
  let r = await call('POST', '/api/auth/login', { body: { email: 'stu@test.dev', password: 'nope1234' } });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/auth/login', { body: { email: 'admin@test.dev', password: 'Admin@12345' } });
  assert.equal(r.status, 200);
  adminToken = r.body.token;
  assert.equal(r.body.user.role, 'admin');
});

test('protected routes need a valid token', async () => {
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: 'garbage.token.here' })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: studentToken })).status, 200);
});

test('only admins can create events; creation is validated', async () => {
  assert.equal((await call('POST', '/api/events', { body: eventBody() })).status, 401);
  assert.equal((await call('POST', '/api/events', { body: eventBody(), token: studentToken })).status, 403);
  const bad = await call('POST', '/api/events', { body: eventBody({ capacity: 0, date: '2026-02-31' }), token: adminToken });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.details.capacity && bad.body.error.details.date);

  const ok = await call('POST', '/api/events', { body: eventBody(), token: adminToken });
  assert.equal(ok.status, 201);
  eventId = ok.body.data.id;
  assert.equal(ok.body.data.spots_left, 2);
});

test('list supports search, filter and pagination', async () => {
  await call('POST', '/api/events', { body: eventBody({ title: 'Poetry Night', category: 'Cultural', capacity: 10 }), token: adminToken });
  let r = await call('GET', '/api/events?q=poetry');
  assert.equal(r.body.data.length, 1);
  r = await call('GET', '/api/events?category=Technical');
  assert.ok(r.body.data.every((e) => e.category === 'Technical'));
  r = await call('GET', '/api/events?limit=1&page=2');
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.pagination.pages, 2);
  assert.equal((await call('GET', '/api/events?category=Nope')).status, 400);
  assert.equal((await call('GET', '/api/events?q=%25')).body.data.length, 0); // % is literal, not a wildcard
});

test('registration: success, duplicate, cancel, re-register', async () => {
  let r = await call('POST', `/api/events/${eventId}/register`, { token: studentToken });
  assert.equal(r.status, 201);
  assert.match(r.body.code, /^EVT-/);
  assert.equal(r.body.data.registered_count, 1);
  const code = r.body.code;

  r = await call('POST', `/api/events/${eventId}/register`, { token: studentToken });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'ALREADY_REGISTERED');

  r = await call('DELETE', `/api/events/${eventId}/register`, { token: studentToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.registered_count, 0);

  r = await call('POST', `/api/events/${eventId}/register`, { token: studentToken });
  assert.equal(r.status, 201);
  assert.equal(r.body.code, code); // same row re-activated
});

test('capacity is enforced', async () => {
  const mk = async (n) => (await call('POST', '/api/auth/register', { body: { name: `User ${n}`, email: `u${n}@test.dev`, password: 'Passw0rd!' } })).body.token;
  const [t2, t3] = [await mk(2), await mk(3)];
  assert.equal((await call('POST', `/api/events/${eventId}/register`, { token: t2 })).status, 201); // 2/2 now
  const full = await call('POST', `/api/events/${eventId}/register`, { token: t3 });
  assert.equal(full.status, 409);
  assert.equal(full.body.error.code, 'EVENT_FULL');
});

test('capacity cannot be lowered below current registrations', async () => {
  const r = await call('PUT', `/api/events/${eventId}`, { body: eventBody({ capacity: 1 }), token: adminToken });
  assert.equal(r.status, 409);
});

test('dashboard lists my registrations', async () => {
  const r = await call('GET', '/api/registrations/me', { token: studentToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].event.id, eventId);
});

test('admin sees participants and can check people in once', async () => {
  const list = await call('GET', `/api/events/${eventId}/registrations`, { token: adminToken });
  assert.equal(list.body.data.length, 2);
  assert.equal((await call('GET', `/api/events/${eventId}/registrations`, { token: studentToken })).status, 403);

  const code = list.body.data[0].code;
  assert.equal((await call('POST', `/api/events/${eventId}/check-in`, { body: { code }, token: adminToken })).status, 200);
  assert.equal((await call('POST', `/api/events/${eventId}/check-in`, { body: { code }, token: adminToken })).status, 409);
  assert.equal((await call('POST', `/api/events/${eventId}/check-in`, { body: { code: 'EVT-NOPE-NOPE' }, token: adminToken })).status, 404);
});

test('cancelled events reject registration; stats work; delete cascades', async () => {
  const other = (await call('POST', '/api/events', { body: eventBody({ title: 'To Cancel' }), token: adminToken })).body.data.id;
  await call('PATCH', `/api/events/${other}/status`, { body: { status: 'cancelled' }, token: adminToken });
  const r = await call('POST', `/api/events/${other}/register`, { token: studentToken });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'EVENT_CLOSED');

  const stats = await call('GET', '/api/admin/stats', { token: adminToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.data.totals.registrations >= 2);

  assert.equal((await call('DELETE', `/api/events/${eventId}`, { token: adminToken })).status, 200);
  assert.equal((await call('GET', `/api/events/${eventId}`)).status, 404);
  assert.equal((await call('GET', '/api/registrations/me', { token: studentToken })).body.data.length, 0);
});

test('unknown routes and bad ids return clean errors', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/events/abc')).status, 404);
  assert.equal((await call('PATCH', '/api/events')).status, 405);
});

test('static server blocks path traversal', async () => {
  const res = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.notEqual(res.status, 200);
});
