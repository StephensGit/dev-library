import { CliError } from './errors.js';

// A sleeping server (e.g. Render's free plan) can take about a minute to wake, and its proxy holds the
// request meanwhile, so waiting longer is enough: nothing is retried, which matters for POSTs.
export const REQUEST_TIMEOUT_MS = 90_000;
// After this long, say why devlib is still waiting.
export const SLOW_NOTICE_MS = 5_000;

export class ApiUnreachableError extends CliError {
  constructor(apiUrl: string, message?: string) {
    super(
      message ??
        `Could not connect to the Dev Library API at ${apiUrl}.\nCheck your internet connection, or set DEVLIB_API_URL if you use a different API.`,
    );
    this.name = 'ApiUnreachableError';
  }
}

// The connection was made (or still pending) but no response came in time.
export class ApiTimeoutError extends ApiUnreachableError {
  constructor(apiUrl: string, timeoutMs: number) {
    super(
      apiUrl,
      `The Dev Library API at ${apiUrl} didn't respond within ${Math.round(timeoutMs / 1000)} seconds.\n` +
        'The server may be starting up or overloaded. Try again in a minute.',
    );
    this.name = 'ApiTimeoutError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  sessionToken?: string;
  body?: object;
  signal?: AbortSignal;
  // Overridable for tests.
  timeoutMs?: number;
  slowNoticeMs?: number;
  onSlow?: () => void;
};

let slowNoticeShown = false;

// Printed once per run, to stderr so it never mixes with command output.
function showSlowNotice() {
  if (!slowNoticeShown) {
    slowNoticeShown = true;
    console.error('Waiting for the Dev Library server. It may be waking up, which can take up to a minute…');
  }
}

// Calls the API at apiUrl (from parseApiUrl). The session token goes only in the Authorization header,
// and redirects are never followed, so it can't be forwarded to another server or downgraded to http.
export async function apiRequest(apiUrl: string, path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = { accept: 'application/json' };

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  if (options.sessionToken) {
    headers.authorization = `Bearer ${options.sessionToken}`;
  }

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const slowTimer = setTimeout(options.onSlow ?? showSlowNotice, options.slowNoticeMs ?? SLOW_NOTICE_MS);
  let response: Response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (error) {
    // Ctrl-C during `devlib login`: let the caller report the cancellation.
    if (options.signal?.aborted) {
      throw error;
    }
    throw timeout.aborted ? new ApiTimeoutError(apiUrl, timeoutMs) : new ApiUnreachableError(apiUrl);
  } finally {
    clearTimeout(slowTimer);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new CliError(
      `The API at ${apiUrl} answered with a redirect, which devlib doesn't follow so your login can't be sent elsewhere.\n` +
        'Check DEVLIB_API_URL (for example https:// instead of http://, or a missing path).',
    );
  }

  return response;
}

// Reads a JSON body, treating a malformed one as a server problem rather than crashing.
export async function readJson<T>(apiUrl: string, response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new CliError(`The API at ${apiUrl} sent an unexpected response (status ${response.status}).`);
  }
}
