import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLogin } from '../../api/mutations/auth';
import { AuthField } from './AuthField';
import { loginSchema, type LoginValues } from './authSchema';

type LoginFormProps = {
  // Left out when registration is closed (or not yet known), which hides the "Create an account" link.
  onRegister?: () => void;
};

export function LoginForm({ onRegister }: LoginFormProps) {
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  return (
    <form className="auth-form" noValidate onSubmit={handleSubmit((values) => login.mutate(values))}>
      <div className="auth-heading">
        <h1>Log in</h1>
        <p>Welcome back to your command library.</p>
      </div>

      <div className="auth-body">
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {login.isError && (
          <p className="field-error auth-error" role="alert">
            {login.error.message}
          </p>
        )}

        <button type="submit" className="button button-primary auth-submit" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </div>

      {onRegister && (
        <p className="auth-switch">
          New to Dev Library?{' '}
          <button type="button" className="link-button" onClick={onRegister}>
            Create an account
          </button>
        </p>
      )}
    </form>
  );
}
