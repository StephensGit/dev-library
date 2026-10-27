import { setTimeout as delay } from 'node:timers/promises';
import { ApiUnreachableError, apiRequest, readJson } from './api.js';
import { CliError } from './errors.js';

// Must match CLI_CLIENT_ID in apps/api/src/auth.ts.
export const CLIENT_ID = 'devlib-cli';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// RFC 8628: wait 5 seconds by default, and 5 more each time the server says slow_down.
const DEFAULT_INTERVAL_SECONDS = 5;
const SLOW_DOWN_SECONDS = 5;

// A dropped connection while waiting is retried; this many in a row gives up.
const MAX_CONSECUTIVE_NETWORK_ERRORS = 3;

export type DeviceCode = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
};

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };

export type DeviceLoginOptions = {
  apiUrl: string;
  // Called once with the code to show the user and the page to approve it on.
  onCode: (code: DeviceCode) => void | Promise<void>;
  signal?: AbortSignal;
  // Overridable for tests.
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

export class LoginCancelledError extends CliError {
  constructor() {
    super('Login cancelled.', 130);
    this.name = 'LoginCancelledError';
  }
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return delay(ms, undefined, { signal });
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
}

// Shows a code the way the web page does: ABCD-EFGH.
export function formatUserCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// Runs the device authorization flow (RFC 8628) and returns the Better Auth session token issued
// once the user approves in the browser. The device code itself never leaves this function.
export async function deviceLogin(options: DeviceLoginOptions): Promise<string> {
  const { apiUrl, signal } = options;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  try {
    const codeResponse = await apiRequest(apiUrl, '/api/auth/device/code', {
      method: 'POST',
      body: { client_id: CLIENT_ID },
      signal,
    });

    if (codeResponse.status === 429) {
      throw new CliError('Too many login attempts. Wait a few minutes and try again.');
    }

    const code = await readJson<DeviceCodeResponse>(apiUrl, codeResponse);

    if (
      !codeResponse.ok ||
      !code.device_code ||
      !code.user_code ||
      !isHttpUrl(code.verification_uri) ||
      !isHttpUrl(code.verification_uri_complete) ||
      typeof code.expires_in !== 'number'
    ) {
      throw new CliError(`The API at ${apiUrl} couldn't start a login (status ${codeResponse.status}).`);
    }

    const deadline = now() + code.expires_in * 1000;
    let interval = Math.max(code.interval ?? DEFAULT_INTERVAL_SECONDS, 1);
    let networkErrors = 0;

    await options.onCode({
      userCode: code.user_code,
      verificationUri: code.verification_uri,
      verificationUriComplete: code.verification_uri_complete,
      expiresIn: code.expires_in,
    });

    for (;;) {
      await sleep(interval * 1000, signal);

      if (now() >= deadline) {
        throw new CliError('The login code expired before it was approved. Run devlib login to try again.');
      }

      let response: Response;
      try {
        response = await apiRequest(apiUrl, '/api/auth/device/token', {
          method: 'POST',
          body: { grant_type: DEVICE_GRANT, device_code: code.device_code, client_id: CLIENT_ID },
          signal,
        });
        networkErrors = 0;
      } catch (error) {
        if (error instanceof ApiUnreachableError && ++networkErrors < MAX_CONSECUTIVE_NETWORK_ERRORS) {
          continue;
        }
        throw error;
      }

      const body = await readJson<TokenResponse>(apiUrl, response);

      if (response.ok && body.access_token) {
        return body.access_token;
      }

      switch (body.error) {
        case 'authorization_pending':
          continue;
        case 'slow_down':
          interval += SLOW_DOWN_SECONDS;
          continue;
        case 'access_denied':
          throw new CliError('Login was denied in the browser.');
        case 'expired_token':
          throw new CliError('The login code expired before it was approved. Run devlib login to try again.');
        default:
          if (response.status === 429) {
            interval += SLOW_DOWN_SECONDS;
            continue;
          }
          throw new CliError(
            `Login failed (${body.error ?? `status ${response.status}`}). Run devlib login to try again.`,
          );
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new LoginCancelledError();
    }
    throw error;
  }
}
