import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request, type Tag } from '../api';

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
