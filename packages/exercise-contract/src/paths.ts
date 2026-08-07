import picomatch from 'picomatch';

const RESERVED_DOS_NAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const RESERVED_DOS_PREFIX = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:$|[.?*])/i;
const EXTGLOB_OPENER = /[!@+?*]\(/;

function hasControlOrDelete(input: string): boolean {
  for (const character of input) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function containsAny(input: string, characters: string): boolean {
  for (const character of input) {
    if (characters.includes(character)) return true;
  }
  return false;
}

export function normalizeRelativePath(input: string): string {
  return input.replaceAll('\\', '/');
}

function hasUnsafeRootSyntax(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('\\') ||
    /^[A-Za-z]:/.test(input) ||
    input.includes(':') ||
    input.endsWith('/') ||
    input.endsWith('\\')
  );
}

function splitNormalizedPath(input: string): readonly string[] | undefined {
  if (input.length === 0 || hasControlOrDelete(input) || hasUnsafeRootSyntax(input))
    return undefined;
  const segments = normalizeRelativePath(input).split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return undefined;
  }
  return segments;
}

function isReservedDosSegment(segment: string): boolean {
  return RESERVED_DOS_NAME.test(segment);
}

function isSafeConcreteSegment(segment: string): boolean {
  if (/[. ]$/.test(segment) || isReservedDosSegment(segment)) return false;
  if (containsAny(segment, '<>"|')) return false;
  if (containsAny(segment, '*?[]{}') || segment.startsWith('!') || EXTGLOB_OPENER.test(segment)) {
    return false;
  }
  return true;
}

export function isSafeRelativePath(input: string): boolean {
  if (typeof input !== 'string') return false;
  const segments = splitNormalizedPath(input);
  return segments !== undefined && segments.every(isSafeConcreteSegment);
}

function isSafePatternSegment(segment: string): boolean {
  if (segment === '**') return true;
  if (/[. ]$/.test(segment) || RESERVED_DOS_PREFIX.test(segment) || segment.startsWith('!')) {
    return false;
  }
  if (containsAny(segment, '<>"|')) return false;
  if (containsAny(segment, '{}[]') || EXTGLOB_OPENER.test(segment)) return false;
  return true;
}

export function isValidEditablePattern(pattern: string): boolean {
  if (typeof pattern !== 'string' || pattern.length === 0) return false;
  if (pattern.startsWith('!')) return false;
  const segments = splitNormalizedPath(pattern);
  if (segments === undefined) return false;

  for (const [index, segment] of segments.entries()) {
    if (segment === '**') {
      if (index === 0 || index !== segments.length - 1) return false;
      if (segments.slice(0, index).some((prefix) => !isSafeConcreteSegment(prefix))) {
        return false;
      }
      continue;
    }
    if (!isSafePatternSegment(segment)) return false;
    if (segment.includes('**')) return false;
  }

  return true;
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readPatternSet(value: unknown): readonly string[] | undefined {
  try {
    if (!isReadonlyArray(value)) return undefined;

    const patterns: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return undefined;
      const pattern = value[index];
      if (typeof pattern !== 'string') return undefined;
      patterns.push(pattern);
    }
    return patterns;
  } catch {
    return undefined;
  }
}

export function matchesEditablePath(candidate: string, patterns: readonly string[]): boolean {
  const patternSet = readPatternSet(patterns);
  if (patternSet === undefined || !isSafeRelativePath(candidate)) return false;
  if (patternSet.some((pattern) => !isValidEditablePattern(pattern))) return false;
  const normalizedCandidate = normalizeRelativePath(candidate);

  return patternSet.some((pattern) => {
    try {
      return picomatch(normalizeRelativePath(pattern), {
        dot: true,
        nonegate: true,
        nobrace: true,
        noext: true,
      })(normalizedCandidate);
    } catch {
      return false;
    }
  });
}
