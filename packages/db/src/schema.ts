import { sql } from 'drizzle-orm';
import { index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth-schema.js';

// Every command and tag belongs to one user (src/assign-owner.ts backfilled rows created before accounts).
// Deleting a user deletes their commands and tags.

export const commands = pgTable(
  'commands',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    command: text('command').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('commands_user_id_idx').on(table.userId)],
);

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  // Each user's tag names are unique, ignoring case ("Docker" and "docker" clash).
  (table) => [uniqueIndex('tags_user_id_name_unique').on(table.userId, sql`lower(${table.name})`)],
);

export const commandTags = pgTable(
  'command_tags',
  {
    commandId: integer('command_id')
      .notNull()
      .references(() => commands.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.commandId, table.tagId],
    }),
  ],
);
