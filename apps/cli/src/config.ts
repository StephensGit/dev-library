import { isIP } from 'node:net';
import { CliError } from './errors.js';

// The hosted Dev Library. Set DEVLIB_API_URL to use another API, e.g. http://localhost:3000 in development.
export const DEFAULT_API_URL = 'https://dev-library-gjfn.onrender.com';

// Plain HTTP would send the session token unencrypted, so it's only allowed when the API is on this machine.
function isLoopback(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  if (isIP(host) === 4) {
    return host.startsWith('127.');
  }

  return host === '::1';
}

// Checks DEVLIB_API_URL and returns it without a trailing slash, e.g. https://devlib.example.com
// (a path prefix such as https://example.com/devlib is kept).
export function parseApiUrl(value: string) {
  const url = URL.canParse(value) ? new URL(value) : null;

  if (url?.protocol !== 'http:' && url?.protocol !== 'https:') {
    throw new CliError(
      `DEVLIB_API_URL must be a full http(s) URL, such as https://devlib.example.com (got "${value}").`,
    );
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new CliError('DEVLIB_API_URL must not contain a username, password, query string or #fragment.');
  }

  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new CliError(
      `DEVLIB_API_URL must use https:// for a remote server (got ${url.origin}). Plain http:// is only allowed for localhost.`,
    );
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function apiUrlFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return parseApiUrl(env.DEVLIB_API_URL?.trim() || DEFAULT_API_URL);
}
