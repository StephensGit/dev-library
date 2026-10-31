import { afterEach, describe, expect, it } from 'vitest';
import { ApiUnreachableError, apiRequest } from '../src/api.js';
import { fetchSessionUser, revokeSession } from '../src/session.js';
import { startServer } from './server.js';

const servers: Awaited<ReturnType<typeof startServer>>[] = [];

async function server(...args: Parameters<typeof startServer>) {
  const started = await startServer(...args);
  servers.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((started) => started.close()));
});

describe('sending the session token', () => {
  it('sends it only as a Bearer header, with no cookie', async () => {
    const api = await server(() => ({ json: [] }));

    await apiRequest(api.url, '/api/commands', { sessionToken: 'secret-token' });

    expect(api.requests[0].headers.authorization).toBe('Bearer secret-token');
    expect(api.requests[0].headers.cookie).toBeUndefined();
    expect(api.requests[0].path).toBe('/api/commands');
  });

  it.each([301, 302, 307, 308])('never follows a %i redirect, so the token stays with this API', async (status) => {
    const elsewhere = await server(() => ({ json: [] }));
    const api = await server(() => ({ status, headers: { location: `${elsewhere.url}/api/commands` } }));

    await expect(apiRequest(api.url, '/api/commands', { sessionToken: 'secret-token' })).rejects.toThrow(/redirect/);

    expect(elsewhere.requests).toHaveLength(0);
  });

  it('reports an API that is not running', async () => {
    const api = await server(() => ({ json: [] }));
    await api.close();

    await expect(apiRequest(api.url, '/api/commands')).rejects.toBeInstanceOf(ApiUnreachableError);
  });
});

describe('sessions', () => {
  it('returns only the user from get-session, never the session or its token', async () => {
    const api = await server(() => ({
      json: { session: { token: 'secret-token' }, user: { id: 'u1', name: 'Alice', email: 'alice@example.test' } },
    }));

    expect(await fetchSessionUser(api.url, 'secret-token')).toEqual({ name: 'Alice', email: 'alice@example.test' });
  });

  it('treats a null session as logged out', async () => {
    const api = await server(() => ({ json: null }));

    expect(await fetchSessionUser(api.url, 'expired-token')).toBeNull();
  });

  it('signs out with a POST to the API the token came from', async () => {
    const api = await server(() => ({ json: { success: true } }));

    expect(await revokeSession(api.url, 'secret-token')).toBe(true);
    expect(api.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/auth/sign-out',
      headers: { authorization: 'Bearer secret-token' },
    });
  });
});
