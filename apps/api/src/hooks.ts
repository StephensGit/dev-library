import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { auth, type User } from './auth.js';
import { config } from './config.js';
import { httpError } from './http-error.js';

// 'cookie' is the web app; 'bearer' is the CLI, sending its session token in the Authorization header.
export type AuthMethod = 'cookie' | 'bearer';

declare module 'fastify' {
  interface FastifyRequest {
    // Set by requireAuth; null on routes that don't use it.
    user: User | null;
    authMethod: AuthMethod | null;
  }
}

// Which credential a request carries. Both at once is refused rather than guessed at, so a browser
// request (which always carries its cookie) can never be treated as a Bearer request.
export function credentialType(headers: FastifyRequest['headers']): AuthMethod | 'both' | null {
  const hasCookie = headers.cookie !== undefined;
  const hasAuthorization = headers.authorization !== undefined;

  if (hasCookie && hasAuthorization) {
    return 'both';
  }

  if (hasAuthorization) {
    return 'bearer';
  }

  return hasCookie ? 'cookie' : null;
}

// Looks up the session (via Better Auth) from the cookie or the Bearer token, and rejects the request
// without a valid one. The user always comes from the session, never from the request body or URL.
export async function requireAuth(request: FastifyRequest) {
  const method = credentialType(request.headers);

  if (method === 'both') {
    throw httpError(400, 'Send either a session cookie or a Bearer token, not both');
  }

  if (method === 'bearer' && !/^Bearer \S+$/i.test(request.headers.authorization ?? '')) {
    throw httpError(401, 'You need to log in');
  }

  const session = method ? await auth.api.getSession({ headers: fromNodeHeaders(request.headers) }) : null;

  if (!session) {
    throw httpError(401, 'You need to log in');
  }

  request.user = session.user;
  request.authMethod = method;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF protection: browsers always send Origin on POST, PUT and DELETE, and another site can't fake it.
// A missing Origin is rejected too, so only our own web app can change data.
// Runs after requireAuth. A request authenticated by a Bearer token skips the check: CSRF relies on the
// browser attaching cookies by itself, and another site can't make a browser send an Authorization header
// (that needs a CORS preflight, which this API never allows). Requests with a cookie are always checked.
export async function verifyOrigin(request: FastifyRequest) {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  if (request.authMethod === 'bearer' && request.user) {
    return;
  }

  const origin = request.headers.origin;

  if (origin !== config.trustedOrigin) {
    throw httpError(403, 'Invalid origin');
  }
}

// The authenticated user's id, for routes behind requireAuth.
export function currentUserId(request: FastifyRequest) {
  if (!request.user) {
    throw httpError(401, 'You need to log in');
  }

  return request.user.id;
}
