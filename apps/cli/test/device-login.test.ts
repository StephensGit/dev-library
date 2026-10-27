import { afterEach, describe, expect, it } from 'vitest';
import { CLIENT_ID, LoginCancelledError, deviceLogin, formatUserCode, type DeviceCode } from '../src/device-login.js';
import { startServer } from './server.js';

type TokenReply = { status?: number; json: object };

const CODE_RESPONSE = {
  device_code: 'secret-device-code',
  user_code: 'ABCDEFGH',
  verification_uri: 'http://localhost:5173/device',
  verification_uri_complete: 'http://localhost:5173/device?user_code=ABCDEFGH',
  expires_in: 600,
  interval: 5,
};

const pending = { status: 400, json: { error: 'authorization_pending' } };
const approved = { json: { access_token: 'new-session-token', token_type: 'Bearer' } };

let stop: (() => Promise<void>) | undefined;

afterEach(async () => {
  await stop?.();
  stop = undefined;
});

// A fake API that hands out one device code, then answers each poll with the next reply in the list.
async function fakeApi(replies: TokenReply[], codeResponse: object = CODE_RESPONSE) {
  const queue = [...replies];
  const api = await startServer((request) => {
    if (request.path === '/api/auth/device/code') {
      return { json: codeResponse };
    }
    const reply = queue.shift() ?? pending;
    return { status: reply.status ?? 200, json: reply.json };
  });
  stop = api.close;
  return api;
}

// Runs a login with a fake clock: sleeping just moves time forward.
function login(apiUrl: string, options: { signal?: AbortSignal } = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const codes: DeviceCode[] = [];

  const result = deviceLogin({
    apiUrl,
    signal: options.signal,
    onCode: (code) => {
      codes.push(code);
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });

  return { result, sleeps, codes };
}

describe('device login', () => {
  it('returns the session token once the user approves', async () => {
    const api = await fakeApi([pending, pending, approved]);
    const { result, codes, sleeps } = login(api.url);

    expect(await result).toBe('new-session-token');
    expect(codes).toEqual([
      {
        userCode: 'ABCDEFGH',
        verificationUri: 'http://localhost:5173/device',
        verificationUriComplete: 'http://localhost:5173/device?user_code=ABCDEFGH',
        expiresIn: 600,
      },
    ]);
    expect(sleeps).toEqual([5000, 5000, 5000]);
  });

  it('identifies itself as the Dev Library CLI and sends the device code only to the token endpoint', async () => {
    const api = await fakeApi([approved]);
    await login(api.url).result;

    expect(api.requests[0]).toMatchObject({ path: '/api/auth/device/code', body: { client_id: CLIENT_ID } });
    expect(api.requests[1]).toMatchObject({
      path: '/api/auth/device/token',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'secret-device-code',
        client_id: CLIENT_ID,
      },
    });
    expect(api.requests.every((request) => request.headers.authorization === undefined)).toBe(true);
  });

  it('waits 5 seconds longer each time the server says slow_down', async () => {
    const api = await fakeApi([{ status: 400, json: { error: 'slow_down' } }, pending, approved]);
    const { result, sleeps } = login(api.url);

    await result;
    expect(sleeps).toEqual([5000, 10000, 10000]);
  });

  it('stops when the user denies access', async () => {
    const api = await fakeApi([pending, { status: 400, json: { error: 'access_denied' } }]);

    await expect(login(api.url).result).rejects.toThrow('Login was denied in the browser.');
  });

  it('stops when the server says the code expired', async () => {
    const api = await fakeApi([{ status: 400, json: { error: 'expired_token' } }]);

    await expect(login(api.url).result).rejects.toThrow(/expired/);
  });

  it('gives up by itself once the code would have expired', async () => {
    const api = await fakeApi([], { ...CODE_RESPONSE, expires_in: 30 });
    const { result } = login(api.url);

    await expect(result).rejects.toThrow(/expired/);
    // Polls at 5, 10, 15, 20 and 25 seconds, then stops at 30 without polling again.
    expect(api.requests.filter((request) => request.path === '/api/auth/device/token')).toHaveLength(5);
  });

  it('reports cancellation (Ctrl-C) with exit code 130', async () => {
    const api = await fakeApi([]);
    const cancel = new AbortController();
    const { result } = login(api.url, { signal: cancel.signal });
    cancel.abort();

    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LoginCancelledError);
    expect((error as LoginCancelledError).exitCode).toBe(130);
  });

  it('refuses a verification link that is not http(s)', async () => {
    const api = await fakeApi([approved], { ...CODE_RESPONSE, verification_uri_complete: 'file:///etc/passwd' });

    await expect(login(api.url).result).rejects.toThrow(/couldn't start a login/);
  });

  it('explains when the API rate-limits new logins', async () => {
    const api = await startServer(() => ({ status: 429, json: { message: 'Too many requests' } }));
    stop = api.close;

    await expect(login(api.url).result).rejects.toThrow(/Too many login attempts/);
  });

  it('formats codes the way the web page shows them', () => {
    expect(formatUserCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});
