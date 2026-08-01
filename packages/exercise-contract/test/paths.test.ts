import { describe, expect, it } from 'vitest';
import { isSafeRelativePath, matchesEditablePath, normalizeRelativePath } from '../src/index.js';

describe('exercise path rules', () => {
  it.each(['src/counter.js', String.raw`src\counter.js`])(
    'normalizes %s to POSIX form',
    (input) => {
      expect(normalizeRelativePath(input)).toBe('src/counter.js');
    },
  );

  it.each([
    '',
    '.',
    './secret',
    '../secret',
    '/absolute',
    String.raw`\absolute`,
    String.raw`C:\secret`,
    String.raw`C:secret`,
    String.raw`\\server\share\secret`,
    String.raw`\\?\C:\secret`,
    String.raw`\\.\C:\secret`,
    'src/..',
    'src/../../secret',
    'src//secret',
    String.raw`src\//secret`,
    'src/./secret',
    'src/CON.txt',
    'src/com1.js',
    'src/file. ',
    'src/file.',
    '\u0000secret',
    '\u0001secret',
    'secret\u007f.txt',
    'src/foo:bar.js',
    'src/[counter].js',
    'src/*.js',
    'src/?.js',
  ])('rejects unsafe relative path %s', (input) => {
    expect(isSafeRelativePath(input)).toBe(false);
  });

  it.each(['src/counter.js', String.raw`src\counter.js`, 'src/.config.js', 'test/counter.test.js'])(
    'accepts safe ordinary path %s',
    (input) => {
      expect(isSafeRelativePath(input)).toBe(true);
    },
  );

  it('matches literal, star, question, and terminal recursive editable globs', () => {
    expect(matchesEditablePath('src/counter.js', ['src/counter.js'])).toBe(true);
    expect(matchesEditablePath('src/counter.js', ['src/*.js'])).toBe(true);
    expect(matchesEditablePath('src/a.js', ['src/?.js'])).toBe(true);
    expect(matchesEditablePath('src/nested/counter.js', ['src/**'])).toBe(true);
    expect(matchesEditablePath('src/nested/counter.js', ['src/nested/**'])).toBe(true);
    expect(matchesEditablePath('src/.config.js', ['src/**'])).toBe(true);
    expect(matchesEditablePath('test/counter.test.js', ['src/**'])).toBe(false);
    expect(matchesEditablePath(String.raw`src\counter.js`, [String.raw`src\**`])).toBe(true);
  });

  it.each([
    ['*/**', 'src/file.js'],
    ['?/**', 's/file.js'],
    ['src?/**', 'srca/file.js'],
    ['src/*/**', 'src/nested/file.js'],
  ])('requires a concrete prefix before terminal recursion %s', (pattern, candidate) => {
    expect(matchesEditablePath(candidate, [pattern])).toBe(false);
  });

  it.each([
    '**',
    'src/**/nested',
    'src/foo**',
    '!src/**',
    'src/!secret/**',
    '{src,test}/**',
    'src/[counter].js',
    'src/@(counter|answer).js',
    'src/foo@(counter|answer).js',
    'src/foo?(counter).js',
    'src/foo+(counter).js',
    'src/foo*(counter).js',
    'src/foo!(counter).js',
    'src/**/../secret',
    '../src/**',
    'C:src/**',
    'src/CON*',
    'src//**',
  ])('rejects non-allow-only pattern %s', (pattern) => {
    expect(matchesEditablePath('src/counter.js', [pattern])).toBe(false);
  });

  it('rejects unsafe candidates even when a pattern would otherwise match', () => {
    expect(matchesEditablePath('../src/counter.js', ['src/**'])).toBe(false);
    expect(matchesEditablePath('src/[counter].js', ['src/**'])).toBe(false);
    expect(matchesEditablePath(String.raw`C:\src\counter.js`, ['**'])).toBe(false);
  });

  it('rejects the full pattern set when any member is invalid', () => {
    expect(matchesEditablePath('src/counter.js', ['src/**', '!src/**'])).toBe(false);
  });

  it('rejects sparse, accessor-failing, and non-string runtime pattern sets', () => {
    const sparse = new Array<string>(2);
    sparse[0] = 'src/**';
    expect(matchesEditablePath('src/counter.js', sparse)).toBe(false);

    const accessorFailing = new Array<string>(2);
    accessorFailing[0] = 'src/**';
    Object.defineProperty(accessorFailing, 1, {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('pattern accessor failed');
      },
    });
    let accessorResult: boolean | undefined;
    expect(() => {
      accessorResult = matchesEditablePath('src/counter.js', accessorFailing);
    }).not.toThrow();
    expect(accessorResult).toBe(false);

    expect(
      matchesEditablePath('src/counter.js', ['src/**', 42] as unknown as readonly string[]),
    ).toBe(false);
  });
});
