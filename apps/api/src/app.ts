import { commandTags, commands, db, pool, tags } from '@dev-library/db';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fromNodeHeaders } from 'better-auth/node';
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import { extname, relative, sep } from 'node:path';
import { auth } from './auth.js';
import { config } from './config.js';
import { credentialType, currentUserId, requireAuth, verifyOrigin } from './hooks.js';
import { httpError } from './http-error.js';

// Requests bigger than this get 413. Commands are short text, so this is generous.
export const BODY_LIMIT = 100 * 1024;

// Per client IP, across all command and tag routes. Kept in memory: fine for a single API server.
export const LIBRARY_RATE_LIMIT = { max: 120, timeWindow: '1 minute' };

// /api/health reports the database as unavailable if it doesn't answer within this time.
export const HEALTH_CHECK_TIMEOUT_MS = 3000;

export type AppOptions = FastifyServerOptions & {
  // The built web app (apps/web/dist) to serve from this origin. Left out in development and most tests,
  // where Vite serves the web app and this is an API-only server.
  webRoot?: string;
};

type CommandBody = {
  title: string;
  command: string;
  description?: string;
  tagIds?: number[];
};

type IdParams = {
  id: number;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Shared validation for creating and replacing a command.
// The pattern rejects values that are only whitespace.
// additionalProperties: false makes Fastify strip unknown fields such as userId.
const commandBodySchema = {
  type: 'object',
  required: ['title', 'command'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, pattern: '\\S' },
    command: { type: 'string', minLength: 1, pattern: '\\S' },
    description: { type: 'string' },
    tagIds: {
      type: 'array',
      items: { type: 'integer' },
      uniqueItems: true,
    },
  },
};

const tagBodySchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 50, pattern: '\\S' },
  },
};

// Fastify's validator coerces types, so { "name": 42 } would pass the schema above as "42".
// Coercion is needed elsewhere (URL params arrive as strings), so tag routes reject a non-string name
// before validation runs instead. A missing name is left to the schema's `required`.
async function requireStringTagName(request: FastifyRequest) {
  const body = request.body as { name?: unknown } | null;

  if (body && typeof body === 'object' && 'name' in body && typeof body.name !== 'string') {
    throw httpError(400, 'body/name must be string');
  }
}

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

// Load one user's commands with their tags, sorted alphabetically by title.
async function findCommands(userId: string, where?: SQL) {
  const rows = await db
    .select({
      id: commands.id,
      title: commands.title,
      command: commands.command,
      description: commands.description,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(commands)
    .leftJoin(commandTags, eq(commands.id, commandTags.commandId))
    .leftJoin(tags, eq(commandTags.tagId, tags.id))
    .where(and(eq(commands.userId, userId), where))
    .orderBy(asc(sql`lower(${commands.title})`), asc(commands.id), asc(tags.name));

  const commandMap = new Map();

  for (const row of rows) {
    if (!commandMap.has(row.id)) {
      commandMap.set(row.id, {
        id: row.id,
        title: row.title,
        command: row.command,
        description: row.description,
        tags: [],
      });
    }

    if (row.tagId !== null && row.tagName !== null) {
      commandMap.get(row.id).tags.push({
        id: row.tagId,
        name: row.tagName,
      });
    }
  }

  return Array.from(commandMap.values());
}

async function findCommand(userId: string, id: number) {
  const [command] = await findCommands(userId, eq(commands.id, id));
  return command;
}

// Reject tag ids that don't exist or belong to someone else.
// Both get the same error, so it doesn't reveal which ids other users have.
async function assertOwnTags(tx: Transaction, userId: string, tagIds: number[]) {
  if (tagIds.length === 0) {
    return;
  }

  const existing = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));

  if (existing.length !== tagIds.length) {
    const existingIds = new Set(existing.map((tag) => tag.id));
    const missing = tagIds.filter((tagId) => !existingIds.has(tagId));
    throw httpError(400, `Unknown tag ids: ${missing.join(', ')}`);
  }
}

