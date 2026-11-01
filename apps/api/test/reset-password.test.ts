import { pool } from '@dev-library/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPasswordAccount, resetUserPassword } from '../src/accounts.js';
import { buildApp } from '../src/app.js';
import { CLI_CLIENT_ID } from '../src/auth.js';
import { parseResetPasswordArgs } from '../src/reset-password.js';
import { PASSWORD, TRUSTED_ORIGIN, client, sessionCookie, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

const NEW_PASSWORD = 'a brand new passphrase';

function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: TRUSTED_ORIGIN },
    payload: { email, password },
  });
}

function bearer(token: string, url = '/api/commands') {
  return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
}

// Starts a CLI device login and approves it in the browser session, without collecting the token yet.
async function approveDeviceLogin(cookie: string) {
  const code = await app.inject({
    method: 'POST',
    url: '/api/auth/device/code',
    payload: { client_id: CLI_CLIENT_ID },
  });
  const { device_code, user_code } = code.json();
  const api = client(app, cookie);

  expect((await api.get(`/api/auth/device?user_code=${user_code}`)).statusCode).toBe(200);
  expect((await api.post('/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(200);

  return () =>
    app.inject({
      method: 'POST',
      url: '/api/auth/device/token',
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code, client_id: CLI_CLIENT_ID },
    });
}

describe('resetting a password', () => {
  it('replaces the password: the old one stops working and the new one works', async () => {
    const alice = await signUp(app, 'Alice');

    await resetUserPassword({ email: alice.email, password: NEW_PASSWORD });

    const old = await login(alice.email, PASSWORD);
    expect(old.statusCode).toBe(401);
    expect(old.json().message).toBe('Invalid email or password');

    const fresh = await login(alice.email, NEW_PASSWORD);
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().user.id).toBe(alice.id);
  });

  it('keeps the user id, commands and tags', async () => {
    const alice = await signUp(app, 'Alice');
    const api = client(app, alice.cookie);
    const tag = (await api.post('/api/tags', { name: 'git' })).json();
    await api.post('/api/commands', { title: 'Status', command: 'git status', tagIds: [tag.id] });

    const { userId } = await resetUserPassword({ email: alice.email, password: NEW_PASSWORD });
    expect(userId).toBe(alice.id);

    const after = client(app, sessionCookie((await login(alice.email, NEW_PASSWORD)).headers['set-cookie']));
    const commands = (await after.get('/api/commands')).json();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ title: 'Status', command: 'git status' });
    expect((await after.get('/api/tags')).json()).toEqual([expect.objectContaining({ id: tag.id, name: 'git' })]);

    // Still exactly one password account, now holding a different hash.
    const { rows } = await pool.query('select id from accounts where user_id = $1', [alice.id]);
    expect(rows).toHaveLength(1);
  });

  it('matches the email case-insensitively', async () => {
    const alice = await signUp(app, 'Alice');

    await resetUserPassword({ email: ' ALICE@example.test ', password: NEW_PASSWORD });

    expect((await login(alice.email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("only changes that user's password", async () => {
    const alice = await signUp(app, 'Alice');
    const bob = await signUp(app, 'Bob');

    await resetUserPassword({ email: alice.email, password: NEW_PASSWORD });

    expect((await login(bob.email, PASSWORD)).statusCode).toBe(200);
    expect((await client(app, bob.cookie).get('/api/commands')).statusCode).toBe(200);
  });
});

describe('sessions after a reset', () => {
  it('ends every browser and CLI session, and pending CLI logins', async () => {
    const alice = await signUp(app, 'Alice');
    const secondBrowser = sessionCookie((await login(alice.email, PASSWORD)).headers['set-cookie']);

    const collectFirst = await approveDeviceLogin(alice.cookie);
    const cliToken = (await collectFirst()).json().access_token as string;
    expect((await bearer(cliToken)).statusCode).toBe(200);

    // Approved in the browser, but the CLI hasn't collected its token yet.
    const collectPending = await approveDeviceLogin(alice.cookie);

    const { sessionsEnded } = await resetUserPassword({ email: alice.email, password: NEW_PASSWORD });
    expect(sessionsEnded).toBe(3);

    expect((await client(app, alice.cookie).get('/api/commands')).statusCode).toBe(401);
    expect((await client(app, secondBrowser).get('/api/commands')).statusCode).toBe(401);
    expect((await bearer(cliToken)).statusCode).toBe(401);
    expect((await collectPending()).statusCode).not.toBe(200);
  });

  it("leaves other users' sessions alone", async () => {
    const alice = await signUp(app, 'Alice');
    const bob = await signUp(app, 'Bob');

    await resetUserPassword({ email: alice.email, password: NEW_PASSWORD });

    expect((await client(app, bob.cookie).get('/api/auth/get-session')).json().user.email).toBe(bob.email);
  });
});

describe('refused resets', () => {
  it('refuses an email with no account', async () => {
    await expect(resetUserPassword({ email: 'nobody@example.test', password: NEW_PASSWORD })).rejects.toThrow(
      'No account has this email address.',
    );
  });

  it('refuses an account with no password credential', async () => {
    const alice = await signUp(app, 'Alice');
    await pool.query(`delete from accounts where user_id = $1`, [alice.id]);

    await expect(findPasswordAccount(alice.email)).rejects.toThrow(/has no password to reset/);
    await expect(resetUserPassword({ email: alice.email, password: NEW_PASSWORD })).rejects.toThrow(
      /has no password to reset/,
    );
  });

  it.each([
    ['too short', 'too-short'],
    ['too long', 'x'.repeat(129)],
  ])('refuses a password that is %s, changing nothing', async (_label, password) => {
    const alice = await signUp(app, 'Alice');

    await expect(resetUserPassword({ email: alice.email, password })).rejects.toThrow(/12 to 128 characters/);

    expect((await client(app, alice.cookie).get('/api/commands')).statusCode).toBe(200);
    expect((await login(alice.email, PASSWORD)).statusCode).toBe(200);
  });
});

describe('reset-password arguments', () => {
  it('takes an email', () => {
    expect(parseResetPasswordArgs(['--email', 'me@example.com'])).toEqual({ email: 'me@example.com' });
  });

  it.each([['--password', 'hunter2'], ['--password=hunter2'], ['-p', 'hunter2']])(
    'refuses a password argument (%s)',
    (...args) => {
      expect(() => parseResetPasswordArgs(['--email', 'me@example.com', ...args])).toThrow(/never accepted/);
    },
  );

  it.each([[[]], [['--email', 'me@example.com', 'hunter2']], [['--email', 'me@example.com', '--name', 'Me']]])(
    'refuses %j with only the usage line',
    (args) => {
      expect(() => parseResetPasswordArgs(args)).toThrow(/^Usage: reset-password/);
    },
  );
});
