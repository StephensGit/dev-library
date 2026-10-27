import { useState, type FormEvent } from 'react';
import type { User } from '../../api/auth';
import { useLogout } from '../../api/mutations/auth';
import { useDeviceDecision } from '../../api/mutations/device';
import { useDeviceRequest } from '../../api/queries/device';
import { AuthField } from './AuthField';

type DeviceApprovalProps = {
  user: User;
};

// Shows a code the way the CLI prints it: ABCD-EFGH.
function formatCode(code: string) {
  const plain = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return plain.length === 8 ? `${plain.slice(0, 4)}-${plain.slice(4)}` : plain;
}

function codeFromUrl() {
  return new URLSearchParams(window.location.search).get('user_code')?.trim() ?? '';
}

// The page `devlib login` opens. The user checks the code against their terminal, then approves or
// denies. Nothing is approved automatically: opening the link only shows the request.
export function DeviceApproval({ user }: DeviceApprovalProps) {
  const [userCode, setUserCode] = useState(codeFromUrl);
  const request = useDeviceRequest(userCode);
  const decision = useDeviceDecision();

  function showCode(code: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('user_code', code);
    window.history.replaceState(null, '', url);
    decision.reset();
    setUserCode(code);
  }

  let content;

  if (!userCode) {
    content = <EnterCode onSubmit={showCode} />;
  } else if (decision.isSuccess) {
    content =
      decision.data === 'approve' ? (
        <Result
          title="CLI access approved"
          description="Return to your terminal. You can close this tab."
          user={user}
        />
      ) : (
        <Result
          title="Request denied"
          description="The CLI was not given access. You can close this tab."
          user={user}
        />
      );
  } else if (request.isPending) {
    content = <Result title="Checking your code…" description="One moment." user={user} busy />;
  } else if (request.isError) {
    content = <CodeError message={request.error.message} onRetry={() => showCode('')} />;
  } else if (request.data.status !== 'pending') {
    content = (
      <Result
        title="Code already used"
        description={`This request was already ${request.data.status}. Run devlib login again if you still need to log in.`}
        user={user}
      />
    );
  } else {
    content = (
      <>
        <div className="auth-heading">
          <h1>Approve CLI login?</h1>
          <p>The Dev Library CLI is asking for access to your commands.</p>
        </div>

        <div className="auth-body">
          <div className="device-code" aria-label={`Code ${formatCode(userCode).split('').join(' ')}`}>
            {formatCode(userCode)}
          </div>

          <p className="device-warning">
            Only approve if you just ran <code>devlib login</code> yourself and this code matches the one in your
            terminal. If you didn't, deny it.
          </p>

          {decision.isError && (
            <p className="field-error auth-error" role="alert">
              {decision.error.message}
            </p>
          )}

          <div className="device-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={decision.isPending}
              onClick={() => decision.mutate({ userCode, decision: 'deny' })}
            >
              Deny
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={decision.isPending}
              onClick={() => decision.mutate({ userCode, decision: 'approve' })}
            >
              {decision.isPending ? 'Saving…' : 'Approve'}
            </button>
          </div>
        </div>

        <SignedInAs user={user} />
      </>
    );
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            &gt;_
          </span>
          Dev Library
        </div>

        {content}
      </main>
    </div>
  );
}

function EnterCode({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();

    if (!trimmed) {
      setError('Enter the code shown in your terminal');
      return;
    }

    onSubmit(trimmed);
  }

  return (
    <form className="auth-form" noValidate onSubmit={submit}>
      <div className="auth-heading">
        <h1>Log in to the CLI</h1>
        <p>
          Enter the code shown after running <code>devlib login</code>.
        </p>
      </div>

      <div className="auth-body">
        <AuthField
          id="device-code"
          label="Code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          placeholder="ABCD-EFGH"
          value={code}
          error={error}
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit" className="button button-primary auth-submit">
          Continue
        </button>
      </div>
    </form>
  );
}

function CodeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <>
      <div className="auth-heading">
        <h1>Can't use this code</h1>
        <p role="alert">{message}</p>
      </div>
      <div className="auth-body">
        <button type="button" className="button button-secondary auth-submit" onClick={onRetry}>
          Enter a different code
        </button>
      </div>
    </>
  );
}

type ResultProps = {
  title: string;
  description: string;
  user: User;
  busy?: boolean;
};

function Result({ title, description, user, busy }: ResultProps) {
  return (
    <>
      <div className="auth-heading device-result" aria-busy={busy} aria-live="polite">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <SignedInAs user={user} />
    </>
  );
}

// Lets someone who is signed in to the wrong account switch before approving.
function SignedInAs({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <p className="auth-switch">
      Signed in as {user.email}.{' '}
      <button type="button" className="link-button" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Not you?
      </button>
    </p>
  );
}
