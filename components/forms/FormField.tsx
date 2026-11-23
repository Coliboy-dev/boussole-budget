'use client';

import { cloneElement, useId, type ReactElement } from 'react';

/**
 * Champ de montant : texte avec clavier décimal, jamais un champ « nombre ».
 * Chrome, Android compris, peut avaler la virgule d'un champ nombre (« 12,34 » lu 1 234) ; la lecture se fait avec parseAmountInput.
 */
export const amountField = { type: 'text', inputMode: 'decimal', autoComplete: 'off' } as const;

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

export default function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const defaultId = useId();
  const id = children.props.id ?? defaultId;
  const description = [children.props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean).join(' ');

  return (
    <div className="mb-4 min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-red-800">*</span>}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': description || undefined,
      })}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-gray-600">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