// Postgres reports a unique constraint failure as code 23505; Drizzle wraps the pg error in `cause`.
function isUniqueViolation(error: unknown) {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return (cause?.code ?? code) === '23505';
}

// The only auth endpoints the CLI calls with its Bearer token: whoami and logout.
// Everything else, including approving a device login, needs the browser's session cookie.
const BEARER_AUTH_PATHS = new Set(['/api/auth/get-session', '/api/auth/sign-out']);

// The bearer plugin copies every new session token into this response header, including the web app's
// on sign-in. JavaScript could read it there, defeating the HttpOnly cookie, so it never leaves the API.
// The CLI gets its token from the /device/token response body instead.
const HIDDEN_AUTH_HEADERS = new Set(['set-auth-token']);

function withoutHiddenHeaders(exposeHeaders: string) {
  return exposeHeaders
    .split(',')
    .map((header) => header.trim())
    .filter((header) => header && !HIDDEN_AUTH_HEADERS.has(header.toLowerCase()))
    .join(', ');
}

// Better Auth handles sign-up, sign-in, sign-out, sessions and device logins itself.
// Fastify has already parsed the body, so rebuild a Fetch API Request for it.
function authRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const method = credentialType(request.headers);

      if (method === 'both') {
        throw httpError(400, 'Send either a session cookie or a Bearer token, not both');
      }

      if (method === 'bearer' && !BEARER_AUTH_PATHS.has(request.url.split('?')[0])) {
        throw httpError(403, 'This endpoint does not accept Bearer tokens');
      }

      try {
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Better Auth rate-limits by the IP in X-Forwarded-For. Replace whatever the client sent with
        // the IP Fastify worked out, which only trusts proxies listed in TRUST_PROXY.
        const headers = fromNodeHeaders(request.headers);
        headers.set('x-forwarded-for', request.ip);

        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers,
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          }),
        );

        reply.status(response.status);

        // A response can set several cookies, so copy each Set-Cookie header separately.
        response.headers.forEach((value, key) => {
          if (key === 'set-cookie' || HIDDEN_AUTH_HEADERS.has(key)) {
            return;
          }

          if (key === 'access-control-expose-headers') {
            const exposed = withoutHiddenHeaders(value);
            if (exposed) {
              reply.header(key, exposed);
            }
            return;
          }

          reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) {
          reply.header('set-cookie', cookies);
        }

        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error(error, 'Authentication error');
        throw httpError(500, 'Internal authentication error');
      }
    },
  });
}

