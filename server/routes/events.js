'use strict';
const { db, transaction, campusNow } = require('../db');
const { optionalAuth, requireAdmin } = require('../auth');
const { reply, badRequest, notFound, conflict, parseId } = require('../http');
const { CATEGORIES, EVENT_STATUSES, validateEvent, parsePaging } = require('../validators');

const COUNT_SQL = `(SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered')`;

/** Shape a DB row for the API, adding derived fields the UI needs. */
function presentEvent(row) {
  const registered = row.registered_count ?? 0;
  const spotsLeft = Math.max(0, row.capacity - registered);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    date: row.date,
    time: row.time,
    venue: row.venue,
    organizer: row.organizer,
    capacity: row.capacity,
    image_url: row.image_url,
    status: row.status,
    registered_count: registered,
    spots_left: spotsLeft,
    is_full: spotsLeft === 0,
    is_past: `${row.date}T${row.time}` < campusNow(),
    my_registration: row.my_status ? { status: row.my_status, code: row.my_code, checked_in: !!row.my_checked_in } : null,
  };
}

function getEventRow(id, userId = -1) {
  return db
    .prepare(
      `SELECT e.*, ${COUNT_SQL} AS registered_count,
              mr.status AS my_status, mr.code AS my_code, mr.checked_in_at AS my_checked_in
         FROM events e
         LEFT JOIN registrations mr ON mr.event_id = e.id AND mr.user_id = ?
        WHERE e.id = ?`,
    )
    .get(userId, id);
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function listEvents(ctx) {
  const { q = '', category = '', date_from: dateFrom = '', date_to: dateTo = '', status = 'upcoming' } = ctx.query;
  const { page, limit, offset } = parsePaging(ctx.query);

  if (category && !CATEGORIES.includes(category)) throw badRequest('Unknown category');
  if (status !== 'all' && !EVENT_STATUSES.includes(status)) throw badRequest('Unknown status filter');
  for (const [label, v] of [['date_from', dateFrom], ['date_to', dateTo]]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest(`${label} must be YYYY-MM-DD`);
  }

  const where = [];
  const params = [];

  if (status === 'upcoming') {
    // "Upcoming" = not cancelled/completed AND hasn't started yet.
    where.push(`e.status = 'upcoming' AND (e.date || 'T' || e.time) >= ?`);
    params.push(campusNow());
  } else if (status !== 'all') {
    where.push('e.status = ?');
    params.push(status);
  }
  if (q.trim()) {
    const like = `%${escapeLike(q.trim().slice(0, 100))}%`;
    where.push(`(e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.organizer LIKE ? ESCAPE '\\' OR e.venue LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  if (category) { where.push('e.category = ?'); params.push(category); }
  if (dateFrom) { where.push('e.date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('e.date <= ?'); params.push(dateTo); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = status === 'upcoming' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM events e ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT e.*, ${COUNT_SQL} AS registered_count,
              mr.status AS my_status, mr.code AS my_code, mr.checked_in_at AS my_checked_in
         FROM events e
         LEFT JOIN registrations mr ON mr.event_id = e.id AND mr.user_id = ?
         ${whereSql}
        ORDER BY e.date ${order}, e.time ${order}, e.id ${order}
        LIMIT ? OFFSET ?`,
    )
    .all(ctx.user?.id ?? -1, ...params, limit, offset);

  return {
    data: rows.map(presentEvent),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function register(router) {
  router.get('/api/categories', () => ({ data: CATEGORIES }));

  router.get('/api/events', optionalAuth, listEvents);

  router.get('/api/events/:id', optionalAuth, (ctx) => {
    const row = getEventRow(parseId(ctx.params.id, 'Event'), ctx.user?.id ?? -1);
    if (!row) throw notFound('Event not found');
    return { data: presentEvent(row) };
  });

  router.post('/api/events', requireAdmin, (ctx) => {
    const e = validateEvent(ctx.body);
    const result = db
      .prepare(
        `INSERT INTO events (title, description, category, date, time, venue, organizer, capacity, image_url, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.title, e.description, e.category, e.date, e.time, e.venue, e.organizer, e.capacity, e.image_url, ctx.user.id);
    return reply(201, { data: presentEvent(getEventRow(result.lastInsertRowid)) });
  });

  router.put('/api/events/:id', requireAdmin, (ctx) => {
    const id = parseId(ctx.params.id, 'Event');
    const e = validateEvent(ctx.body);
    return transaction(() => {
      const current = getEventRow(id);
      if (!current) throw notFound('Event not found');
      if (e.capacity < current.registered_count) {
        throw conflict(
          `Capacity can't be lower than the ${current.registered_count} people already registered`,
          'CAPACITY_BELOW_REGISTRATIONS',
        );
      }
      db.prepare(
        `UPDATE events SET title=?, description=?, category=?, date=?, time=?, venue=?, organizer=?,
                capacity=?, image_url=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
      ).run(e.title, e.description, e.category, e.date, e.time, e.venue, e.organizer, e.capacity, e.image_url, id);
      return { data: presentEvent(getEventRow(id)) };
    });
  });

  router.patch('/api/events/:id/status', requireAdmin, (ctx) => {
    const id = parseId(ctx.params.id, 'Event');
    const { status } = ctx.body;
    if (!EVENT_STATUSES.includes(status)) throw badRequest(`Status must be one of: ${EVENT_STATUSES.join(', ')}`);
    const result = db
      .prepare(`UPDATE events SET status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .run(status, id);
    if (!result.changes) throw notFound('Event not found');
    return { data: presentEvent(getEventRow(id)) };
  });

  router.delete('/api/events/:id', requireAdmin, (ctx) => {
    const id = parseId(ctx.params.id, 'Event');
    const result = db.prepare('DELETE FROM events WHERE id = ?').run(id); // registrations cascade
    if (!result.changes) throw notFound('Event not found');
    return { message: 'Event deleted' };
  });
}

module.exports = { register, presentEvent, getEventRow };
