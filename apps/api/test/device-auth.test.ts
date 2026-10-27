import { pool } from '@dev-library/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { CLI_CLIENT_ID } from '../src/auth.js';
import { loggerOptions } from '../src/logger.js';
import { PASSWORD, TRUSTED_ORIGIN, client, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

type App = typeof app;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// What the CLI sends: no cookie and no Origin.
function requestCode(target: App = app, clientId = CLI_CLIENT_ID) {
  return target.inject({ method: 'POST', url: '/api/auth/device/code', payload: { client_id: clientId } });
}

async function startLogin(target: App = app) {
  const response = await requestCode(target);
  expect(response.statusCode).toBe(200);
  return response.json() as { device_code: string; user_code: string; verification_uri: string };
}

// The plugin makes the CLI wait 5 seconds between polls; tests skip the wait.
async function poll(deviceCode: string, target: App = app) {
  await pool.query('update device_codes set last_polled_at = null');
  return target.inject({
    method: 'POST',
    url: '/api/auth/device/token',
    payload: { grant_type: DEVICE_GRANT, device_code: deviceCode, client_id: CLI_CLIENT_ID },
  });
}

// What the web app's /device page does: open the code (claiming it for this user), then approve or deny.
async function review(cookie: string, userCode: string, decision: 'approve' | 'deny', target: App = app) {
  const api = client(target, cookie);
  expect((await api.get(`/api/auth/device?user_code=${userCode}`)).statusCode).toBe(200);
  return api.post(`/api/auth/device/${decision}`, { userCode });
}

// Runs the whole flow for a user and returns the CLI's session token.
async function cliLogin(cookie: string, target: App = app) {
  const { device_code, user_code } = await startLogin(target);
  expect((await review(cookie, user_code, 'approve', target)).statusCode).toBe(200);

  const response = await poll(device_code, target);
  expect(response.statusCode).toBe(200);
  return response.json().access_token as string;
}

// Sends requests the way the CLI does: Bearer token only, no cookie and no Origin.
function cli(token: string, target: App = app) {
  const send = (method: Method, url: string, payload?: object) =>
    target.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  return {
    get: (url: string) => send('GET', url),
    post: (url: string, payload: object) => send('POST', url, payload),
    put: (url: string, payload: object) => send('PUT', url, payload),
    delete: (url: string) => send('DELETE', url),
  };
}

const command = { title: 'List files', command: 'ls -la' };

describe('device login', () => {
  it('logs the CLI in once the user approves in the browser', async () => {
    const alice = await signUp(app, 'Alice');
    const { device_code, user_code } = await startLogin();

    expect((await poll(device_code)).json().error).toBe('authorization_pending');
    expect((await review(alice.cookie, user_code, 'approve')).statusCode).toBe(200);

    const response = await poll(device_code);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ token_type: 'Bearer' });

    const session = await cli(response.json().access_token).get('/api/auth/get-session');
    expect(session.json().user.email).toBe(alice.email);
  });

  it('sends the user to the web app, not the API', async () => {
    const { verification_uri } = await startLogin();

    expect(verification_uri).toBe(`${TRUSTED_ORIGIN}/device`);
  });

  it('creates a separate session, so the browser and CLI log out independently', async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);

    expect(alice.cookie).not.toContain(token);
    expect((await pool.query('select 1 from sessions')).rowCount).toBe(2);
  });

  it('can only be collected once', async () => {
    const alice = await signUp(app, 'Alice');
    const { device_code, user_code } = await startLogin();
    await review(alice.cookie, user_code, 'approve');

    expect((await poll(device_code)).statusCode).toBe(200);
    expect((await poll(device_code)).json().error).toBe('invalid_grant');
  });

  it('asks the CLI to slow down when it polls too often', async () => {
    const { device_code } = await startLogin();
    await poll(device_code);

    const tooSoon = await app.inject({
      method: 'POST',
      url: '/api/auth/device/token',
      payload: { grant_type: DEVICE_GRANT, device_code, client_id: CLI_CLIENT_ID },
    });
    expect(tooSoon.json().error).toBe('slow_down');
  });

  it('only accepts the Dev Library CLI as a client', async () => {
    const response = await requestCode(app, 'some-other-app');

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_client');
  });

  it('rejects an unknown device code', async () => {
    expect((await poll('not-a-real-code')).json().error).toBe('invalid_grant');
  });
});

