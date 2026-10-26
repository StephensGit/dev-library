import { pool } from '@dev-library/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LIBRARY_RATE_LIMIT, buildApp } from '../src/app.js';
import { loggerOptions } from '../src/logger.js';
import { PASSWORD, TRUSTED_ORIGIN, client, signUp } from './helpers.js';

const app = buildApp();

beforeAll(() => app.ready());
afterAll(() => app.close());

type InjectOptions = { remoteAddress?: string; headers?: Record<string, string> };

function signIn(target: typeof app, email: string, password: string, options: InjectOptions = {}) {
  return target.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    remoteAddress: options.remoteAddress,
    headers: { origin: TRUSTED_ORIGIN, ...options.headers },
    payload: { email, password },
  });
}

function signUpFrom(remoteAddress: string, name: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress,
    headers: { origin: TRUSTED_ORIGIN },
    payload: { name, email: `${name}@example.test`, password: PASSWORD },
  });
}

describe('rate limiting: sign-in and registration', () => {
  it('allows 5 sign-in attempts a minute per IP, then returns 429', async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await signIn(app, 'nobody@example.test', 'wrong password!!')).statusCode);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('blocks correct passwords too once the limit is reached', async () => {
    const alice = await signUp(app, 'Alice');
    for (let attempt = 0; attempt < 5; attempt++) {
      await signIn(app, alice.email, 'wrong password!!');
    }

    expect((await signIn(app, alice.email, PASSWORD)).statusCode).toBe(429);
  });

  it('allows 10 registrations an hour per IP, then returns 429', async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      statuses.push((await signUpFrom('192.0.2.10', `user${attempt}`)).statusCode);
    }

    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('counts each client IP separately', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(app, 'nobody@example.test', 'wrong password!!', { remoteAddress: '192.0.2.20' });
    }

    const otherClient = await signIn(app, 'nobody@example.test', 'wrong password!!', { remoteAddress: '192.0.2.21' });
    expect(otherClient.statusCode).toBe(401);
  });

  it('ignores a client-supplied X-Forwarded-For, so faking IPs does not reset the limit', async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await signIn(app, 'nobody@example.test', 'wrong password!!', {
        headers: { 'x-forwarded-for': `198.51.100.${attempt}` },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.at(-1)).toBe(429);
  });

  it('stores the counters in PostgreSQL', async () => {
    await signIn(app, 'nobody@example.test', 'wrong password!!');

    const { rows } = await pool.query<{ key: string }>('select key from rate_limits');
    expect(rows.map((row) => row.key)).toContain('127.0.0.1|/sign-in/email');
  });
});

describe('rate limiting behind a trusted proxy', () => {
  // Production behind one reverse proxy at 127.0.0.1 (inject connects from there).
  const proxied = buildApp({ trustProxy: ['127.0.0.1'] });

  beforeAll(() => proxied.ready());
  afterAll(() => proxied.close());

  it("uses the client IP reported by the trusted proxy, so users don't share one bucket", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(proxied, 'nobody@example.test', 'wrong password!!', {
        headers: { 'x-forwarded-for': '203.0.113.1' },
      });
    }

    const blocked = await signIn(proxied, 'nobody@example.test', 'wrong password!!', {
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    const otherUser = await signIn(proxied, 'nobody@example.test', 'wrong password!!', {
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(blocked.statusCode).toBe(429);
    expect(otherUser.statusCode).toBe(401);
  });

  it('ignores fake addresses a client adds in front of the real one', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(proxied, 'nobody@example.test', 'wrong password!!', {
        headers: { 'x-forwarded-for': '203.0.113.5' },
      });
    }

    // The proxy appends the real client IP; anything before it came from the client.
    const spoofed = await signIn(proxied, 'nobody@example.test', 'wrong password!!', {
      headers: { 'x-forwarded-for': '10.9.9.9, 203.0.113.5' },
    });
    expect(spoofed.statusCode).toBe(429);
  });
});

