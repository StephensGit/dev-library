import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request, type Tag } from '../api';

// Commands embed their tag names, so renaming or deleting a tag refetches both lists.
function refetchTagsAndCommands(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tags'] }),
    queryClient.invalidateQueries({ queryKey: ['commands'] }),
  ]);
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      request<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useRenameTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: Tag) =>
      request<Tag>(`/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => refetchTagsAndCommands(queryClient),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => refetchTagsAndCommands(queryClient),
  });
}
