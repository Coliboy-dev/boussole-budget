'use client';

import { useState, type FormEvent } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type FieldErrors = Record<string, string | undefined>;

function isField(value: unknown): value is Field {
  return value instanceof HTMLInputElement
    || value instanceof HTMLSelectElement
    || value instanceof HTMLTextAreaElement;
}

function nativeError(field: Field): string | undefined {
  const { validity } = field;
  if (validity.valid) return undefined;
  if (validity.badInput) return 'Saisis une valeur valide.';
  if (validity.valueMissing) return 'Renseigne ce champ.';
  if (validity.rangeUnderflow && field instanceof HTMLInputElement) {
    if (field.type === 'date') return 'Choisis une date égale ou postérieure à la date de début.';
    if (field.min === '0') return 'Saisis un montant supérieur ou égal à zéro.';
  }
  if (validity.stepMismatch && field instanceof HTMLInputElement && field.step === '0.01') {
    return 'Saisis un montant avec deux décimales au maximum.';
  }
  return field.validationMessage;
}

export function useFormValidation() {
  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(form: HTMLFormElement, rules: FieldErrors): boolean {
    const next: FieldErrors = {};
    let firstError: Field | undefined;

    for (const field of Array.from(form.elements)) {
      if (!isField(field) || !field.name || !field.willValidate) continue;
      const message = nativeError(field) ?? rules[field.name];
      if (!message) continue;
      next[field.name] = message;
      firstError ??= field;
    }

    setErrors(next);
    firstError?.focus();
    return firstError === undefined;
  }

  function clearFieldError(event: FormEvent<HTMLFormElement>): void {
    const field = event.target;
    if (!isField(field)) return;
    setErrors((previous) => {
      if (!previous[field.name]) return previous;
      return { ...previous, [field.name]: undefined };
    });
  }

  function reset(): void {
    setErrors({});
  }

  return { errors, validate, clearFieldError, reset };
}
