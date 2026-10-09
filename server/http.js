'use strict';

class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Wrapper so handlers can return a specific status code. */
class Reply {
  constructor(status, data) {
    this.status = status;
    this.data = data;
  }
}
const reply = (status, data) => new Reply(status, data);

const badRequest = (message, details) => new HttpError(400, message, 'VALIDATION_ERROR', details);
const unauthorized = (message = 'Please log in to continue') => new HttpError(401, message, 'UNAUTHORIZED');
const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, message, 'FORBIDDEN');
const notFound = (message = 'Not found') => new HttpError(404, message, 'NOT_FOUND');
const conflict = (message, code = 'CONFLICT') => new HttpError(409, message, code);

async function readJson(req, limitBytes = 100 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('Request body must be a JSON object');
  }
  return parsed;
}

function sendJson(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

/** Parse ":id" style path params into a positive integer or 404. */
function parseId(value, label = 'Resource') {
  if (!/^\d+$/.test(String(value))) throw notFound(`${label} not found`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw notFound(`${label} not found`);
  return n;
}

module.exports = {
  HttpError, Reply, reply, badRequest, unauthorized, forbidden, notFound, conflict,
  readJson, sendJson, parseId,
};
