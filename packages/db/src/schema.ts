import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const commands = pgTable('commands', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  command: text('command').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const commandTags = pgTable(
  'command_tags',
  {
    commandId: integer('command_id')
      .notNull()
      .references(() => commands.id),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({
      columns: [table.commandId, table.tagId],
    }),
  ],
);
