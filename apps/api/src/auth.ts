import { accounts, db, deviceCodes, rateLimits, sessions, users, verifications } from '@dev-library/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { config } from './config.js';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The only client allowed to start a device login. It isn't a secret (it ships with the CLI);
// it just stops the endpoint being used for anything else.
export const CLI_CLIENT_ID = 'devlib-cli';

// Where the CLI sends the user to approve a login: the web app's /device page, not the API.
// BETTER_AUTH_URL is the browser-facing origin (the Vite dev server locally).
export const DEVICE_VERIFICATION_URL = `${config.trustedOrigin}/device`;

// Routes are served at the default basePath, /api/auth.
export const auth = betterAuth({
  baseURL: config.baseURL,
  secret: config.secret,
  trustedOrigins: [config.trustedOrigin],
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Match our plural table names: users, sessions, accounts, verifications, rate_limits, device_codes.
    usePlural: true,
    schema: { users, sessions, accounts, verifications, rateLimits, deviceCodes },
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
      // The /device approval page looks up its code here. The plugin's default (5 per code lifetime) locked
      // people out after a few refreshes or typos; 8-character codes are far too many to guess at 20 tries.
      // Only this exact path: /device/code and /device/token keep the general limit and polling rules.
      '/device': { window: 10 * MINUTE, max: 20 },
    },
  },
  plugins: [
    // CLI login (RFC 8628): the CLI gets a code, the user approves it on the web app's /device page,
    // and the CLI receives an ordinary Better Auth session token. No OAuth access or refresh tokens.
    deviceAuthorization({
      expiresIn: '10m',
      interval: '5s',
      validateClient: (clientId) => clientId === CLI_CLIENT_ID,
      verificationUri: DEVICE_VERIFICATION_URL,
    }),
    // Accepts that session token as "Authorization: Bearer <token>". Its set-auth-token response
    // header would expose browser session tokens to JavaScript, so the auth route strips it (app.ts).
    bearer(),
  ],
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
