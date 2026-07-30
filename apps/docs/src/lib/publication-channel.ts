import type { CurriculumEntity } from '@roadmap/curriculum-schema';

export type PublicationChannel = 'development' | 'preview' | 'production';
type PublicationStatus = CurriculumEntity['status'];

const channelValues: readonly PublicationChannel[] = ['development', 'preview', 'production'];

const visible: Record<PublicationChannel, ReadonlySet<PublicationStatus>> = {
  development: new Set(['draft', 'review', 'published', 'deprecated', 'withdrawn']),
  preview: new Set(['review', 'published', 'deprecated', 'withdrawn']),
  production: new Set(['published', 'deprecated', 'withdrawn']),
};

function isPublicationChannel(value: string): value is PublicationChannel {
  return channelValues.some((channel) => channel === value);
}

export function parsePublicationChannel(value: string): PublicationChannel {
  if (!isPublicationChannel(value)) {
    throw new Error(`Invalid ROADMAP_PUBLICATION_CHANNEL: ${value}`);
  }
  return value;
}

export function isVisible(status: PublicationStatus, channel: PublicationChannel): boolean {
  return visible[channel].has(status);
}
