import { db, pool } from './index';
import { commandTags, commands, tags } from './schema';

async function seed() {
  // Clear existing development data.
  await db.delete(commandTags);
  await db.delete(commands);
  await db.delete(tags);

  // Insert starter commands and get the created rows back.
  const insertedCommands = await db
    .insert(commands)
    .values([
      {
        title: 'List running Docker containers',
        command: 'docker ps',
        description: 'Shows all currently running Docker containers.',
      },
      {
        title: 'Open Postgres shell in Docker',
        command: 'docker compose exec db psql -U postgres -d dev_library',
        description: 'Opens a PostgreSQL shell inside the local Docker container.',
      },
      {
        title: 'Show Git status',
        command: 'git status',
        description: 'Shows the current state of the Git working directory.',
      },
      {
        title: 'Install dependencies',
        command: 'pnpm install',
        description: 'Installs dependencies for the project.',
      },
    ])
    .returning();

  // Insert starter tags and get the created rows back.
  const insertedTags = await db
    .insert(tags)
    .values([{ name: 'docker' }, { name: 'postgres' }, { name: 'git' }, { name: 'pnpm' }])
    .returning();

  // Find the records we need for our relationships.
  const dockerCommand = insertedCommands.find((command) => command.title === 'List running Docker containers');

  const postgresCommand = insertedCommands.find((command) => command.title === 'Open Postgres shell in Docker');

  const gitCommand = insertedCommands.find((command) => command.title === 'Show Git status');

  const pnpmCommand = insertedCommands.find((command) => command.title === 'Install dependencies');

  const dockerTag = insertedTags.find((tag) => tag.name === 'docker');
  const postgresTag = insertedTags.find((tag) => tag.name === 'postgres');
  const gitTag = insertedTags.find((tag) => tag.name === 'git');
  const pnpmTag = insertedTags.find((tag) => tag.name === 'pnpm');

  // Make sure all required records were created.
  if (
    !dockerCommand ||
    !postgresCommand ||
    !gitCommand ||
    !pnpmCommand ||
    !dockerTag ||
    !postgresTag ||
    !gitTag ||
    !pnpmTag
  ) {
    throw new Error('Failed to create seed data');
  }

  // Connect commands to their tags.
  await db.insert(commandTags).values([
    {
      commandId: dockerCommand.id,
      tagId: dockerTag.id,
    },
    {
      commandId: postgresCommand.id,
      tagId: dockerTag.id,
    },
    {
      commandId: postgresCommand.id,
      tagId: postgresTag.id,
    },
    {
      commandId: gitCommand.id,
      tagId: gitTag.id,
    },
    {
      commandId: pnpmCommand.id,
      tagId: pnpmTag.id,
    },
  ]);
}

seed()
  .then(() => {
    console.log('Seed complete');
  })
  .catch((error) => {
    console.error('Seed failed:', error);
  })
  .finally(async () => {
    await pool.end();
  });
