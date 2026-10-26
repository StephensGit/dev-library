import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

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
          <LoginForm onRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onLogin={() => setMode('login')} />
        )}
      </main>
    </div>
  );
}
