import { z } from 'zod'

// Mirrors the Fastify body schema for POST/PUT /commands.
export const commandSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  command: z.string().trim().min(1, 'Command is required'),
  description: z.string().trim(),
  tagIds: z.array(z.number().int()),
})

export type CommandFormValues = z.infer<typeof commandSchema>
