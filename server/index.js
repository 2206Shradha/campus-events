'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
require('./db');
const Router = require('./router');
const { HttpError, Reply, readJson, sendJson } = require('./http');
const { ensureAdmin } = require('./bootstrap');

const router = new Router();
router.get('/api/health', () => ({ status: 'ok', time: new Date().toISOString() }));
require('./routes/auth').register(router);
require('./routes/events').register(router);
require('./routes/registrations').register(router);
require('./routes/admin').register(router);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' https: data:; script-src 'self'; frame-ancestors 'none'",
};

async function handleApi(req, res, url) {
  const { route, params, pathMatched } = router.match(req.method, url.pathname);
  if (!route) {
    if (pathMatched) throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    throw new HttpError(404, 'API route not found', 'NOT_FOUND');
  }
  const ctx = {
    req,
    res,
    params,
    query: Object.fromEntries(url.searchParams),
    body: {},
    user: null,
  };
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readJson(req);

  for (const handler of route.handlers) {
    const out = await handler(ctx);
    if (out === undefined) continue;
    if (out instanceof Reply) return sendJson(res, out.status, out.data);
    return sendJson(res, 200, out);
  }
  throw new Error(`Route ${req.method} ${url.pathname} produced no response`);
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(config.publicDir, rel));
  // Block path traversal (e.g. /../.env)
  if (!file.startsWith(config.publicDir + path.sep)) throw new HttpError(403, 'Forbidden');

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url, 'http://localhost');
    if (config.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: { message: err.message, code: err.code, details: err.details } });
    } else {
      console.error('[error]', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: { message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL_ERROR' } });
      } else {
        res.end();
      }
    }
  } finally {
    if (!config.isProd || req.url.startsWith('/api/')) {
      console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

function start(port = config.port) {
  ensureAdmin();
  if (config.seedDemo) require('./seed').seedDemo();
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Campus Events running on http://localhost:${server.address().port}`);
      resolve(server);
    });
  });
}

module.exports = { server, start };
if (require.main === module) start();
