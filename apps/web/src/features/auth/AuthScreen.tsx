import { useState } from 'react';
import { useServerConfig } from '../../api/queries/config';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

type Mode = 'login' | 'register';

// No router: /register opens straight to registration, like /device in main.tsx.
function initialMode(): Mode {
  return window.location.pathname === '/register' ? 'register' : 'login';
}

// Keeps the address bar in step with the form, so a refresh reopens the same one. Replaced rather than
// pushed, since Back has nothing to go back to without a router. Other pages that show this screen to
// logged-out visitors (/device) keep their URL, so they still open after logging in.
function syncAuthPath(mode: Mode) {
  const path = window.location.pathname;

  if (mode === 'register' && path === '/') {
    window.history.replaceState(null, '', '/register');
  } else if (mode !== 'register' && path === '/register') {
    window.history.replaceState(null, '', '/');
  }
}

export function AuthScreen() {
  const [mode, setModeState] = useState<Mode>(initialMode);
  const config = useServerConfig();
  // Only an explicit "true" from the API counts. While loading, or if the request fails, registration is
  // treated as closed. This only hides the UI: the API itself refuses sign-ups when SIGNUP_ENABLED is off.
  const signupEnabled = config.data?.signupEnabled === true;
  const setMode = (next: Mode) => {
    syncAuthPath(next);
    setModeState(next);
  };
  const showLogin = () => setMode('login');

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            &gt;_
          </span>
          Dev Library
        </div>

        {mode === 'login' ? (
          <LoginForm onRegister={signupEnabled ? () => setMode('register') : undefined} />
        ) : signupEnabled ? (
          // Once registered, the app replaces this screen: leave /register so a refresh after logging out shows login.
          <RegisterForm onLogin={showLogin} onRegistered={() => syncAuthPath('login')} />
        ) : config.isPending ? (
          <div className="auth-body" aria-busy="true" aria-label="Checking whether registration is open" />
        ) : config.isError ? (
          <RegistrationNotice
            title="Couldn't check registration"
            description="Dev Library didn't say whether registration is open. Try again, or log in if you have an account."
            onLogin={showLogin}
            retry={{ onRetry: () => config.refetch(), isRetrying: config.isFetching }}
          />
        ) : (
          <RegistrationNotice
            title="Registration is currently closed"
            description="New accounts can't be created here. If you already have one, log in."
            onLogin={showLogin}
          />
        )}
      </main>
    </div>
  );
}

type RegistrationNoticeProps = {
  title: string;
  description: string;
  onLogin: () => void;
  retry?: { onRetry: () => void; isRetrying: boolean };
};

function RegistrationNotice({ title, description, onLogin, retry }: RegistrationNoticeProps) {
  return (
    <div className="auth-form">
      <div className="auth-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {retry && (
        <div className="auth-body">
          <button
            type="button"
            className="button button-secondary auth-submit"
            disabled={retry.isRetrying}
            onClick={retry.onRetry}
          >
            {retry.isRetrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="link-button" onClick={onLogin}>
          Log in
        </button>
      </p>
    </div>
  );
}
