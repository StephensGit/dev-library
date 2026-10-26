import { accounts, db, rateLimits, sessions, users, verifications } from '@dev-library/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { config } from './config.js';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Routes are served at the default basePath, /api/auth.
export const auth = betterAuth({
  baseURL: config.baseURL,
  secret: config.secret,
  trustedOrigins: [config.trustedOrigin],
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Match our plural table names: users, sessions, accounts, verifications, rate_limits.
    usePlural: true,
    schema: { users, sessions, accounts, verifications, rateLimits },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  session: {
    // A session lasts 7 days. Using the app after a day has passed pushes the expiry out again,
    // so active users stay logged in and idle sessions run out.
    expiresIn: 7 * DAY,
    updateAge: DAY,
  },
  // Counted per client IP and path, stored in Postgres so restarts don't reset them.
  // Better Auth turns rate limiting off outside production by default; keep it on everywhere.
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: MINUTE,
    max: 100,
    customRules: {
      '/sign-in/email': { window: MINUTE, max: 5 },
      '/sign-up/email': { window: HOUR, max: 10 },
    },
  },
  advanced: {
    // Better Auth skips its Origin check when NODE_ENV is "test"; keep it on everywhere.
    disableOriginCheck: false,
    // The auth route replaces this header with the IP Fastify worked out (see TRUST_PROXY in config.ts),
    // so a client can't choose its own rate-limit bucket by sending one.
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
    },
  },
});

export type User = typeof auth.$Infer.Session.user;
