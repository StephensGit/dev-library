import { useMutation, useQueryClient } from '@tanstack/react-query'
import { request, type Command, type CommandPayload } from '../api'

// After a write, invalidate the list so it refetches and matches the database.

export function useCreateCommand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CommandPayload) =>
      request<Command>('/commands', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commands'] }),
  })
}

export function useUpdateCommand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CommandPayload }) =>
      request<Command>(`/commands/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commands'] }),
  })
}

export function useDeleteCommand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => request<void>(`/commands/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commands'] }),
  })
}
