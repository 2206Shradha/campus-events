'use strict';
const { badRequest } = require('./http');

const CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Club', 'Career', 'Other'];
const EVENT_STATUSES = ['upcoming', 'completed', 'cancelled'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateRegistration(body) {
  const errors = {};
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address';
  if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8–128 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password needs at least one letter and one number';

  if (Object.keys(errors).length) throw badRequest('Please fix the highlighted fields', errors);
  return { name, email, password };
}

function validateLogin(body) {
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) throw badRequest('Email and password are required');
  return { email, password };
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validateEvent(body) {
  const errors = {};
  const title = str(body.title);
  const description = str(body.description);
  const category = str(body.category);
  const date = str(body.date);
  const time = str(body.time);
  const venue = str(body.venue);
  const organizer = str(body.organizer);
  const imageUrl = str(body.image_url);
  const capacity = typeof body.capacity === 'string' && body.capacity.trim() !== '' ? Number(body.capacity) : body.capacity;

  if (title.length < 3 || title.length > 120) errors.title = 'Title must be 3–120 characters';
  if (description.length > 5000) errors.description = 'Description must be under 5000 characters';
  if (!CATEGORIES.includes(category)) errors.category = `Category must be one of: ${CATEGORIES.join(', ')}`;
  if (!isRealDate(date)) errors.date = 'Date must be a real date in YYYY-MM-DD format';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Time must be in 24-hour HH:MM format';
  if (venue.length < 2 || venue.length > 120) errors.venue = 'Venue must be 2–120 characters';
  if (organizer.length < 2 || organizer.length > 120) errors.organizer = 'Organizer must be 2–120 characters';
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) errors.capacity = 'Capacity must be a whole number between 1 and 100000';
  if (imageUrl && !/^https?:\/\/[^\s]+$/i.test(imageUrl)) errors.image_url = 'Image must be an http(s) link';
  if (imageUrl.length > 500) errors.image_url = 'Image link is too long';

  if (Object.keys(errors).length) throw badRequest('Please fix the highlighted fields', errors);
  return { title, description, category, date, time, venue, organizer, capacity, image_url: imageUrl };
}

/** Pagination params with sane limits. */
function parsePaging(query, defaultLimit = 9) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = {
  CATEGORIES, EVENT_STATUSES, validateRegistration, validateLogin, validateEvent, parsePaging, isRealDate,
};
