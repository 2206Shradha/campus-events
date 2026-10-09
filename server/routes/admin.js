'use strict';
const { db } = require('../db');
const { requireAdmin } = require('../auth');

function register(router) {
  router.get('/api/admin/stats', requireAdmin, () => {
    const one = (sql) => db.prepare(sql).get();

    const totals = {
      users: one(`SELECT COUNT(*) AS n FROM users WHERE role = 'student'`).n,
      events: one('SELECT COUNT(*) AS n FROM events').n,
      active_events: one(`SELECT COUNT(*) AS n FROM events WHERE status = 'upcoming'`).n,
      registrations: one(`SELECT COUNT(*) AS n FROM registrations WHERE status = 'registered'`).n,
      checked_in: one(`SELECT COUNT(*) AS n FROM registrations WHERE status = 'registered' AND checked_in_at IS NOT NULL`).n,
    };

    const byCategory = db
      .prepare(
        `SELECT e.category, COUNT(DISTINCT e.id) AS events,
                COUNT(r.id) AS registrations
           FROM events e LEFT JOIN registrations r ON r.event_id = e.id AND r.status = 'registered'
          GROUP BY e.category ORDER BY registrations DESC`,
      )
      .all();

    const topEvents = db
      .prepare(
        `SELECT e.id, e.title, e.capacity, e.status, COUNT(r.id) AS registered
           FROM events e LEFT JOIN registrations r ON r.event_id = e.id AND r.status = 'registered'
          GROUP BY e.id ORDER BY registered DESC, e.date ASC LIMIT 6`,
      )
      .all();

    const daily = db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS registrations
           FROM registrations WHERE created_at >= date('now', '-13 days')
          GROUP BY day ORDER BY day`,
      )
      .all();

    return { data: { totals, by_category: byCategory, top_events: topEvents, daily } };
  });
}

module.exports = { register };
