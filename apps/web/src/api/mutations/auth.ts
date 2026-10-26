import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../auth';
import type { LoginValues, RegisterValues } from '../../features/auth/authSchema';

// Better Auth returns { data, error } instead of throwing, so throw to let TanStack Query see the failure.
// After logging in, reset every query: no data cached for a previous account survives,
// and the session refetches so the app replaces the login screen.

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: LoginValues) => {
      const { error } = await authClient.signIn.email(values);

      if (error) {
        throw new Error(error.message ?? 'Could not log in');
      }
    },
    onSuccess: () => queryClient.resetQueries(),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: RegisterValues) => {
      // Better Auth logs the new user in straight away.
      const { error } = await authClient.signUp.email(values);

      if (error) {
        throw new Error(error.message ?? 'Could not create your account');
      }
    },
    onSuccess: () => queryClient.resetQueries(),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.message ?? 'Could not log out');
      }
    },
    onSuccess: () => {
      // Show the login screen straight away, then drop everything cached for this account.
      queryClient.setQueryData(['session'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
}
