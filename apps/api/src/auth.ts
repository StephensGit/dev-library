import { accounts, db, sessions, users, verifications } from '@dev-library/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
// Routes are served at the default basePath, /api/auth.
export const auth = betterAuth({
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
});
