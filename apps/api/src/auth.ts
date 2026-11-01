import { accounts, db, deviceCodes, rateLimits, sessions, users, verifications } from '@dev-library/db';
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { config, isSignupAllowed } from './config.js';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The only client allowed to start a device login. It isn't a secret (it ships with the CLI);
// it just stops the endpoint being used for anything else.
export const CLI_CLIENT_ID = 'devlib-cli';

// Where the CLI sends the user to approve a login: the web app's /device page, not the API.
// BETTER_AUTH_URL is the browser-facing origin (the Vite dev server locally).
export const DEVICE_VERIFICATION_URL = `${config.trustedOrigin}/device`;

// Shown to anyone whose email isn't on SIGNUP_ALLOWED_EMAILS, including the create-user script. It doesn't say who is allowed.
export const SIGNUP_NOT_ALLOWED_MESSAGE = 'Registration is not open for this email address.';

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
    // Closes POST /api/auth/sign-up/email on the server (400 EMAIL_PASSWORD_SIGN_UP_DISABLED).
    // Accounts can still be created with the create-user script, which doesn't go through HTTP.
    disableSignUp: !config.signupEnabled,
  },
  databaseHooks: {
    user: {
      create: {
        // Runs on the server just before any user row is written, whichever route creates it
        // (email sign-up today, social sign-in if it's ever added). Sign-in, sessions and CLI device
        // login never create users, so they're unaffected. Throwing here aborts the sign-up with
        // nothing stored. Note: if email verification's generic duplicate response is ever enabled,
        // Better Auth turns a 403 from this hook into a fake success, so revisit the status then.
        before: async (user) => {
          if (!isSignupAllowed(config.signupAllowlist, user.email)) {
            throw new APIError('FORBIDDEN', { code: 'SIGNUP_NOT_ALLOWED', message: SIGNUP_NOT_ALLOWED_MESSAGE });
          }
        },
      },
    },
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
