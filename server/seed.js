'use strict';
// Demo data. Dates are relative to "today" so the demo always has upcoming events.
const { db } = require('./db');
const config = require('./config');
const { hashPassword } = require('./auth');
const { ensureAdmin } = require('./bootstrap');

function dayOffset(days) {
  const d = new Date(Date.now() + config.tzOffsetMinutes * 60000 + days * 86400000);
  return d.toISOString().slice(0, 10);
}

const EVENTS = [
  ['Hack the Hill 2026', 'A 24-hour hackathon for teams of up to four. Build something useful for campus life – mentors from industry will review projects on Sunday morning. Food and caffeine provided.', 'Technical', 6, '09:00', 'Tech Park Auditorium', 'ACM Student Chapter', 120],
  ['Intro to Git & GitHub', 'Hands-on workshop: branches, pull requests and code review. Bring a laptop with Git installed. No prior experience needed.', 'Workshop', 3, '14:30', 'Lab 3, Block B', 'ACM Web Development Division', 40],
  ['Inter-Department Football League', 'Quarter-final matches of the annual football league. Cheer for your department – entry is free.', 'Sports', 9, '16:00', 'Main Ground', 'Sports Council', 300],
  ['Cultural Night: Rang Tarang', 'An evening of dance, music and theatre performed by student clubs. Doors open 30 minutes early.', 'Cultural', 12, '18:30', 'Open Air Theatre', 'Cultural Committee', 500],
  ['Resume Clinic with Alumni', 'Bring a printed resume and get one-to-one feedback from alumni working at product companies. Slots are limited so register early.', 'Career', 4, '11:00', 'Seminar Hall 2', 'Placement Cell', 25],
  ['Machine Learning in Production', 'A guest lecture on taking models from notebooks to real systems: monitoring, drift and cost. Q&A at the end.', 'Seminar', 15, '10:30', 'Seminar Hall 1', 'Department of CSE', 150],
  ['Photography Club Photo Walk', 'A relaxed two-hour walk around campus with the photography club. Any camera or phone works.', 'Club', 2, '07:00', 'Main Gate', 'Photography Club', 30],
  ['Open Mic & Poetry Evening', 'Sign up on the day to perform or just come to listen. Hosted by the literary club.', 'Cultural', 18, '17:30', 'Student Centre Lawn', 'Literary Club', 80],
  ['Design Thinking Bootcamp', 'Two-hour sprint on user research and rapid prototyping, run in small teams.', 'Workshop', 21, '13:00', 'Innovation Lab', 'Entrepreneurship Cell', 3],
];

function seedDemo() {
  ensureAdmin();
  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();

  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get('student@srmist.test')) {
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'student')`)
      .run('Demo Student', 'student@srmist.test', hashPassword('Student@123'));
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 0) {
    const insert = db.prepare(
      `INSERT INTO events (title, description, category, date, time, venue, organizer, capacity, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [title, description, category, offset, time, venue, organizer, capacity] of EVENTS) {
      insert.run(title, description, category, dayOffset(offset), time, venue, organizer, capacity, admin?.id ?? null);
    }
    // One past event so the "Past" filter and dashboard history have something to show.
    db.prepare(
      `INSERT INTO events (title, description, category, date, time, venue, organizer, capacity, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
    ).run('Freshers Orientation', 'Welcome session for the new batch.', 'Other', dayOffset(-10), '10:00', 'Main Auditorium', 'Student Affairs', 400, admin?.id ?? null);
    console.log(`[seed] inserted ${EVENTS.length + 1} demo events`);
  }
}

module.exports = { seedDemo };

if (require.main === module) {
  seedDemo();
  console.log('[seed] done. Admin: %s  Student: student@srmist.test / Student@123', config.admin.email);
}
