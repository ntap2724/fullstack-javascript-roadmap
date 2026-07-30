import path from 'node:path';
import type { CurriculumCorpus, CurriculumEntity } from '@roadmap/curriculum-schema';
import { isVisible, type PublicationChannel } from './publication-channel.js';

export interface CreateDocEntriesOptions {
  channel: PublicationChannel;
  curriculumRoot: string;
}

export interface CurriculumDocEntry {
  id: string;
  filePath: string;
  body: string;
  data: {
    title: string;
    description: string;
    semanticId: string;
    entityKind: string;
    publicationStatus: string;
    sourcePath: string;
    prerequisites: readonly string[];
    competencies: readonly string[];
    lastReviewedIn: string;
  };
}

function getCompetencies(entity: CurriculumEntity): readonly string[] {
  return 'competencies' in entity ? entity.competencies : [];
}

export function createDocEntries(
  corpus: CurriculumCorpus,
  options: CreateDocEntriesOptions,
): readonly CurriculumDocEntry[] {
  return corpus.documents
    .filter(({ data }) => isVisible(data.status, options.channel))
    .map((document) => {
      const sourceWithinRoot = path
        .relative(options.curriculumRoot, document.filePath)
        .split(path.sep)
        .join('/');
      if (
        path.isAbsolute(sourceWithinRoot) ||
        sourceWithinRoot === '..' ||
        sourceWithinRoot.startsWith('../')
      ) {
        throw new Error(
          `Curriculum document is outside the active curriculum root: ${document.filePath}`,
        );
      }

      return {
        id: document.data.slug,
        filePath: document.filePath,
        body: document.body,
        data: {
          title: document.data.title,
          description: document.data.description,
          semanticId: document.data.id,
          entityKind: document.data.kind,
          publicationStatus: document.data.status,
          sourcePath: `curriculum/${sourceWithinRoot}`,
          prerequisites: document.data.prerequisites,
          competencies: getCompetencies(document.data),
          lastReviewedIn: document.data.lastReviewedIn,
        },
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
