import { count, eq } from 'drizzle-orm';
import { db, pool, users } from './index.js';
import { commandTags, commands, tags } from './schema.js';

// Adds starter commands and tags to one user's empty library.
// Usage: pnpm db:seed you@example.com
// It never deletes anything and does nothing if that user already has commands or tags,
// so other users' data, and this user's own, is never touched.

const starterTags = ['docker', 'postgres', 'git', 'pnpm'];

const starterCommands = [
  {
    title: 'List running Docker containers',
    command: 'docker ps',
    description: 'Shows all currently running Docker containers.',
    tags: ['docker'],
  },
  {
    title: 'Open Postgres shell in Docker',
    command: 'docker compose exec db psql -U postgres -d dev_library',
    description: 'Opens a PostgreSQL shell inside the local Docker container.',
    tags: ['docker', 'postgres'],
  },
  {
    title: 'Show Git status',
    command: 'git status',
    description: 'Shows the current state of the Git working directory.',
    tags: ['git'],
  },
  {
    title: 'Install dependencies',
    command: 'pnpm install',
    description: 'Installs dependencies for the project.',
    tags: ['pnpm'],
  },
];

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: pnpm db:seed <email>');
  process.exit(1);
}

try {
  const message = await db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));

    if (!user) {
      throw new Error(`No user with email ${email}. Register in the web app first.`);
    }

    const [{ value: commandCount }] = await tx
      .select({ value: count() })
      .from(commands)
      .where(eq(commands.userId, user.id));
    const [{ value: tagCount }] = await tx.select({ value: count() }).from(tags).where(eq(tags.userId, user.id));

    if (commandCount > 0 || tagCount > 0) {
      return `${email} already has ${commandCount} commands and ${tagCount} tags, so nothing was added.`;
    }

    const insertedTags = await tx
      .insert(tags)
      .values(starterTags.map((name) => ({ userId: user.id, name })))
      .returning();
    const tagIds = new Map(insertedTags.map((tag) => [tag.name, tag.id]));

    for (const { tags: tagNames, ...starter } of starterCommands) {
      const [command] = await tx
        .insert(commands)
        .values({ userId: user.id, ...starter })
        .returning();

      await tx
        .insert(commandTags)
        .values(tagNames.map((name) => ({ commandId: command.id, tagId: tagIds.get(name)! })));
    }

    return `Added ${starterCommands.length} commands and ${starterTags.length} tags for ${email}.`;
  });

  console.log(message);
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
