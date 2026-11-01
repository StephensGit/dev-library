import { pool } from '@dev-library/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PASSWORD } from './helpers.js';

// Production with its defaults: SIGNUP_ENABLED and SIGNUP_ALLOWED_EMAILS unset, so public sign-up is closed
// and accounts come from the create-user script. The app reads its config when first imported,
// so the environment is set before the dynamic imports below.
const ORIGIN = 'https://devlibrary.example.com';
vi.stubEnv('NODE_ENV', 'production');
vi.stubEnv('BETTER_AUTH_URL', ORIGIN);
vi.stubEnv('SIGNUP_ENABLED', undefined);
vi.stubEnv('SIGNUP_ALLOWED_EMAILS', undefined);

const { buildApp } = await import('../src/app.js');
const { createUserAccount } = await import('../src/accounts.js');
const { CLI_CLIENT_ID } = await import('../src/auth.js');
const app = buildApp();

beforeAll(() => app.ready());
afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

const EMAIL = 'owner@example.test';

function send(method: 'GET' | 'POST', url: string, headers: Record<string, string> = {}, payload?: object) {
  return app.inject({ method, url, headers: { origin: ORIGIN, ...headers }, payload });
}

function login(email = EMAIL, password = PASSWORD) {
  return send('POST', '/api/auth/sign-in/email', {}, { email, password });
}

function sessionCookie(setCookie: string | string[] | undefined) {
  const cookie = [setCookie].flat().find((value) => value?.startsWith('__Secure-better-auth.session_token='));
  expect(cookie).toBeDefined();
  return cookie!.split(';')[0];
}

async function userCount() {
  const { rows } = await pool.query<{ count: string }>('select count(*) from users');
  return Number(rows[0].count);
}

describe('public sign-up in production', () => {
  it('is closed by default, on the server', async () => {
    const response = await send(
      'POST',
      '/api/auth/sign-up/email',
      {},
      { name: 'Someone', email: 'someone@example.test', password: PASSWORD },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await userCount()).toBe(0);
  });
});

describe('public config', () => {
  it('tells the web app that sign-up is closed, and nothing else', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/config' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ signupEnabled: false });
  });
});

describe('create-user script', () => {
  it('creates an account that can log in, with a hashed password', async () => {
    const user = await createUserAccount({ email: ' Owner@Example.TEST ', name: ' Owner ', password: PASSWORD });

    expect(user).toMatchObject({ email: EMAIL, name: 'Owner' });

    const { rows } = await pool.query<{ provider_id: string; password: string }>(
      'select provider_id, password from accounts where user_id = $1',
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider_id).toBe('credential');
    expect(rows[0].password).not.toContain(PASSWORD);

    expect((await login()).statusCode).toBe(200);
    expect((await login(EMAIL, 'not the right password')).statusCode).toBe(401);
  });

  it('refuses an email that already has an account', async () => {
    await createUserAccount({ email: EMAIL, name: 'Owner', password: PASSWORD });

    await expect(createUserAccount({ email: 'OWNER@example.test', name: 'Again', password: PASSWORD })).rejects.toThrow(
      /already exists/,
    );
    expect(await userCount()).toBe(1);
  });

  it.each([
    ['a short password', { password: 'too-short' }, /12 to/],
    ['an invalid email', { email: 'owner@example' }, /not a valid email/],
    ['a blank name', { name: '  ' }, /name is required/],
  ])('refuses %s, creating nothing', async (_label, overrides, error) => {
    await expect(createUserAccount({ email: EMAIL, name: 'Owner', password: PASSWORD, ...overrides })).rejects.toThrow(
      error,
    );
    expect(await userCount()).toBe(0);
  });
});

describe('a script-created account', () => {
  it('keeps its session, logs out, and logs the CLI in', async () => {
    await createUserAccount({ email: EMAIL, name: 'Owner', password: PASSWORD });
    const cookie = sessionCookie((await login()).headers['set-cookie']);
    const browser = (method: 'GET' | 'POST', url: string, payload?: object) => send(method, url, { cookie }, payload);

    expect((await browser('GET', '/api/auth/get-session')).json().user.email).toBe(EMAIL);
    expect((await browser('POST', '/api/commands', { title: 'List files', command: 'ls -la' })).statusCode).toBe(201);

    // CLI device login: the CLI asks for a code, the browser session approves it, the CLI collects a token.
    const code = await app.inject({
      method: 'POST',
      url: '/api/auth/device/code',
      payload: { client_id: CLI_CLIENT_ID },
    });
    const { device_code, user_code } = code.json();
    expect((await browser('GET', `/api/auth/device?user_code=${user_code}`)).statusCode).toBe(200);
    expect((await browser('POST', '/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(200);

    const token = await app.inject({
      method: 'POST',
      url: '/api/auth/device/token',
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code, client_id: CLI_CLIENT_ID },
    });
    expect(token.statusCode).toBe(200);

    const cli = { authorization: `Bearer ${token.json().access_token}` };
    const commands = await app.inject({ method: 'GET', url: '/api/commands', headers: cli });
    expect(commands.statusCode).toBe(200);
    expect(commands.json()).toHaveLength(1);

    // Logging out of the browser ends that session only; the CLI's own session keeps working.
    expect((await browser('POST', '/api/auth/sign-out', {})).statusCode).toBe(200);
    expect((await browser('GET', '/api/auth/get-session')).json()).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/commands', headers: cli })).statusCode).toBe(200);
  });
});
