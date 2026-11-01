import { pool } from '@dev-library/db';
import { hashPassword } from 'better-auth/crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PASSWORD, TRUSTED_ORIGIN, client, sessionCookie } from './helpers.js';

// Loads the app with a sign-up allowlist. The app reads its config when first imported,
// so the environment is set before the dynamic import below. Mixed case and spaces on purpose.
vi.stubEnv('SIGNUP_ALLOWED_EMAILS', ' Alice@Example.test , bob@example.test,');

const { buildApp } = await import('../src/app.js');
const { CLI_CLIENT_ID, SIGNUP_NOT_ALLOWED_MESSAGE } = await import('../src/auth.js');
const app = buildApp();

beforeAll(() => app.ready());
afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

function register(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: TRUSTED_ORIGIN },
    payload: { name: 'Someone', email, password: PASSWORD },
  });
}

function login(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: TRUSTED_ORIGIN },
    payload: { email, password: PASSWORD },
  });
}

async function userCount() {
  const { rows } = await pool.query<{ count: string }>('select count(*) from users');
  return Number(rows[0].count);
}

// A user created before the allowlist existed (or later removed from it), written straight to the database.
async function insertExistingUser(email: string) {
  await pool.query(`insert into users (id, name, email) values ('existing', 'Existing', $1)`, [email]);
  await pool.query(
    `insert into accounts (id, account_id, provider_id, user_id, password, updated_at)
     values ('existing-account', 'existing', 'credential', 'existing', $1, now())`,
    [await hashPassword(PASSWORD)],
  );
}

describe('sign-up allowlist', () => {
  it('registers an allowed email and logs them in', async () => {
    const response = await register('bob@example.test');

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe('bob@example.test');
    expect((await client(app, sessionCookie(response.headers['set-cookie'])).get('/api/commands')).statusCode).toBe(
      200,
    );
  });

  // The list itself was written as " Alice@Example.test " (see the top of the file).
  it('matches emails case-insensitively', async () => {
    const response = await register('ALICE@example.TEST');

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe('alice@example.test');
  });

  it('rejects an email that is not on the list, without creating anything', async () => {
    const response = await register('mallory@example.test');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'SIGNUP_NOT_ALLOWED', message: SIGNUP_NOT_ALLOWED_MESSAGE });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await userCount()).toBe(0);
  });

  it('rejects look-alike addresses', async () => {
    for (const email of ['bob@example.test.evil', 'xbob@example.test', 'bob+1@example.test']) {
      expect((await register(email)).statusCode).toBe(403);
    }

    expect(await userCount()).toBe(0);
  });
});

describe('existing accounts', () => {
  it('lets a registered allowed user log in again', async () => {
    expect((await register('bob@example.test')).statusCode).toBe(200);

    const response = await login('Bob@Example.test');

    expect(response.statusCode).toBe(200);
  });

  it('lets an existing user who is not on the list log in, use the app and approve a CLI login', async () => {
    await insertExistingUser('legacy@example.test');

    const response = await login('legacy@example.test');
    expect(response.statusCode).toBe(200);

    const cookie = sessionCookie(response.headers['set-cookie']);
    const api = client(app, cookie);
    expect((await api.get('/api/auth/get-session')).json().user.email).toBe('legacy@example.test');
    expect((await api.get('/api/commands')).statusCode).toBe(200);

    // CLI device login: request a code, approve it in the browser session, then collect the token.
    const code = await app.inject({
      method: 'POST',
      url: '/api/auth/device/code',
      payload: { client_id: CLI_CLIENT_ID },
    });
    const { device_code, user_code } = code.json();
    expect((await api.get(`/api/auth/device?user_code=${user_code}`)).statusCode).toBe(200);
    expect((await api.post('/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(200);

    const token = await app.inject({
      method: 'POST',
      url: '/api/auth/device/token',
      payload: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code,
        client_id: CLI_CLIENT_ID,
      },
    });
    expect(token.statusCode).toBe(200);

    const cli = await app.inject({
      method: 'GET',
      url: '/api/commands',
      headers: { authorization: `Bearer ${token.json().access_token}` },
    });
    expect(cli.statusCode).toBe(200);
  });
});
