import { CliError } from './errors.js';

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiUnreachableError extends CliError {
  constructor(apiUrl: string) {
    super(
      `Could not connect to the Dev Library API at ${apiUrl}.\nMake sure the API is running, or set DEVLIB_API_URL.`,
    );
    this.name = 'ApiUnreachableError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  sessionToken?: string;
  body?: object;
  signal?: AbortSignal;
};

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

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
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
    throw new ApiUnreachableError(apiUrl);
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
