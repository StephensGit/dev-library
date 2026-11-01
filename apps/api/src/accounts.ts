import { db, deviceCodes, sessions } from '@dev-library/db';
import { eq } from 'drizzle-orm';
import { auth } from './auth.js';
import { isEmailAddress, normaliseEmail } from './config.js';

type NewAccount = { email: string; name: string; password: string };
type AuthContext = Awaited<typeof auth.$context>;

// Better Auth's configured limits (12 to 128 characters), the same ones sign-up applies.
function assertPasswordLength(context: AuthContext, password: string) {
  const { minPasswordLength, maxPasswordLength } = context.password.config;

  if (password.length < minPasswordLength || password.length > maxPasswordLength) {
    throw new Error(`The password must be ${minPasswordLength} to ${maxPasswordLength} characters.`);
  }
}

// Creates an email/password account without going through HTTP, so it works while public sign-up
// is closed (SIGNUP_ENABLED=false). It makes the same Better Auth calls as POST /sign-up/email:
// the configured password hasher and length limits, then a user plus a "credential" account holding
// the hash, so the account logs in like any other. The user.create database hook still runs,
// so SIGNUP_ALLOWED_EMAILS applies here too when it's set.
// Only reachable from a shell on the server (the create-user script); there's no route for it.
export async function createUserAccount({ email, name, password }: NewAccount) {
  const context = await auth.$context;
  const normalisedEmail = normaliseEmail(email);
  const trimmedName = name.trim();

  if (!isEmailAddress(normalisedEmail)) {
    throw new Error('That is not a valid email address.');
  }

  if (!trimmedName) {
    throw new Error('A name is required.');
  }

  assertPasswordLength(context, password);

  if (await context.internalAdapter.findUserByEmail(normalisedEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const hash = await context.password.hash(password);
  // "admin": provisioned by an operator rather than self-registered (sign-up passes "email-password").
  const user = await context.internalAdapter.createUser(
    { email: normalisedEmail, name: trimmedName, emailVerified: false },
    { method: 'admin' },
  );

  try {
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: hash,
    });
  } catch (error) {
    // Better Auth's transaction helper isn't public, so undo by hand: a user without a password can't log in.
    await context.internalAdapter.deleteUser(user.id);
    throw error;
  }

  return { id: user.id, email: user.email, name: user.name };
}

// The user with this email and their password ("credential") account, or a clear error for either missing.
export async function findPasswordAccount(email: string) {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(normaliseEmail(email));

  if (!found) {
    throw new Error('No account has this email address.');
  }

  const account = await context.internalAdapter.findCredentialAccount(found.user.id);

  if (!account?.password) {
    throw new Error('This account has no password to reset (it does not sign in with email and password).');
  }

  return { user: found.user, account };
}

// Replaces an account's password, keeping the user (and so their id, commands and tags) as it is.
// Follows Better Auth's own reset (resetCredentialPassword): its password hasher, sessions revoked before
// the new hash is written. Its transaction helper isn't public, so the steps run in an order that fails
// safe: if a later step fails, sessions are already ended and the old password still applies.
// Only reachable from a shell on the server (the reset-password script); there's no route for it.
export async function resetUserPassword({ email, password }: { email: string; password: string }) {
  const context = await auth.$context;
  assertPasswordLength(context, password);

  const { user, account } = await findPasswordAccount(email);
  const hash = await context.password.hash(password);

  // A CLI login approved but not yet collected would otherwise still turn into a new session.
  await db.delete(deviceCodes).where(eq(deviceCodes.userId, user.id));

  // Every session: browsers and CLI Bearer tokens alike.
  const sessionsEnded = await db.$count(sessions, eq(sessions.userId, user.id));
  await context.internalAdapter.deleteUserSessions(user.id);

  await context.internalAdapter.updateAccount(account.id, { password: hash });

  return { userId: user.id, sessionsEnded };
}
