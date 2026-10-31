import { pool } from '@dev-library/db';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { client, signUp } from './helpers.js';

// A stand-in for apps/web/dist: index.html, one hashed asset and one unhashed file.
async function createWebRoot(webRoot: string) {
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><div id="root"></div>');
  await writeFile(join(webRoot, 'assets', 'index-abc123.js'), 'console.log("app")');
  await writeFile(join(webRoot, 'favicon.svg'), '<svg></svg>');
  return webRoot;
}

const tempDir = await mkdtemp(join(tmpdir(), 'devlib-web-'));
const webRoot = await createWebRoot(join(tempDir, 'public'));
// Deployed somewhere whose own path contains an "assets" folder, e.g. /srv/assets/app/dist/public.
const webRootUnderAssets = await createWebRoot(join(tempDir, 'assets', 'app', 'public'));

const app = buildApp({ webRoot });
const appUnderAssets = buildApp({ webRoot: webRootUnderAssets });
const apiOnly = buildApp();

beforeAll(() => Promise.all([app.ready(), appUnderAssets.ready(), apiOnly.ready()]));
afterAll(async () => {
  await Promise.all([app.close(), appUnderAssets.close(), apiOnly.close()]);
  await rm(tempDir, { recursive: true, force: true });
});

const ONE_YEAR = 'public, max-age=31536000, immutable';

describe('health check', () => {
  it('reports ok when the database answers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 without details when the database fails', async () => {
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432') as never);

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('serving the web app', () => {
  it('serves index.html at / without long-term caching', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toContain('<div id="root">');
  });

  it('caches hashed assets forever', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe(ONE_YEAR);
  });

  it('revalidates files outside the assets folder', async () => {
    const response = await app.inject({ method: 'GET', url: '/favicon.svg' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  describe('when the deployment folder itself is inside an "assets" folder', () => {
    it.each(['/', '/index.html', '/device', '/favicon.svg'])('still revalidates %s', async (url) => {
      const response = await appUnderAssets.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('still caches hashed assets forever', async () => {
      const response = await appUnderAssets.inject({ method: 'GET', url: '/assets/index-abc123.js' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe(ONE_YEAR);
    });
  });

  it('serves index.html for app pages such as /device, so the web app can show them', async () => {
    const response = await app.inject({ method: 'GET', url: '/device?user_code=ABCD1234' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('sends the security headers on web app responses', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/device' });

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    // Only added in production, where the app is served over https.
    expect(headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('returns a JSON 404 for missing files instead of index.html', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/missing.js' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it.each(['/api', '/api/unknown', '/api/commands/extra/path', '/api/auth'])(
    'returns a JSON 404 for the unknown API path %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.json()).toMatchObject({ statusCode: 404 });
    },
  );

  it('does not answer writes to page paths with index.html', async () => {
    const response = await app.inject({ method: 'POST', url: '/device', payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('still serves the API and auth routes alongside the web app', async () => {
    const alice = await signUp(app, 'Alice');
    const api = client(app, alice.cookie);

    expect((await api.post('/api/commands', { title: 'Hello', command: 'echo hi' })).statusCode).toBe(201);
    expect((await api.get('/api/commands')).json()).toMatchObject([{ title: 'Hello' }]);
    expect((await api.get('/api/auth/get-session')).json()).toMatchObject({ user: { email: alice.email } });
  });
});

describe('API-only server (development)', () => {
  it('has no web app, so unknown paths are JSON 404s', async () => {
    const response = await apiOnly.inject({ method: 'GET', url: '/device' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('only serves library routes under /api', async () => {
    expect((await apiOnly.inject({ method: 'GET', url: '/commands' })).statusCode).toBe(404);
    expect((await apiOnly.inject({ method: 'GET', url: '/api/commands' })).statusCode).toBe(401);
  });
});
