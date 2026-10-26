import { count, eq, isNull } from 'drizzle-orm';
import { commands, db, pool, tags, users } from './index.js';

// Gives every command and tag that has no owner to one existing user.
// Usage: pnpm db:assign-owner you@example.com
// Safe to run more than once: rows that already have an owner are left alone.

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: pnpm db:assign-owner <email>');
  process.exit(1);
}

try {
  // One transaction: if any check fails, no row is changed.
  const result = await db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));

    if (!owner) {
      throw new Error(`No user with email ${email}. Register in the web app first.`);
    }

    const assignedCommands = await tx
      .update(commands)
      .set({ userId: owner.id })
      .where(isNull(commands.userId))
      .returning({ id: commands.id });

    const assignedTags = await tx
      .update(tags)
      .set({ userId: owner.id })
      .where(isNull(tags.userId))
      .returning({ id: tags.id });

    const [{ value: commandsLeft }] = await tx.select({ value: count() }).from(commands).where(isNull(commands.userId));
    const [{ value: tagsLeft }] = await tx.select({ value: count() }).from(tags).where(isNull(tags.userId));

    if (commandsLeft > 0 || tagsLeft > 0) {
      throw new Error(`${commandsLeft} commands and ${tagsLeft} tags still have no owner.`);
    }

    return { commands: assignedCommands.length, tags: assignedTags.length };
  });

  console.log(`Assigned ${result.commands} commands and ${result.tags} tags to ${email}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
