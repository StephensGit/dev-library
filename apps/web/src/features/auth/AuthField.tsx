import type { ComponentProps } from 'react';

type AuthFieldProps = ComponentProps<'input'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

// A labelled input whose error is announced by screen readers.
export function AuthField({ id, label, hint, error, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <input
        id={id}
        className="input"
        data-invalid={Boolean(error)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
