import { createAuthClient } from 'better-auth/client';

// No baseURL: the client calls /api/auth on this origin, which the Vite proxy forwards to the API.
export const authClient = createAuthClient();

export type User = typeof authClient.$Infer.Session.user;
