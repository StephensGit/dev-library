import type { User } from '../../api/auth';
import { useLogout } from '../../api/mutations/auth';

type AccountFooterProps = {
  user: User;
};

export function AccountFooter({ user }: AccountFooterProps) {
  const logout = useLogout();

  return (
    <div className="account">
      <div className="account-info">
        <span className="account-name">{user.name}</span>
        <span className="account-email">{user.email}</span>
        {logout.isError && <span className="field-error account-error">{logout.error.message}</span>}
      </div>
      <button
        type="button"
        className="button button-secondary account-logout"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {logout.isPending ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  );
}
