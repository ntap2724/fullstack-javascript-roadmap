import type { CurriculumEntity } from './entities.js';

export interface CurriculumDocument<T extends CurriculumEntity = CurriculumEntity> {
  filePath: string;
  body: string;
  data: T;
}

export interface CurriculumCorpus {
  documents: readonly CurriculumDocument[];
}
