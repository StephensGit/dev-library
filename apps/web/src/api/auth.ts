import { createAuthClient } from 'better-auth/client';
import { deviceAuthorizationClient } from 'better-auth/client/plugins';

// No baseURL: the client calls /api/auth on this origin, which the Vite proxy forwards to the API.
export const authClient = createAuthClient({
  // Adds authClient.device(), .device.approve() and .device.deny() for the CLI login page.
  plugins: [deviceAuthorizationClient()],
});

export type User = typeof authClient.$Infer.Session.user;
