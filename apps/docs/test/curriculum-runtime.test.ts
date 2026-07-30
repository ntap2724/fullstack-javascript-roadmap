import path from 'node:path';
import type { CurriculumEntity } from '@roadmap/curriculum-schema';
import { describe, expect, it } from 'vitest';
import {
  resolveCurriculumRuntime,
  resolveDefaultCurriculumRoot,
} from '../src/lib/curriculum-runtime.js';
import {
  isVisible,
  parsePublicationChannel,
  type PublicationChannel,
} from '../src/lib/publication-channel.js';

const publicationStatuses: readonly CurriculumEntity['status'][] = [
  'draft',
  'review',
  'published',
  'deprecated',
  'withdrawn',
];

const expectedVisibility: Record<PublicationChannel, readonly CurriculumEntity['status'][]> = {
  development: ['draft', 'review', 'published', 'deprecated', 'withdrawn'],
  preview: ['review', 'published', 'deprecated', 'withdrawn'],
  production: ['published', 'deprecated', 'withdrawn'],
};

describe('publication channel and curriculum root', () => {
  it.each(['development', 'preview', 'production'] as const)(
    'accepts explicit channel %s',
    (channel) => {
      expect(parsePublicationChannel(channel)).toBe(channel);
    },
  );

  it('fails closed for an invalid explicit channel', () => {
    expect(() => parsePublicationChannel('prod')).toThrow(/Invalid ROADMAP_PUBLICATION_CHANNEL/);
  });

  it.each(
    (Object.keys(expectedVisibility) as PublicationChannel[]).flatMap((channel) =>
      publicationStatuses.map((status) => ({
        channel,
        expected: expectedVisibility[channel].includes(status),
        status,
      })),
    ),
  )('$channel visibility for $status is $expected', ({ channel, expected, status }) => {
    expect(isVisible(status, channel)).toBe(expected);
  });

  it('defaults dev to development and static build to production', () => {
    expect(
      resolveCurriculumRuntime({
        astroCommand: 'dev',
        explicitChannel: undefined,
      }).channel,
    ).toBe('development');
    expect(
      resolveCurriculumRuntime({
        astroCommand: 'build',
        explicitChannel: undefined,
      }).channel,
    ).toBe('production');
  });

  it('resolves the repository root and rejects an unauthorized alternate root', () => {
    expect(resolveDefaultCurriculumRoot().split(path.sep).join('/')).toMatch(/\/curriculum\/$/);
    expect(() =>
      resolveCurriculumRuntime({
        astroCommand: 'dev',
        explicitRoot: 'D:\\test-owned\\curriculum',
      }),
    ).toThrow(/ROADMAP_ENABLE_TEST_CURRICULUM_ROOT=1/);
  });

  it('accepts an alternate root only with explicit test authorization', () => {
    expect(
      resolveCurriculumRuntime({
        astroCommand: 'dev',
        explicitRoot: 'D:\\test-owned\\curriculum',
        testRootAuthorization: '1',
      }).curriculumRoot,
    ).toBe(path.resolve('D:\\test-owned\\curriculum'));
  });
});
