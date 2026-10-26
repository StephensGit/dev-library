import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { auth, type User } from './auth.js';
import { config } from './config.js';
import { httpError } from './http-error.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Set by requireAuth; null on routes that don't use it.
    user: User | null;
  }
}

// Looks up the session cookie in the database (via Better Auth) and rejects the request without one.
// The user always comes from the session, never from the request body or URL.
export async function requireAuth(request: FastifyRequest) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

  if (!session) {
    throw httpError(401, 'You need to log in');
  }

  request.user = session.user;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF protection: browsers always send Origin on POST, PUT and DELETE, and another site can't fake it.
// A missing Origin is rejected too, so only our own web app can change data.
export async function verifyOrigin(request: FastifyRequest) {
  if (SAFE_METHODS.has(request.method)) {
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
