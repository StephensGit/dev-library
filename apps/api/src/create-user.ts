// Creates an account from a shell on the server, for when public sign-up is closed (the default in production):
//   node dist/create-user.js --email you@example.com [--name "Your Name"]
// It needs the same environment as the server (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ...).
// The password is typed twice at a hidden prompt (see admin-cli.ts).
import { parseAdminArgs, promptNewPassword, requireInteractiveTerminal, runIfMain } from './admin-cli.js';

const USAGE = 'Usage: create-user --email you@example.com [--name "Your Name"]';

export function parseCreateUserArgs(args: string[]) {
  const { email, name } = parseAdminArgs(args, USAGE, { allowName: true });

  return { email, name: name ?? email.split('@')[0] };
}

async function main() {
  const { email, name } = parseCreateUserArgs(process.argv.slice(2));
  requireInteractiveTerminal();

  // Loaded only now, so usage errors don't need the server's environment. Importing them reads and checks it.
  const { pool } = await import('@dev-library/db');
  const { createUserAccount } = await import('./accounts.js');

  try {
    const { rows } = await pool.query<{ database: string }>('select current_database() as database');
    console.log(`Creating an account for ${email} in database "${rows[0].database}".`);

    const password = await promptNewPassword('Password', 'Nothing was created.');
    const user = await createUserAccount({ email, name, password });
    console.log(`Created ${user.email}. Log in with it in the web app.`);
  } finally {
    await pool.end();
  }
}

runIfMain(import.meta.url, main, 'Could not create the account.');