describe('denied and expired logins', () => {
  it('tells the CLI when the user denies access, then forgets the code', async () => {
    const alice = await signUp(app, 'Alice');
    const { device_code, user_code } = await startLogin();

    expect((await review(alice.cookie, user_code, 'deny')).statusCode).toBe(200);

    expect((await poll(device_code)).json().error).toBe('access_denied');
    expect((await poll(device_code)).json().error).toBe('invalid_grant');
    expect((await pool.query('select 1 from sessions')).rowCount).toBe(1);
  });

  it('expires codes after 10 minutes', async () => {
    const { device_code } = await startLogin();

    const { rows } = await pool.query<{ minutes: number }>(
      'select extract(epoch from expires_at - now()) / 60 as minutes from device_codes',
    );
    expect(Number(rows[0].minutes)).toBeGreaterThan(9.9);
    expect(Number(rows[0].minutes)).toBeLessThanOrEqual(10);

    await pool.query(`update device_codes set expires_at = now() - interval '1 second'`);
    expect((await poll(device_code)).json().error).toBe('expired_token');
  });

  it('cannot approve an expired code', async () => {
    const alice = await signUp(app, 'Alice');
    const { user_code } = await startLogin();
    await pool.query(`update device_codes set expires_at = now() - interval '1 second'`);

    const response = await client(app, alice.cookie).post('/api/auth/device/approve', { userCode: user_code });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('expired_token');
  });

  it('cannot approve a code twice, or deny one that was approved', async () => {
    const alice = await signUp(app, 'Alice');
    const { user_code } = await startLogin();
    await review(alice.cookie, user_code, 'approve');

    const api = client(app, alice.cookie);
    expect((await api.post('/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(400);
    expect((await api.post('/api/auth/device/deny', { userCode: user_code })).statusCode).toBe(400);
  });
});

describe('browser approval', () => {
  it('needs a signed-in user', async () => {
    const { device_code, user_code } = await startLogin();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/device/approve',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { userCode: user_code },
    });
    expect(response.statusCode).toBe(401);
    expect((await poll(device_code)).json().error).toBe('authorization_pending');
  });

  it("can't be done with a CLI token, so every login is approved in the browser", async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);
    const { device_code, user_code } = await startLogin();

    const api = cli(token);
    expect((await api.get(`/api/auth/device?user_code=${user_code}`)).statusCode).toBe(403);
    expect((await api.post('/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(403);
    expect((await poll(device_code)).json().error).toBe('authorization_pending');
  });

  it("won't let another user approve or deny a code someone else opened", async () => {
    const alice = await signUp(app, 'Alice');
    const bob = await signUp(app, 'Bob');
    const { device_code, user_code } = await startLogin();
    expect((await client(app, alice.cookie).get(`/api/auth/device?user_code=${user_code}`)).statusCode).toBe(200);

    const api = client(app, bob.cookie);
    expect((await api.post('/api/auth/device/approve', { userCode: user_code })).statusCode).toBe(403);
    expect((await api.post('/api/auth/device/deny', { userCode: user_code })).statusCode).toBe(403);
    expect((await poll(device_code)).json().error).toBe('authorization_pending');
  });

  it('keeps CSRF protection: approving from another site is rejected', async () => {
    const alice = await signUp(app, 'Alice');
    const { device_code, user_code } = await startLogin();
    await client(app, alice.cookie).get(`/api/auth/device?user_code=${user_code}`);

    for (const headers of [{ origin: 'https://evil.example' }, {}]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/device/approve',
        headers: { cookie: alice.cookie, ...headers },
        payload: { userCode: user_code },
      });
      expect(response.statusCode).toBe(403);
    }

    expect((await poll(device_code)).json().error).toBe('authorization_pending');
  });
});

describe('CLI requests with a Bearer token', () => {
  it('reads and writes without an Origin header', async () => {
    const alice = await signUp(app, 'Alice');
    const api = cli(await cliLogin(alice.cookie));

    const created = await api.post('/commands', command);
    expect(created.statusCode).toBe(201);
    expect((await api.get('/commands?search=list')).json()).toHaveLength(1);
    expect((await api.delete(`/commands/${created.json().id}`)).statusCode).toBe(204);
  });

  it("only sees the logged-in user's commands", async () => {
    const alice = await signUp(app, 'Alice');
    const bob = await signUp(app, 'Bob');
    const bobsCommand = await client(app, bob.cookie).post('/commands', { title: 'Bob only', command: 'echo bob' });
    const api = cli(await cliLogin(alice.cookie));

    expect((await api.get('/commands')).json()).toEqual([]);
    expect((await api.get('/commands?search=bob')).json()).toEqual([]);
    expect((await api.put(`/commands/${bobsCommand.json().id}`, command)).statusCode).toBe(404);
    expect((await api.delete(`/commands/${bobsCommand.json().id}`)).statusCode).toBe(404);
  });

  it.each([
    ['an unknown token', 'not-a-real-token'],
    ['a forged signed token', 'forged.signature'],
    ['an empty token', ''],
  ])('returns 401 for %s', async (_name, token) => {
    const api = cli(token);

    expect((await api.get('/commands')).statusCode).toBe(401);
    expect((await api.post('/commands', command)).statusCode).toBe(401);
  });

  it('returns 401 for other Authorization schemes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/commands',
      headers: { authorization: `Basic ${Buffer.from(`alice:${PASSWORD}`).toString('base64')}` },
      payload: command,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 once the session expires', async () => {
    const alice = await signUp(app, 'Alice');
    const api = cli(await cliLogin(alice.cookie));
    await pool.query(`update sessions set expires_at = now() - interval '1 second'`);

    expect((await api.get('/commands')).statusCode).toBe(401);
  });
});

