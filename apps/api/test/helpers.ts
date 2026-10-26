import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

// Matches BETTER_AUTH_URL in vitest.config.ts, like the Origin a browser sends from the web app.
export const TRUSTED_ORIGIN = 'http://localhost:5173';

export const PASSWORD = 'correct horse battery';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Registers a user and returns their session cookie and id.
export async function signUp(app: FastifyInstance, name: string) {
  const email = `${name.toLowerCase()}@example.test`;

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: TRUSTED_ORIGIN },
    payload: { name, email, password: PASSWORD },
  });

  expect(response.statusCode).toBe(200);

  return { email, id: response.json().user.id as string, cookie: sessionCookie(response.headers['set-cookie']) };
}

// Turns Set-Cookie headers into a Cookie header for the session token.
export function sessionCookie(setCookie: string | string[] | undefined) {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const token = cookies.find((cookie) => cookie.startsWith('better-auth.session_token='));

  if (!token) {
    throw new Error('No session cookie was set');
  }

  return token.split(';')[0];
}

// Sends requests the way the web app does: with the session cookie and our Origin.
export function client(app: FastifyInstance, cookie?: string) {
  const send = (method: Method, url: string, payload?: object) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin: TRUSTED_ORIGIN, ...(cookie ? { cookie } : {}) },
    });

  return {
    get: (url: string) => send('GET', url),
    post: (url: string, payload: object) => send('POST', url, payload),
    put: (url: string, payload: object) => send('PUT', url, payload),
    delete: (url: string) => send('DELETE', url),
  };
}
