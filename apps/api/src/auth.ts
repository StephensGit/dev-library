import { accounts, db, sessions, users, verifications } from '@dev-library/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// Fail at startup rather than run with a default secret or guess the public URL.
function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`);
  }

  return value;
}

const baseURL = requireEnv('BETTER_AUTH_URL');

// The only origin allowed to make state-changing requests: where the browser loads the app.
export const trustedOrigins = [new URL(baseURL).origin];

// Routes are served at the default basePath, /api/auth.
export const auth = betterAuth({
  baseURL,
  secret: requireEnv('BETTER_AUTH_SECRET'),
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Match our plural table names: users, sessions, accounts, verifications.
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  advanced: {
    // Better Auth skips its Origin check when NODE_ENV is "test"; keep it on everywhere.
    disableOriginCheck: false,
  },
});

export type User = typeof auth.$Infer.Session.user;
