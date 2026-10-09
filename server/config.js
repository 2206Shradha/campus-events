'use strict';
const path = require('node:path');

// Load .env if present (built into Node 20.12+, no dotenv package needed).
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  /* no .env file – rely on real environment variables */
}

const isProd = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'dev-only-secret-do-not-use-in-production';

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  jwtTtlSeconds: 60 * 60 * 24 * 7, // 7 days
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'campus.db'),
  publicDir: path.join(__dirname, '..', 'public'),
  tzOffsetMinutes: Number(process.env.EVENT_TZ_OFFSET_MIN ?? 330),
  corsOrigin: process.env.CORS_ORIGIN || '',
  seedDemo: process.env.SEED_DEMO === 'true',
  admin: {
    name: process.env.ADMIN_NAME || 'Event Admin',
    email: process.env.ADMIN_EMAIL || (isProd ? '' : 'admin@srmist.test'),
    password: process.env.ADMIN_PASSWORD || (isProd ? '' : 'Admin@12345'),
  },
};

if (isProd && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

module.exports = config;
