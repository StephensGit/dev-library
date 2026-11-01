// Sets a new password for an existing account from a shell on the server. There's no email, so this is
// the only way to recover a forgotten password:
//   node dist/reset-password.js --email you@example.com
// It needs the same environment as the server (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ...).
// The new password is typed twice at a hidden prompt (see admin-cli.ts). Every session is ended,
// so all browsers and the CLI must log in again.
import { parseAdminArgs, promptNewPassword, requireInteractiveTerminal, runIfMain } from './admin-cli.js';

const USAGE = 'Usage: reset-password --email you@example.com';

export function parseResetPasswordArgs(args: string[]) {
  return { email: parseAdminArgs(args, USAGE, { allowName: false }).email };
}

async function main() {
  const { email } = parseResetPasswordArgs(process.argv.slice(2));
  requireInteractiveTerminal();

  // Loaded only now, so usage errors don't need the server's environment. Importing them reads and checks it.
  const { pool } = await import('@dev-library/db');
  const { findPasswordAccount, resetUserPassword } = await import('./accounts.js');

  try {
    const { rows } = await pool.query<{ database: string }>('select current_database() as database');
    console.log(`Resetting the password for ${email} in database "${rows[0].database}".`);

    // Checked before asking for a password, so a typo in the email fails straight away.
    await findPasswordAccount(email);

    const password = await promptNewPassword('New password', 'Nothing was changed.');
    const { sessionsEnded } = await resetUserPassword({ email, password });
    console.log(`Password changed for ${email}. Ended ${sessionsEnded} session(s); log in again everywhere.`);
  } finally {
    await pool.end();
  }
}

runIfMain(import.meta.url, main, 'Could not reset the password.');