describe('rate limiting: command and tag routes', () => {
  it(`allows ${LIBRARY_RATE_LIMIT.max} requests a minute per IP, then returns 429`, async () => {
    const send = (remoteAddress: string, spoofedIp?: string) =>
      app.inject({
        method: 'GET',
        url: '/commands',
        remoteAddress,
        headers: spoofedIp ? { 'x-forwarded-for': spoofedIp } : {},
      });

    // Requests without a session count too, so floods are stopped before any database lookup.
    for (let request = 0; request < LIBRARY_RATE_LIMIT.max; request++) {
      expect((await send('192.0.2.30', `198.51.100.${request % 250}`)).statusCode).toBe(401);
    }

    expect((await send('192.0.2.30')).statusCode).toBe(429);
    expect((await send('192.0.2.31')).statusCode).toBe(401);
  });
});

describe('account enumeration', () => {
  it('gives the same response for an unknown email and a wrong password', async () => {
    const alice = await signUp(app, 'Alice');

    const unknownEmail = await signIn(app, 'nobody@example.test', 'wrong password!!');
    const wrongPassword = await signIn(app, alice.email, 'wrong password!!');

    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });
});

describe('session cookies and lifetime', () => {
  it('sets an HttpOnly, SameSite=Lax session cookie that lasts 7 days', async () => {
    const response = await signUpFrom('192.0.2.40', 'cookie');
    const cookie = [response.headers['set-cookie']].flat().find((value) => value?.includes('session_token='));

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=604800/);
  });

  it('rejects an expired session', async () => {
    const alice = await signUp(app, 'Alice');
    await pool.query(`update sessions set expires_at = now() - interval '1 second'`);

    expect((await client(app, alice.cookie).get('/commands')).statusCode).toBe(401);
  });

  it('rejects a revoked session', async () => {
    const alice = await signUp(app, 'Alice');
    await pool.query('delete from sessions');

    expect((await client(app, alice.cookie).get('/commands')).statusCode).toBe(401);
  });

  it('extends a session that is used after a day', async () => {
    const alice = await signUp(app, 'Alice');
    // As if the session was created two days ago: five days left.
    await pool.query(`update sessions set expires_at = now() + interval '5 days'`);

    await client(app, alice.cookie).get('/api/auth/get-session');

    const { rows } = await pool.query<{ days_left: number }>(
      `select extract(epoch from expires_at - now()) / 86400 as days_left from sessions`,
    );
    expect(Number(rows[0].days_left)).toBeGreaterThan(6.9);
  });
});

describe('logging', () => {
  it('never logs passwords, session tokens or cookies', async () => {
    const lines: string[] = [];
    const logged = buildApp({
      logger: { ...loggerOptions, level: 'trace', stream: { write: (line) => lines.push(line) } },
    });
    const consoleOutput = vi.spyOn(console, 'log');
    const consoleWarnings = vi.spyOn(console, 'warn');
    const consoleErrors = vi.spyOn(console, 'error');

    try {
      const alice = await signUp(logged, 'Alice');
      await signIn(logged, alice.email, 'a wrong password');
      const api = client(logged, alice.cookie);
      await api.post('/commands', { title: 'Logged', command: 'echo hi' });
      await api.get('/api/auth/get-session');
      await api.post('/api/auth/sign-out', {});

      const token = alice.cookie.split('=')[1].split('.')[0];
      const everything = [
        ...lines,
        ...[consoleOutput, consoleWarnings, consoleErrors].flatMap((spy) => spy.mock.calls.map(String)),
      ].join('\n');

      expect(lines.length).toBeGreaterThan(0);
      expect(everything).not.toContain(PASSWORD);
      expect(everything).not.toContain('a wrong password');
      expect(everything).not.toContain(token);
      expect(everything).not.toContain('session_token');
    } finally {
      vi.restoreAllMocks();
      await logged.close();
    }
  });
});

describe('HTTP hardening', () => {
  it('sends security headers on API and auth responses', async () => {
    for (const url of ['/', '/commands', '/api/auth/get-session']) {
      const { headers } = await app.inject({ method: 'GET', url });

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(headers['strict-transport-security']).toContain('max-age=');
      expect(headers['content-security-policy']).toContain("default-src 'self'");
    }
  });

  it('rejects request bodies over 100 KB with 413', async () => {
    const alice = await signUp(app, 'Alice');
    const response = await client(app, alice.cookie).post('/commands', {
      title: 'Huge',
      command: 'x'.repeat(150 * 1024),
    });

    expect(response.statusCode).toBe(413);
  });
});
