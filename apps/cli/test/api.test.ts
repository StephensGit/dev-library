import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiTimeoutError, ApiUnreachableError, REQUEST_TIMEOUT_MS, apiRequest } from '../src/api.js';
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

describe('slow and sleeping servers', () => {
  it('waits long enough for a sleeping server to wake, but not forever', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });

  it('gives up with a timeout error when the API never answers', async () => {
    const api = await server(async () => {
      await delay(500);
      return { json: [] };
    });

    const error = await apiRequest(api.url, '/api/commands', { timeoutMs: 100, onSlow: () => {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).toBeInstanceOf(ApiUnreachableError);
    expect(error.message).toMatch(/didn't respond within 0 seconds/);
    expect(error.message).toMatch(/starting up/);
  });

  it('reports a refused connection as unreachable, not as a timeout', async () => {
    const api = await server(() => ({ json: [] }));
    await api.close();

    const error = await apiRequest(api.url, '/api/commands').catch((e) => e);

    expect(error).toBeInstanceOf(ApiUnreachableError);
    expect(error).not.toBeInstanceOf(ApiTimeoutError);
    expect(error.message).toMatch(/Could not connect/);
  });

  it('says why it is waiting when the API is slow, then succeeds without retrying', async () => {
    const api = await server(async () => {
      await delay(200);
      return { json: [] };
    });
    const onSlow = vi.fn();

    const response = await apiRequest(api.url, '/api/auth/sign-out', {
      method: 'POST',
      body: {},
      slowNoticeMs: 20,
      onSlow,
    });

    expect(response.status).toBe(200);
    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(api.requests).toHaveLength(1);
  });

  it('stays quiet when the API answers quickly', async () => {
    const api = await server(() => ({ json: [] }));
    const onSlow = vi.fn();

    await apiRequest(api.url, '/api/commands', { slowNoticeMs: 1_000, onSlow });
    await delay(1_100);

    expect(onSlow).not.toHaveBeenCalled();
  });

  it('stops waiting at once when the caller cancels', async () => {
    const api = await server(async () => {
      await delay(500);
      return { json: [] };
    });
    const cancel = new AbortController();
    setTimeout(() => cancel.abort(), 50);

    const error = await apiRequest(api.url, '/api/commands', { signal: cancel.signal, onSlow: () => {} }).catch(
      (e) => e,
    );

    expect(error).not.toBeInstanceOf(ApiUnreachableError);
    expect(cancel.signal.aborted).toBe(true);
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