// Command and tag routes. Every request is rate-limited, needs a session and a trusted Origin,
// and every query is limited to the logged-in user's rows.
async function libraryRoutes(fastify: FastifyInstance) {
  // Added as the first hook so floods are stopped before any session lookup hits the database.
  await fastify.register(rateLimit, { global: false });
  fastify.addHook('onRequest', fastify.rateLimit(LIBRARY_RATE_LIMIT));
  fastify.addHook('onRequest', requireAuth);
  fastify.addHook('onRequest', verifyOrigin);

  fastify.get<{
    Querystring: {
      search?: string;
    };
  }>('/commands', async (request) => {
    const search = request.query.search;
    const result = await findCommands(currentUserId(request));

    if (!search) {
      return result;
    }

    const normalizedSearch = search.toLowerCase();

    return result.filter((command) => {
      return (
        command.title.toLowerCase().includes(normalizedSearch) ||
        command.command.toLowerCase().includes(normalizedSearch) ||
        command.description?.toLowerCase().includes(normalizedSearch) ||
        command.tags.some((tag: { name: string }) => tag.name.toLowerCase().includes(normalizedSearch))
      );
    });
  });

  fastify.post<{ Body: CommandBody }>(
    '/commands',
    {
      schema: {
        body: commandBodySchema,
      },
    },
    async (request, reply) => {
      const userId = currentUserId(request);
      const { title, command, description, tagIds = [] } = request.body;

      const id = await db.transaction(async (tx) => {
        await assertOwnTags(tx, userId, tagIds);

        const [createdCommand] = await tx
          .insert(commands)
          .values({
            userId,
            title: title.trim(),
            command: command.trim(),
            description: description?.trim() || null,
          })
          .returning();

        if (tagIds.length > 0) {
          await tx.insert(commandTags).values(
            tagIds.map((tagId) => ({
              commandId: createdCommand.id,
              tagId,
            })),
          );
        }

        return createdCommand.id;
      });

      return reply.code(201).send(await findCommand(userId, id));
    },
  );

  // Replaces the whole command: omitted description or tagIds are cleared.
  // Another user's command gets the same 404 as a missing one.
  fastify.put<{ Params: IdParams; Body: CommandBody }>(
    '/commands/:id',
    {
      schema: {
        params: idParamsSchema,
        body: commandBodySchema,
      },
    },
    async (request) => {
      const userId = currentUserId(request);
      const { id } = request.params;
      const { title, command, description, tagIds = [] } = request.body;

      await db.transaction(async (tx) => {
        const [updatedCommand] = await tx
          .update(commands)
          .set({
            title: title.trim(),
            command: command.trim(),
            description: description?.trim() || null,
            updatedAt: new Date(),
          })
          .where(and(eq(commands.id, id), eq(commands.userId, userId)))
          .returning();

        if (!updatedCommand) {
          throw httpError(404, `Command ${id} not found`);
        }

        await assertOwnTags(tx, userId, tagIds);

        await tx.delete(commandTags).where(eq(commandTags.commandId, id));

        if (tagIds.length > 0) {
          await tx.insert(commandTags).values(
            tagIds.map((tagId) => ({
              commandId: id,
              tagId,
            })),
          );
        }
      });

      return findCommand(userId, id);
    },
  );

  fastify.delete<{ Params: IdParams }>(
    '/commands/:id',
    {
      schema: {
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Tag links are removed by the foreign key's ON DELETE CASCADE.
      const [deletedCommand] = await db
        .delete(commands)
        .where(and(eq(commands.id, id), eq(commands.userId, currentUserId(request))))
        .returning();

      if (!deletedCommand) {
        throw httpError(404, `Command ${id} not found`);
      }

      return reply.code(204).send();
    },
  );

  fastify.get('/tags', async (request) => {
    return db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.userId, currentUserId(request)))
      .orderBy(asc(sql`lower(${tags.name})`));
  });

  fastify.post<{ Body: { name: string } }>(
    '/tags',
    {
      schema: {
        body: tagBodySchema,
      },
      preValidation: requireStringTagName,
    },
    async (request, reply) => {
      const userId = currentUserId(request);
      const name = request.body.name.trim();
      const duplicate = httpError(409, `Tag "${name}" already exists`);

      // Checked here for a clear error; the unique index on (user_id, lower(name)) is the real guarantee.
      const [existingTag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(sql`lower(${tags.name})`, name.toLowerCase())));

      if (existingTag) {
        throw duplicate;
      }

      try {
        const [createdTag] = await db.insert(tags).values({ userId, name }).returning({ id: tags.id, name: tags.name });

        return reply.code(201).send(createdTag);
      } catch (error) {
        // Two identical requests at once can both pass the check above.
        if (isUniqueViolation(error)) {
          throw duplicate;
        }
        throw error;
      }
    },
  );

  // Renames a tag; its command links are untouched. Changing only the capitalisation is allowed.
  // Another user's tag gets the same 404 as a missing one.
  fastify.put<{ Params: IdParams; Body: { name: string } }>(
    '/tags/:id',
    {
      schema: {
        params: idParamsSchema,
        body: tagBodySchema,
      },
      preValidation: requireStringTagName,
    },
    async (request) => {
      const userId = currentUserId(request);
      const { id } = request.params;
      const name = request.body.name.trim();
      const duplicate = httpError(409, `Tag "${name}" already exists`);

      // Same clear-error check as creating, ignoring the tag being renamed.
      const [existingTag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(sql`lower(${tags.name})`, name.toLowerCase()), ne(tags.id, id)));

      if (existingTag) {
        throw duplicate;
      }

      try {
        const [updatedTag] = await db
          .update(tags)
          .set({ name })
          .where(and(eq(tags.id, id), eq(tags.userId, userId)))
          .returning({ id: tags.id, name: tags.name });

        if (!updatedTag) {
          throw httpError(404, `Tag ${id} not found`);
        }

        return updatedTag;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw duplicate;
        }
        throw error;
      }
    },
  );

  fastify.delete<{ Params: IdParams }>(
    '/tags/:id',
    {
      schema: {
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Command links are removed by the foreign key's ON DELETE CASCADE; the commands themselves stay.
      const [deletedTag] = await db
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, currentUserId(request))))
        .returning();

      if (!deletedTag) {
        throw httpError(404, `Tag ${id} not found`);
      }

      return reply.code(204).send();
    },
  );
}

