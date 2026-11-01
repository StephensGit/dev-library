import { useQuery } from '@tanstack/react-query';
import { request } from '../api';

export type ServerConfig = {
  signupEnabled: boolean;
};

// Public server settings (GET /api/config). They only change when the server restarts, so fetch once.
// No automatic retries: until this answers, registration is treated as closed, so a failure should show
// straight away (with a Try again button) rather than after several silent attempts.
export function useServerConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => request<ServerConfig>('/config'),
    staleTime: Infinity,
    retry: false,
  });
}
