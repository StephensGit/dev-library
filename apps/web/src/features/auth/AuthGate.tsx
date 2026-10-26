import type { ReactNode } from 'react';
import type { User } from '../../api/auth';
import { useSession } from '../../api/queries/session';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { AuthScreen } from './AuthScreen';

type AuthGateProps = {
  children: (user: User) => ReactNode;
};

// Shows the login screen until there's a session, then the app for that user.
// This only hides the UI: the API itself must still check every request.
export function AuthGate({ children }: AuthGateProps) {
  const { isPending, error, data: session, isFetching, refetch } = useSession();

  if (isPending) {
    return <div className="auth-page" aria-busy="true" aria-label="Loading" />;
  }

  // Only block the page when there's no answer yet; a failed background refetch keeps the current screen.
  if (error && session === undefined) {
    return (
      <div className="auth-page">
        <StatusMessage
          title="Couldn't reach Dev Library"
          description={`Make sure the Dev Library API is running on port 3000. (${error.message})`}
          action={
            <button type="button" className="button button-secondary" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? 'Retrying…' : 'Try again'}
            </button>
          }
        />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return children(session.user);
}
