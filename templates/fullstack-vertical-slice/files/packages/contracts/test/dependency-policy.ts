import { initSync, parse } from 'es-module-lexer';

export type StarterDependencyPolicyDiagnostic = {
  code: 'STARTER_DEPENDENCY_001' | 'STARTER_IMPORT_001';
  message: string;
  packageName: string;
  sourceFile?: string;
};

export type StarterPackagePolicyInput = {
  manifest: {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  sourceFiles?: Record<string, string>;
};

const WEB_PACKAGE_NAME = '@workshop/web';
const CONTRACTS_PACKAGE_NAME = '@workshop/contracts';
const INTERNAL_PACKAGE_PREFIX = '@workshop/';

const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function isForbiddenWebBoundary(moduleSpecifier: string): boolean {
  if (!moduleSpecifier.startsWith(INTERNAL_PACKAGE_PREFIX)) {
    return false;
  }

  return (
    moduleSpecifier !== CONTRACTS_PACKAGE_NAME &&
    !moduleSpecifier.startsWith(`${CONTRACTS_PACKAGE_NAME}/`)
  );
}

initSync();

function findForbiddenSourceImport(source: string, sourceFile: string): string | undefined {
  const [imports] = parse(source, sourceFile);
  return imports.find(({ n }) => n && isForbiddenWebBoundary(n))?.n;
}

export function evaluateStarterDependencyPolicy(
  input: StarterPackagePolicyInput,
): StarterDependencyPolicyDiagnostic[] {
  if (input.manifest.name !== WEB_PACKAGE_NAME) {
    return [];
  }

  const diagnostics: StarterDependencyPolicyDiagnostic[] = [];

  for (const section of dependencySections) {
    const dependencies = input.manifest[section] ?? {};

    for (const dependencyName of Object.keys(dependencies).sort()) {
      if (!isForbiddenWebBoundary(dependencyName)) {
        continue;
      }

      diagnostics.push({
        code: 'STARTER_DEPENDENCY_001',
        message: `${WEB_PACKAGE_NAME} must not declare ${dependencyName} in ${section}; web may consume ${CONTRACTS_PACKAGE_NAME} only.`,
        packageName: WEB_PACKAGE_NAME,
      });
    }
  }

  for (const [sourceFile, source] of Object.entries(input.sourceFiles ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const forbiddenSpecifier = findForbiddenSourceImport(source, sourceFile);
    if (!forbiddenSpecifier) {
      continue;
    }

    diagnostics.push({
      code: 'STARTER_IMPORT_001',
      message: `${sourceFile} must not import ${forbiddenSpecifier}; web source may import ${CONTRACTS_PACKAGE_NAME} only.`,
      packageName: WEB_PACKAGE_NAME,
      sourceFile,
    });
  }

  return diagnostics;
}
