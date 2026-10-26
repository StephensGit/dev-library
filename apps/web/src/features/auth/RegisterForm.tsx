import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRegister } from '../../api/mutations/auth';
import { AuthField } from './AuthField';
import { registerSchema, type RegisterValues } from './authSchema';

type RegisterFormProps = {
  onLogin: () => void;
};

export function RegisterForm({ onLogin }: RegisterFormProps) {
  const createAccount = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '' },
  });

  return (
    <form className="auth-form" noValidate onSubmit={handleSubmit((values) => createAccount.mutate(values))}>
      <div className="auth-heading">
        <h1>Create your account</h1>
        <p>Keep your commands in a private library.</p>
      </div>

      <div className="auth-body">
        <AuthField
          id="register-name"
          label="Name"
          autoComplete="name"
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />
        <AuthField
          id="register-email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthField
          id="register-password"
          label="Password"
          hint="At least 12 characters"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {createAccount.isError && (
          <p className="field-error auth-error" role="alert">
            {createAccount.error.message}
          </p>
        )}

        <button type="submit" className="button button-primary auth-submit" disabled={createAccount.isPending}>
          {createAccount.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </div>

      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="link-button" onClick={onLogin}>
          Log in
        </button>
      </p>
    </form>
  );
}
