import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePublicationChannel, type PublicationChannel } from './publication-channel.js';

export interface ResolveCurriculumRuntimeOptions {
  astroCommand?: string;
  explicitChannel?: string;
  explicitRoot?: string;
  testRootAuthorization?: string;
}

export function resolveDefaultCurriculumRoot(): string {
  return fileURLToPath(new URL('../../../../curriculum/', import.meta.url));
}

export function resolveCurriculumRuntime(options: ResolveCurriculumRuntimeOptions = {}): {
  curriculumRoot: string;
  channel: PublicationChannel;
} {
  const explicitChannel = options.explicitChannel ?? process.env.ROADMAP_PUBLICATION_CHANNEL;
  const astroCommand = options.astroCommand ?? process.argv[2];
  const channel =
    explicitChannel !== undefined
      ? parsePublicationChannel(explicitChannel)
      : astroCommand === 'dev'
        ? 'development'
        : 'production';
  const explicitRoot = options.explicitRoot ?? process.env.ROADMAP_CURRICULUM_ROOT;
  const testRootAuthorization =
    options.testRootAuthorization ?? process.env.ROADMAP_ENABLE_TEST_CURRICULUM_ROOT;
  if (explicitRoot !== undefined && testRootAuthorization !== '1') {
    throw new Error('ROADMAP_CURRICULUM_ROOT requires ROADMAP_ENABLE_TEST_CURRICULUM_ROOT=1');
  }
  return {
    curriculumRoot: explicitRoot ? path.resolve(explicitRoot) : resolveDefaultCurriculumRoot(),
    channel,
  };
}

export const curriculumRuntime = resolveCurriculumRuntime();
