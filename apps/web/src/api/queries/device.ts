import { useQuery } from '@tanstack/react-query';
import { authClient } from '../auth';

export type DeviceRequestStatus = 'pending' | 'approved' | 'denied';

// Looks up a CLI login code. The first signed-in user to open a code becomes the only one who can
// approve or deny it. The API allows only a few lookups per IP, so never refetch in the background.
export function useDeviceRequest(userCode: string) {
  return useQuery({
    queryKey: ['device', userCode],
    enabled: userCode !== '',
    queryFn: async () => {
      const { data, error } = await authClient.device({ query: { user_code: userCode } });

      if (error) {
        throw new Error(deviceErrorMessage(error));
      }

      return { status: data.status as DeviceRequestStatus };
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

type DeviceError = { status: number; message?: string; error?: string; error_description?: string };

// Device endpoints use OAuth-style errors ({ error, error_description }) rather than Better Auth's usual message.
export function deviceErrorMessage(error: DeviceError) {
  if (error.status === 429) {
    return 'Too many attempts. Wait a few minutes, then run devlib login again.';
  }

  switch (error.error) {
    case 'expired_token':
      return 'This code has expired. Run devlib login again to get a new one.';
    case 'invalid_request':
      return error.error_description === 'Invalid user code'
        ? "That code doesn't match a login request. Check it against your terminal."
        : 'This code has already been used. Run devlib login again if you still need to log in.';
    case 'access_denied':
      return 'This login request belongs to another account.';
    default:
      return error.error_description ?? error.message ?? 'Something went wrong. Run devlib login again.';
  }
}
