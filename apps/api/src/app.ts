import { commandTags, commands, db, tags } from '@dev-library/db';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { auth } from './auth.js';
import { config } from './config.js';
import { currentUserId, requireAuth, verifyOrigin } from './hooks.js';
import { httpError } from './http-error.js';

// Requests bigger than this get 413. Commands are short text, so this is generous.
export const BODY_LIMIT = 100 * 1024;

// Per client IP, across all command and tag routes. Kept in memory: fine for a single API server.
export const LIBRARY_RATE_LIMIT = { max: 120, timeWindow: '1 minute' };

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

// Better Auth handles sign-up, sign-in, sign-out and sessions itself.
// Fastify has already parsed the body, so rebuild a Fetch API Request for it.
function authRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
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
          if (key !== 'set-cookie') {
            reply.header(key, value);
          }
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
}

export function buildApp(options: FastifyServerOptions = {}) {
  const fastify = Fastify({
    // Decides request.ip: which proxies may report the client's address (see config.ts).
    trustProxy: config.trustProxy,
    bodyLimit: BODY_LIMIT,
    ...options,
  });

  // Security headers such as X-Content-Type-Options, X-Frame-Options and Strict-Transport-Security.
  fastify.register(helmet);

  fastify.decorateRequest('user', null);

  authRoutes(fastify);

  fastify.get('/', async () => {
    return {
      message: 'Dev Library API is running',
    };
  });

  fastify.register(libraryRoutes);

  return fastify;
}
