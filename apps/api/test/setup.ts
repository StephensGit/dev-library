import { pool } from '@dev-library/db';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Second safety net: ask Postgres which database the app is really connected to
// before emptying anything, in case DATABASE_URL wasn't overridden for the tests.
beforeAll(async () => {
  const { rows } = await pool.query<{ name: string }>('select current_database() as name');

  if (!rows[0].name.endsWith('_test')) {
    throw new Error(`Refusing to empty database "${rows[0].name}": tests must use a database ending in _test.`);
  }
});

// Every test starts with empty tables.
beforeEach(async () => {
  await pool.query(
    'truncate users, sessions, accounts, verifications, rate_limits, device_codes, commands, tags, command_tags restart identity cascade',
  );
});

afterAll(async () => {
  await pool.end();
});
