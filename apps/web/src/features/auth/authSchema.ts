import { z } from 'zod';

const email = z.string().trim().pipe(z.email('Enter a valid email address'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

// Password limits mirror the Better Auth config in apps/api/src/auth.ts.
export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email,
  password: z.string().min(12, 'Use at least 12 characters').max(128, 'Use 128 characters or fewer'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
