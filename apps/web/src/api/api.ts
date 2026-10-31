import { queryClient } from './queryClient';

export type Tag = {
  id: number;
  name: string;
};

export type Command = {
  id: number;
  title: string;
  command: string;
  description: string | null;
  tags: Tag[];
};

export type CommandPayload = {
  title: string;
  command: string;
  description?: string;
  tagIds: number[];
};

// Same origin as the web app: the Vite dev proxy in development (see vite.config.ts), Fastify in production.
const API_URL = '/api';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });

  if (!response.ok) {
    // The session has ended (expired or logged out elsewhere), so re-check it to show the login screen.
    if (response.status === 401) {
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    }

    // Fastify errors look like { statusCode, error, message }.
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
