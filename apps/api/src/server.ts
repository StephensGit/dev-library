import { commandTags, commands, db, tags } from '@dev-library/db';
import { asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

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
const commandBodySchema = {
  type: 'object',
  required: ['title', 'command'],
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

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

// Fastify turns errors with a statusCode into a matching JSON response.
function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

// Load commands with their tags, sorted alphabetically by title.
async function findCommands(where?: SQL) {
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
    .where(where)
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

async function findCommand(id: number) {
  const [command] = await findCommands(eq(commands.id, id));
  return command;
}

// Reject tag ids that don't exist, rather than failing on the foreign key.
async function assertTagsExist(tx: Transaction, tagIds: number[]) {
  if (tagIds.length === 0) {
    return;
  }

  const existing = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));

  if (existing.length !== tagIds.length) {
    const existingIds = new Set(existing.map((tag) => tag.id));
    const missing = tagIds.filter((tagId) => !existingIds.has(tagId));
    throw httpError(400, `Unknown tag ids: ${missing.join(', ')}`);
  }
}

fastify.get('/', async () => {
  return {
    message: 'Dev Library API is running',
  };
});

fastify.get<{
  Querystring: {
    search?: string;
  };
}>('/commands', async (request) => {
  const search = request.query.search;
  const result = await findCommands();

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
    const { title, command, description, tagIds = [] } = request.body;

    const id = await db.transaction(async (tx) => {
      await assertTagsExist(tx, tagIds);

      const [createdCommand] = await tx
        .insert(commands)
        .values({
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

    return reply.code(201).send(await findCommand(id));
  },
);

// Replaces the whole command: omitted description or tagIds are cleared.
fastify.put<{ Params: IdParams; Body: CommandBody }>(
  '/commands/:id',
  {
    schema: {
      params: idParamsSchema,
      body: commandBodySchema,
    },
  },
  async (request) => {
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
        .where(eq(commands.id, id))
        .returning();

      if (!updatedCommand) {
        throw httpError(404, `Command ${id} not found`);
      }

      await assertTagsExist(tx, tagIds);

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

    return findCommand(id);
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

    await db.transaction(async (tx) => {
      // Remove tag links first; the foreign key doesn't cascade.
      await tx.delete(commandTags).where(eq(commandTags.commandId, id));

      const [deletedCommand] = await tx.delete(commands).where(eq(commands.id, id)).returning();

      if (!deletedCommand) {
        throw httpError(404, `Command ${id} not found`);
      }
    });

    return reply.code(204).send();
  },
);

fastify.get('/tags', async () => {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .orderBy(asc(sql`lower(${tags.name})`));
});

fastify.post<{ Body: { name: string } }>(
  '/tags',
  {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50, pattern: '\\S' },
        },
      },
    },
  },
  async (request, reply) => {
    const name = request.body.name.trim();

    // The unique constraint is case-sensitive, so check "Docker" vs "docker" here.
    const [existingTag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(sql`lower(${tags.name})`, name.toLowerCase()));

    if (existingTag) {
      throw httpError(409, `Tag "${name}" already exists`);
    }

    const [createdTag] = await db.insert(tags).values({ name }).returning({ id: tags.id, name: tags.name });

    return reply.code(201).send(createdTag);
  },
);

const start = async () => {
  try {
    await fastify.listen({
      port: 3000,
    });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
