import { parseSync, type ParserOptions } from 'vite';

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

type AstNode = {
  type: string;
  [property: string]: unknown;
};

function isForbiddenWebBoundary(moduleSpecifier: string): boolean {
  if (!moduleSpecifier.startsWith(INTERNAL_PACKAGE_PREFIX)) {
    return false;
  }

  return (
    moduleSpecifier !== CONTRACTS_PACKAGE_NAME &&
    !moduleSpecifier.startsWith(`${CONTRACTS_PACKAGE_NAME}/`)
  );
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function stringLiteralValue(value: unknown): string | undefined {
  if (!isAstNode(value) || value.type !== 'Literal') {
    return undefined;
  }

  return typeof value.value === 'string' ? value.value : undefined;
}

function moduleSpecifierFromNode(node: AstNode): string | undefined {
  if (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'ImportExpression'
  ) {
    return stringLiteralValue(node.source);
  }

  if (node.type !== 'TSImportEqualsDeclaration') {
    return undefined;
  }

  const moduleReference = node.moduleReference;
  return isAstNode(moduleReference) && moduleReference.type === 'TSExternalModuleReference'
    ? stringLiteralValue(moduleReference.expression)
    : undefined;
}

function findForbiddenAstImport(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const forbiddenSpecifier = findForbiddenAstImport(item);
      if (forbiddenSpecifier) {
        return forbiddenSpecifier;
      }
    }

    return undefined;
  }

  if (!isAstNode(value)) {
    return undefined;
  }

  const moduleSpecifier = moduleSpecifierFromNode(value);
  if (moduleSpecifier && isForbiddenWebBoundary(moduleSpecifier)) {
    return moduleSpecifier;
  }

  for (const [property, child] of Object.entries(value)) {
    if (property === 'parent') {
      continue;
    }

    const forbiddenSpecifier = findForbiddenAstImport(child);
    if (forbiddenSpecifier) {
      return forbiddenSpecifier;
    }
  }

  return undefined;
}

function parserLanguageForSourceFile(sourceFile: string): NonNullable<ParserOptions['lang']> {
  if (/\.[cm]?tsx$/i.test(sourceFile)) {
    return 'tsx';
  }
  if (/\.[cm]?jsx$/i.test(sourceFile)) {
    return 'jsx';
  }
  if (/\.[cm]?ts$/i.test(sourceFile)) {
    return 'ts';
  }

  return 'js';
}

function findForbiddenSourceImport(source: string, sourceFile: string): string | undefined {
  const result = parseSync(sourceFile, source, {
    astType: 'ts',
    lang: parserLanguageForSourceFile(sourceFile),
    sourceType: 'unambiguous',
  });

  if (result.errors.length > 0) {
    throw new Error(`Unable to parse ${sourceFile} while evaluating starter dependency policy.`);
  }

  return findForbiddenAstImport(result.program);
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
