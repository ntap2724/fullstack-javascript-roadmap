export type DiagnosticSeverity = 'error' | 'warning' | 'notice';

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  pointer?: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  location: SourceLocation;
  observed: unknown;
  expected: string;
  reason: string;
  remediation: string;
  documentation: string;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === 'error');
}

export function mergeDiagnostics(
  ...groups: readonly (readonly Diagnostic[])[]
): readonly Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];
  for (const diagnostic of groups.flat()) {
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(diagnostic);
    }
  }
  return merged;
}
