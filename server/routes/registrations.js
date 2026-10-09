'use strict';
const crypto = require('node:crypto');
const { db, transaction, campusNow } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { reply, notFound, conflict, badRequest, parseId } = require('../http');
const { presentEvent, getEventRow } = require('./events');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I lookalikes

function newCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `EVT-${out.slice(0, 4)}-${out.slice(4)}`;
}

function registerForEvent(ctx) {
  const eventId = parseId(ctx.params.id, 'Event');
  const userId = ctx.user.id;

  // Everything below runs atomically: the capacity check and the insert can't be interleaved.
  const code = transaction(() => {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) throw notFound('Event not found');
    if (event.status !== 'upcoming') throw conflict(`Registration is closed: this event is ${event.status}`, 'EVENT_CLOSED');
    if (`${event.date}T${event.time}` < campusNow()) throw conflict('This event has already started', 'EVENT_STARTED');

    const existing = db.prepare('SELECT * FROM registrations WHERE user_id = ? AND event_id = ?').get(userId, eventId);
    if (existing && existing.status === 'registered') {
      throw conflict('You are already registered for this event', 'ALREADY_REGISTERED');
    }

    const { n: taken } = db
      .prepare(`SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'registered'`)
      .get(eventId);
    if (taken >= event.capacity) throw conflict('This event is full', 'EVENT_FULL');

    if (existing) {
      // Re-registering after a cancellation re-activates the same row (keeps UNIQUE(user, event) intact).
      db.prepare(
        `UPDATE registrations SET status='registered', checked_in_at=NULL,
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      ).run(existing.id);
      return existing.code;
    }
    const fresh = newCode();
    db.prepare('INSERT INTO registrations (user_id, event_id, code) VALUES (?, ?, ?)').run(userId, eventId, fresh);
    return fresh;
  });

  return reply(201, {
    message: 'You are registered!',
    code,
    data: presentEvent(getEventRow(eventId, userId)),
  });
}

function cancelRegistration(ctx) {
  const eventId = parseId(ctx.params.id, 'Event');
  const userId = ctx.user.id;

  transaction(() => {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) throw notFound('Event not found');
    const reg = db
      .prepare(`SELECT * FROM registrations WHERE user_id = ? AND event_id = ? AND status = 'registered'`)
      .get(userId, eventId);
    if (!reg) throw notFound('You are not registered for this event');
    if (event.status === 'completed' || `${event.date}T${event.time}` < campusNow()) {
      throw conflict("You can't cancel after the event has started", 'CANCEL_NOT_ALLOWED');
    }
    db.prepare(
      `UPDATE registrations SET status='cancelled', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(reg.id);
  });

  return { message: 'Registration cancelled', data: presentEvent(getEventRow(eventId, userId)) };
}

function myRegistrations(ctx) {
  const rows = db
    .prepare(
      `SELECT r.id AS registration_id, r.status AS registration_status, r.code, r.checked_in_at, r.created_at AS registered_at,
              e.*, (SELECT COUNT(*) FROM registrations x WHERE x.event_id = e.id AND x.status = 'registered') AS registered_count
         FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.user_id = ?
        ORDER BY e.date DESC, e.time DESC`,
    )
    .all(ctx.user.id);
  return {
    data: rows.map((row) => ({
      registration_id: row.registration_id,
      status: row.registration_status,
      code: row.code,
      checked_in_at: row.checked_in_at,
      registered_at: row.registered_at,
      event: presentEvent(row),
    })),
  };
}

function eventParticipants(ctx) {
  const eventId = parseId(ctx.params.id, 'Event');
  if (!db.prepare('SELECT 1 FROM events WHERE id = ?').get(eventId)) throw notFound('Event not found');
  const rows = db
    .prepare(
      `SELECT r.id, r.code, r.status, r.checked_in_at, r.created_at, u.name, u.email
         FROM registrations r JOIN users u ON u.id = r.user_id
        WHERE r.event_id = ?
        ORDER BY (r.status = 'registered') DESC, r.created_at ASC`,
    )
    .all(eventId);
  return { data: rows };
}

function checkIn(ctx) {
  const eventId = parseId(ctx.params.id, 'Event');
  const code = typeof ctx.body.code === 'string' ? ctx.body.code.trim().toUpperCase() : '';
  if (!code) throw badRequest('Enter a registration ID');

  const reg = db
    .prepare(
      `SELECT r.*, u.name, u.email FROM registrations r JOIN users u ON u.id = r.user_id
        WHERE r.code = ? AND r.event_id = ?`,
    )
    .get(code, eventId);
  if (!reg) throw notFound('No registration with that ID for this event');
  if (reg.status !== 'registered') throw conflict('This registration was cancelled', 'REGISTRATION_CANCELLED');
  if (reg.checked_in_at) throw conflict(`${reg.name} is already checked in`, 'ALREADY_CHECKED_IN');

  db.prepare(`UPDATE registrations SET checked_in_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(reg.id);
  return { message: `${reg.name} checked in`, data: { name: reg.name, email: reg.email, code: reg.code } };
}

function register(router) {
  router.post('/api/events/:id/register', requireAuth, registerForEvent);
  router.delete('/api/events/:id/register', requireAuth, cancelRegistration);
  router.get('/api/registrations/me', requireAuth, myRegistrations);
  router.get('/api/events/:id/registrations', requireAdmin, eventParticipants);
  router.post('/api/events/:id/check-in', requireAdmin, checkIn);
}

module.exports = { register };
