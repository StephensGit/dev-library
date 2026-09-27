import { commandTags, commands, db, tags } from "@dev-library/db";
import { eq } from "drizzle-orm";
import Fastify from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/", async () => {
  return {
    message: "Dev Library API is running",
  };
});

fastify.get<{
  Querystring: {
    search?: string;
  };
}>("/commands", async (request) => {
  const search = request.query.search;

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
    .leftJoin(tags, eq(commandTags.tagId, tags.id));

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

  const result = Array.from(commandMap.values());

  if (!search) {
    return result;
  }

  const normalizedSearch = search.toLowerCase();

  return result.filter((command) => {
    return (
      command.title.toLowerCase().includes(normalizedSearch) ||
      command.command.toLowerCase().includes(normalizedSearch) ||
      command.description?.toLowerCase().includes(normalizedSearch) ||
      command.tags.some((tag) =>
        tag.name.toLowerCase().includes(normalizedSearch),
      )
    );
  });
});

fastify.post<{
  Body: {
    title: string;
    command: string;
    description?: string;
    tagIds?: number[];
  };
}>(
  "/commands",
  {
    schema: {
      body: {
        type: "object",
        required: ["title", "command"],
        properties: {
          title: { type: "string", minLength: 1 },
          command: { type: "string", minLength: 1 },
          description: { type: "string" },
          tagIds: {
            type: "array",
            items: { type: "integer" },
          },
        },
      },
    },
  },
  async (request, reply) => {
    const { title, command, description, tagIds = [] } = request.body;

    const newCommand = await db.transaction(async (tx) => {
      const [createdCommand] = await tx
        .insert(commands)
        .values({
          title,
          command,
          description,
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

      return createdCommand;
    });

    return reply.code(201).send(newCommand);
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