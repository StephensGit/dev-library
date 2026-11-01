import { apiRequest, readJson } from './api.js';
import { apiUrlFromEnv } from './config.js';
import { clearCredentials, loadCredentials, type Credentials } from './credentials.js';
import { CliError } from './errors.js';

export type SessionUser = { name: string; email: string };

export const NOT_LOGGED_IN = "You're not logged in. Run devlib login.";
export const SESSION_ENDED = 'Your login has expired or was revoked. Run devlib login.';

// Better Auth's get-session answers 200 with null when the token isn't a live session.
export async function fetchSessionUser(apiUrl: string, sessionToken: string): Promise<SessionUser | null> {
  const response = await apiRequest(apiUrl, '/api/auth/get-session', { sessionToken });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new CliError(`The Dev Library API at ${apiUrl} returned status ${response.status}.`);
  }

  // The body also holds the session (including its token); only the user's name and email are kept.
  const body = await readJson<{ user?: SessionUser } | null>(apiUrl, response);
  return body?.user ? { name: body.user.name, email: body.user.email } : null;
}

// Ends the session on the server. Returns false if the server already considered it gone.
export async function revokeSession(apiUrl: string, sessionToken: string) {
  const response = await apiRequest(apiUrl, '/api/auth/sign-out', { method: 'POST', sessionToken, body: {} });

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw new CliError(`The Dev Library API at ${apiUrl} returned status ${response.status} while logging out.`);
  }

  return true;
}

// The saved login for the API in use (DEVLIB_API_URL, or the default). A login saved for a different API
// is never sent here.
export async function requireCredentials(env: NodeJS.ProcessEnv = process.env): Promise<Credentials> {
  const apiUrl = apiUrlFromEnv(env);
  const credentials = await loadCredentials(env);

  if (!credentials) {
    throw new CliError(NOT_LOGGED_IN);
  }

  if (credentials.apiUrl !== apiUrl) {
    const usingEnv = Boolean(env.DEVLIB_API_URL?.trim());
    throw new CliError(
      usingEnv
        ? `You're logged in to ${credentials.apiUrl}, but DEVLIB_API_URL is ${apiUrl}.\n` +
            'Run devlib login to log in to this API (or unset DEVLIB_API_URL).'
        : `You're logged in to ${credentials.apiUrl}, but devlib uses ${apiUrl} by default.\n` +
            `Run devlib login to log in to it (or set DEVLIB_API_URL=${credentials.apiUrl}).`,
    );
  }

  return credentials;
}

// For a 401 from the API: the session is gone, so forget it locally too.
export async function sessionEnded(): Promise<never> {
  await clearCredentials();
  throw new CliError(SESSION_ENDED);
}
