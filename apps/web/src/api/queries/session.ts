import { useQuery } from '@tanstack/react-query';
import { authClient } from '../auth';

// Resolves to null when nobody is logged in.
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await authClient.getSession();

      if (error) {
        throw new Error(error.message ?? 'Could not check your session');
      }

      return data;
    },
  });
}