// For the hosting platform and uptime checks. Not rate-limited or authenticated, and it never says
// why the database is unavailable. While the server shuts down, Fastify answers 503 by itself.
function healthRoute(fastify: FastifyInstance) {
  fastify.get('/api/health', async (request, reply) => {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        pool.query('select 1'),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Database health check timed out')), HEALTH_CHECK_TIMEOUT_MS);
        }),
      ]);

      return { status: 'ok' };
    } catch (error) {
      request.log.error(error, 'Health check failed');
      return reply.code(503).send({ status: 'unavailable' });
    } finally {
      clearTimeout(timer);
    }
  });
}

// Built files in the web app's own assets folder have content hashes in their names (assets/index-3f9a.js),
// so they can be cached forever. Everything else, including index.html, must be revalidated so a new deploy
// is picked up. The check uses the path inside webRoot: the server's own folder may contain "assets" too.
function cacheHeaders(webRoot: string) {
  return (reply: FastifyReply, path: string) => {
    const immutable = relative(webRoot, path).split(sep)[0] === 'assets';
    reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  };
}

// Serves the built web app. Unknown page paths such as /device get index.html so the app can show them;
// unknown /api paths and missing files (anything with a file extension) stay JSON 404s.
// Registered on the root instance (not as an encapsulated plugin) so the fallback covers every path.
function webAppRoutes(fastify: FastifyInstance, webRoot: string) {
  // wildcard: false registers a route for each file that exists when the server starts,
  // instead of a catch-all route that could shadow /api.
  fastify.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    cacheControl: false,
    setHeaders: cacheHeaders(webRoot),
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    const path = request.url.split('?')[0];
    const isApi = path === '/api' || path.startsWith('/api/');
    const isPage = (request.method === 'GET' || request.method === 'HEAD') && !isApi && !extname(path);

    if (!isPage) {
      throw httpError(404, `Route ${request.method}:${path} not found`);
    }

    return reply.sendFile('index.html');
  });
}

// Public settings the web app needs before anyone logs in, e.g. whether to offer registration.
// Only add values that are safe for anyone to read. Not cached, so a restart with new settings shows at once.
function publicConfigRoute(fastify: FastifyInstance) {
  fastify.get('/api/config', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return { signupEnabled: config.signupEnabled };
  });
}

export function buildApp({ webRoot, ...options }: AppOptions = {}) {
  const fastify = Fastify({
    // Decides request.ip: which proxies may report the client's address (see config.ts).
    trustProxy: config.trustProxy,
    bodyLimit: BODY_LIMIT,
    ...options,
  });

  // Security headers such as X-Content-Type-Options, X-Frame-Options and Strict-Transport-Security,
  // on every response including the web app's. Locally the app is served over plain http, where
  // upgrade-insecure-requests would make some browsers (Safari) request its scripts over https and fail.
  fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: config.isProduction ? [] : null },
    },
  });

  fastify.decorateRequest('user', null);
  fastify.decorateRequest('authMethod', null);

  authRoutes(fastify);
  healthRoute(fastify);
  publicConfigRoute(fastify);

  // Every command and tag route lives under /api, like the auth routes, so the web app, the CLI and a
  // reverse proxy all use the same paths.
  fastify.register(libraryRoutes, { prefix: '/api' });

  if (webRoot) {
    webAppRoutes(fastify, webRoot);
  }

  return fastify;
}