describe('CLI logout', () => {
  it('revokes only the CLI session, without an Origin header', async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);
    const api = cli(token);

    expect((await api.post('/api/auth/sign-out', {})).statusCode).toBe(200);

    expect((await api.get('/commands')).statusCode).toBe(401);
    expect((await api.get('/api/auth/get-session')).json()).toBeNull();
    expect((await client(app, alice.cookie).get('/commands')).statusCode).toBe(200);
  });

  it('rejects the token after the session is revoked from the server', async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);
    await pool.query('delete from sessions where token = $1', [token]);

    expect((await cli(token).get('/commands')).statusCode).toBe(401);
  });

  it('ends the CLI session when the user is deleted', async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);
    await pool.query('delete from users');

    expect((await cli(token).get('/commands')).statusCode).toBe(401);
  });
});

describe('mixed credentials', () => {
  it('rejects a request with both a cookie and a Bearer token', async () => {
    const alice = await signUp(app, 'Alice');
    const token = await cliLogin(alice.cookie);

    for (const url of ['/commands', '/api/auth/get-session']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: alice.cookie, authorization: `Bearer ${token}`, origin: TRUSTED_ORIGIN },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("doesn't let a Bearer header switch off the Origin check for a cookie request", async () => {
    const alice = await signUp(app, 'Alice');

    for (const authorization of ['Bearer not-a-real-token', 'Bearer ']) {
      const response = await app.inject({
        method: 'POST',
        url: '/commands',
        headers: { cookie: alice.cookie, authorization },
        payload: command,
      });
      expect(response.statusCode).toBe(400);
    }

    expect((await client(app, alice.cookie).get('/commands')).json()).toEqual([]);
  });

  it('still requires the trusted Origin for cookie writes', async () => {
    const alice = await signUp(app, 'Alice');

    for (const headers of [{}, { origin: 'https://evil.example' }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/commands',
        headers: { cookie: alice.cookie, ...headers },
        payload: command,
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('only accepts Bearer tokens on the auth endpoints the CLI needs', async () => {
    const alice = await signUp(app, 'Alice');
    const api = cli(await cliLogin(alice.cookie));

    expect((await api.post('/api/auth/revoke-sessions', {})).statusCode).toBe(403);
    expect((await api.get('/api/auth/list-sessions')).statusCode).toBe(403);
    expect((await api.get('/api/auth/get-session')).statusCode).toBe(200);
  });
});

describe('session tokens stay out of browser JavaScript', () => {
  // The bearer plugin adds set-auth-token to any response that creates a session.
  const leaks = (headers: Record<string, unknown>) =>
    'set-auth-token' in headers || String(headers['access-control-expose-headers'] ?? '').includes('set-auth-token');

  it('never sends set-auth-token on sign-up, sign-in or session refresh', async () => {
    const signUpResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { name: 'Alice', email: 'alice@example.test', password: PASSWORD },
    });
    expect(signUpResponse.statusCode).toBe(200);
    expect(leaks(signUpResponse.headers)).toBe(false);

    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { email: 'alice@example.test', password: PASSWORD },
    });
    expect(signIn.statusCode).toBe(200);
    expect(leaks(signIn.headers)).toBe(false);

    // An old session gets a fresh cookie when it is used.
    await pool.query(`update sessions set expires_at = now() + interval '5 days'`);
    const cookie = String(signUpResponse.headers['set-cookie']).split(';')[0];
    const refresh = await client(app, cookie).get('/api/auth/get-session');
    expect(refresh.headers['set-cookie']).toBeDefined();
    expect(leaks(refresh.headers)).toBe(false);
  });

  it('never sends set-auth-token during a device login', async () => {
    const alice = await signUp(app, 'Alice');
    const { device_code, user_code } = await startLogin();
    const approve = await review(alice.cookie, user_code, 'approve');
    const token = await poll(device_code);

    expect(leaks(approve.headers)).toBe(false);
    expect(leaks(token.headers)).toBe(false);
  });
});

describe('logging', () => {
  it('never logs device codes or CLI session tokens', async () => {
    const lines: string[] = [];
    const logged = buildApp({
      logger: { ...loggerOptions, level: 'trace', stream: { write: (line) => lines.push(line) } },
    });
    const consoleOutput = vi.spyOn(console, 'log');
    const consoleErrors = vi.spyOn(console, 'error');

    try {
      await logged.ready();
      const alice = await signUp(logged, 'Alice');
      const { device_code, user_code } = await startLogin(logged);
      await review(alice.cookie, user_code, 'approve', logged);
      const token = (await poll(device_code, logged)).json().access_token;
      await cli(token, logged).get('/commands');
      await cli(token, logged).post('/api/auth/sign-out', {});

      const everything = [
        ...lines,
        ...[consoleOutput, consoleErrors].flatMap((spy) => spy.mock.calls.map(String)),
      ].join('\n');

      expect(lines.length).toBeGreaterThan(0);
      expect(everything).not.toContain(device_code);
      expect(everything).not.toContain(token);
    } finally {
      vi.restoreAllMocks();
      await logged.close();
    }
  });
});
