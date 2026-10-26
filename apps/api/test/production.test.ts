import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PASSWORD } from './helpers.js';

// Loads the app with production settings. The app reads its config when first imported,
// so the environment is set before the dynamic import below.
const ORIGIN = 'https://devlibrary.example.com';
vi.stubEnv('NODE_ENV', 'production');
vi.stubEnv('BETTER_AUTH_URL', ORIGIN);

const { buildApp } = await import('../src/app.js');
const app = buildApp();

beforeAll(() => app.ready());
afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe('production cookies', () => {
  it('marks the session cookie Secure, with the __Secure- prefix', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: ORIGIN },
      payload: { name: 'Prod', email: 'prod@example.test', password: PASSWORD },
    });

    const cookie = [response.headers['set-cookie']].flat().find((value) => value?.includes('session_token='));

    expect(response.statusCode).toBe(200);
    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
  });

  it('only trusts the production origin for writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: 'http://localhost:5173' },
      payload: { name: 'Dev', email: 'dev@example.test', password: PASSWORD },
    });

    expect(response.statusCode).toBe(403);
  });
});
