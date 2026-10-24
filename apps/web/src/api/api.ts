export type Tag = {
  id: number
  name: string
}

export type Command = {
  id: number
  title: string
  command: string
  description: string | null
  tags: Tag[]
}

export type CommandPayload = {
  title: string
  command: string
  description?: string
  tagIds: number[]
}

// Requests go through the Vite dev proxy (see vite.config.ts).
const API_URL = '/api'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })

  if (!response.ok) {
    // Fastify errors look like { statusCode, error, message }.
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}
