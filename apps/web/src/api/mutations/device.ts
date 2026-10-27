import { useMutation } from '@tanstack/react-query';
import { authClient } from '../auth';
import { deviceErrorMessage } from '../queries/device';

// Approve or deny a CLI login. The CLI is polling and picks up the answer within a few seconds.
export function useDeviceDecision() {
  return useMutation({
    mutationFn: async ({ userCode, decision }: { userCode: string; decision: 'approve' | 'deny' }) => {
      const request = decision === 'approve' ? authClient.device.approve : authClient.device.deny;
      const { error } = await request({ userCode });

      if (error) {
        throw new Error(deviceErrorMessage(error));
      }

      return decision;
    },
  });
}
