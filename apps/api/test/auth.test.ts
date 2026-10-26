import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PASSWORD, TRUSTED_ORIGIN, client, sessionCookie, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

const command = { title: 'List files', command: 'ls -la' };

describe('registration, login and logout', () => {
  it('registers, returns the session, and ends it on logout', async () => {
    const alice = await signUp(app, 'Alice');
    const api = client(app, alice.cookie);

    const session = await api.get('/api/auth/get-session');
    expect(session.json().user.email).toBe(alice.email);

    expect((await api.post('/api/auth/sign-out', {})).statusCode).toBe(200);

    // The session row is deleted, so the old cookie no longer works.
    expect((await api.get('/api/auth/get-session')).json()).toBeNull();
    expect((await api.get('/commands')).statusCode).toBe(401);
  });

  it('logs in with the right password only', async () => {
    const alice = await signUp(app, 'Alice');
    const login = (password: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: TRUSTED_ORIGIN },
        payload: { email: alice.email, password },
      });

    const wrong = await login('not the right password');
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().message).toBe('Invalid email or password');

    const right = await login(PASSWORD);
    expect(right.statusCode).toBe(200);
    expect((await client(app, sessionCookie(right.headers['set-cookie'])).get('/commands')).statusCode).toBe(200);
  });

  it('rejects passwords shorter than 12 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { name: 'Short', email: 'short@example.test', password: 'too-short' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('unauthenticated requests', () => {
  it.each([
    ['GET', '/commands'],
    ['POST', '/commands'],
    ['PUT', '/commands/1'],
    ['DELETE', '/commands/1'],
    ['GET', '/tags'],
    ['POST', '/tags'],
  ] as const)('%s %s returns 401 without a session', async (method, url) => {
    const response = await app.inject({ method, url, headers: { origin: TRUSTED_ORIGIN }, payload: {} });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for a forged session cookie', async () => {
    const response = await client(app, 'better-auth.session_token=forged.value').get('/commands');

    expect(response.statusCode).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects writes with a missing or untrusted Origin', async () => {
    const alice = await signUp(app, 'Alice');
    const write = (headers: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/commands', headers: { cookie: alice.cookie, ...headers }, payload: command });

    expect((await write({})).statusCode).toBe(403);
    expect((await write({ origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await write({ origin: 'null' })).statusCode).toBe(403);

    // Nothing was created.
    expect((await client(app, alice.cookie).get('/commands')).json()).toEqual([]);
    expect((await write({ origin: TRUSTED_ORIGIN })).statusCode).toBe(201);
  });

  it('rejects deletes from an untrusted Origin', async () => {
    const alice = await signUp(app, 'Alice');
    const created = await client(app, alice.cookie).post('/commands', command);

    const response = await app.inject({
      method: 'DELETE',
      url: `/commands/${created.json().id}`,
      headers: { cookie: alice.cookie, origin: 'https://evil.example' },
    });

    expect(response.statusCode).toBe(403);
    expect((await client(app, alice.cookie).get('/commands')).json()).toHaveLength(1);
  });

  it('allows reads without an Origin', async () => {
    const alice = await signUp(app, 'Alice');
    const response = await app.inject({ method: 'GET', url: '/commands', headers: { cookie: alice.cookie } });

    expect(response.statusCode).toBe(200);
  });

  it('rejects logging in from an untrusted Origin', async () => {
    const alice = await signUp(app, 'Alice');
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: 'https://evil.example' },
      payload: { email: alice.email, password: PASSWORD },
    });

    expect(response.statusCode).toBe(403);
  });
});
