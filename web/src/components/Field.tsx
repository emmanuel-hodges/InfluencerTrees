// Small helpers so every form control gets a label, an optional hint, and an
// error line wired up with aria-describedby the same way.
import type { ReactNode } from 'react';
import { useId } from 'react';

export function describedBy(id: string, opts: { hint?: unknown; error?: unknown }): string | undefined {
  const parts: string[] = [];
  if (opts.hint) parts.push(`${id}-hint`);
  if (opts.error) parts.push(`${id}-error`);
  return parts.length ? parts.join(' ') : undefined;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface RadioGroupProps<T extends string> {
  legend: ReactNode;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | '';
  onChange: (value: T) => void;
  hint?: ReactNode;
  error?: string | undefined;
  disabled?: boolean;
}

export function RadioGroup<T extends string>({ legend, options, value, onChange, hint, error, disabled }: RadioGroupProps<T>) {
  const id = useId();
  return (
    <fieldset
      className={`field radio-group${error ? ' field--error' : ''}`}
      disabled={disabled}
      aria-describedby={describedBy(id, { hint, error })}
    >
      <legend className="field__label">{legend}</legend>
      <div className="radio-group__options">
        {options.map((o) => {
          const optionId = `${id}-${o.value}`;
          return (
            <label key={o.value} className="radio" htmlFor={optionId}>
              <input
                type="radio"
                id={optionId}
                name={id}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
