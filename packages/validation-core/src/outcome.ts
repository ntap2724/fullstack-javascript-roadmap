import type { Diagnostic } from './diagnostic.js';

export type ValidationOutcome<T> =
  | { ok: true; value: T; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };

export const success = <T>(
  value: T,
  diagnostics: readonly Diagnostic[] = [],
): ValidationOutcome<T> => ({ ok: true, value, diagnostics });

export const failure = <T = never>(diagnostics: readonly Diagnostic[]): ValidationOutcome<T> => ({
  ok: false,
  diagnostics,
});
