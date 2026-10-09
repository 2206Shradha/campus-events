# Campus Event Management Platform

Full-stack web app for the **ACM Student Chapter SRMIST – Web Development Recruitment** task.
Students discover events, register, and manage registrations. Organizers (admins) create and manage events,
see participants and check people in.

**Stack:** Node.js 22 (no framework dependencies) · SQLite (`node:sqlite`) · JWT auth · vanilla JS single-page frontend.
Zero `npm install` needed: the whole project runs on Node's standard library.

## Run locally

```bash
node -v            # must be 22.5 or newer
cp .env.example .env
npm run seed       # creates the admin account + demo events
npm start          # http://localhost:3000
npm test           # 13 API integration tests
```

### Test credentials
| Role | Email | Password |
|---|---|---|
| Student | `student@srmist.test` | `Student@123` |
| Organizer (admin) | `admin@srmist.test` | `Admin@12345` |

## Features

**Student:** responsive home page with next-up event, event listing with search + category/date/status filters + pagination,
event details, register / cancel, clear feedback (success, already registered, event full, closed or started events),
dashboard with upcoming / past / cancelled registrations and a unique registration ID per booking.

**Organizer:** role-based access, create / edit / delete events, mark events completed or cancelled, change capacity
(can't go below current registrations), participant list, check-in by registration ID (attendance tracking),
analytics overview (totals, seats filled, registrations by category, last 14 days).

## API

All routes are under `/api`. Errors are JSON: `{ "error": { "message", "code", "details" } }`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Create student account, returns JWT |
| POST | `/auth/login` | public | Log in (rate limited) |
| GET | `/auth/me` | user | Current user |
| GET | `/events` | public | List. Query: `q, category, date_from, date_to, status (upcoming/completed/cancelled/all), page, limit` |
| GET | `/events/:id` | public | Details (+ your registration if logged in) |
| POST | `/events` | admin | Create |
| PUT | `/events/:id` | admin | Update |
| PATCH | `/events/:id/status` | admin | Mark upcoming / completed / cancelled |
| DELETE | `/events/:id` | admin | Delete (cascades registrations) |
| POST | `/events/:id/register` | user | Register (duplicate + capacity checks) |
| DELETE | `/events/:id/register` | user | Cancel registration |
| GET | `/registrations/me` | user | My registrations |
| GET | `/events/:id/registrations` | admin | Participants |
| POST | `/events/:id/check-in` | admin | Check in with `{ "code": "EVT-XXXX-XXXX" }` |
| GET | `/admin/stats` | admin | Analytics |
| GET | `/categories`, `/health` | public | Helpers |

Status codes: `200/201` success · `400` validation · `401` not logged in · `403` wrong role · `404` not found ·
`409` conflict (duplicate registration, event full, closed) · `429` too many login attempts.

## Database

```
users (id, name, email UNIQUE, password_hash, role[student|admin], created_at)
events (id, title, description, category, date, time, venue, organizer, capacity>0, image_url,
        status[upcoming|completed|cancelled], created_by -> users, created_at, updated_at)
registrations (id, user_id -> users, event_id -> events, status[registered|cancelled], code UNIQUE,
               checked_in_at, created_at, updated_at, UNIQUE(user_id, event_id))
```

* `UNIQUE(user_id, event_id)` makes duplicate registrations impossible at the database level.
* The capacity check and insert run in one `BEGIN IMMEDIATE` transaction, so seats can't be oversold.
* Cancelling keeps the row (`status = cancelled`); registering again re-activates it with the same ID.
* Foreign keys are enforced; deleting an event or user cascades to their registrations.

## Security notes

* Passwords hashed with scrypt + per-user salt; never returned by the API.
* JWT (HS256) signed with `JWT_SECRET`, 7-day expiry; the user is re-read from the DB on each request, so role changes apply immediately.
* All input validated on the backend; SQL is parameterized; frontend escapes all dynamic text.
* Login rate limiting, request body size limit, path-traversal protection, CSP and other security headers.
* Secrets come from environment variables. The server refuses to start in production without `JWT_SECRET`.

## Deploy (Render, free tier)

1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → select the repo (uses `render.yaml`). Frontend and backend deploy together as one service.
3. Open the URL Render gives you and put it in your submission together with the test credentials above.

Free-tier disks are ephemeral, so data resets on redeploy; `SEED_DEMO=true` recreates the demo data each time.
For permanent data, attach a Render disk and set `DB_PATH=/var/data/campus.db`.

## Project structure

```
server/
  index.js          HTTP server, API dispatch, static files, security headers
  router.js http.js tiny router, error classes, JSON helpers
  auth.js           scrypt passwords, JWT, auth middleware
  db.js             schema, transactions
  validators.js     input validation
  routes/           auth, events, registrations, admin
  seed.js bootstrap.js
public/
  index.html css/styles.css
  js/               api client, ui helpers, router, pages/ (home, events, event, auth, dashboard, admin)
tests/api.test.js
```

## Ideas for next steps

Email confirmations (add an SMTP/Resend call after registration), QR codes from the registration ID,
image uploads instead of image links, calendar view.
