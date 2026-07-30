import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type {
  CurriculumCorpus,
  CurriculumDocument,
  CurriculumEntity,
} from '@roadmap/curriculum-schema';
import type { PublicationChannel } from './publication-channel.js';
import { isVisible } from './publication-channel.js';

type TrackDocument = CurriculumDocument<Extract<CurriculumEntity, { kind: 'track' }>>;

function isTrackDocument(document: CurriculumDocument): document is TrackDocument {
  return document.data.kind === 'track';
}

export interface SidebarLink {
  label: string;
  link: string;
}

export interface SidebarGroup {
  label: string;
  items: readonly SidebarItem[];
}

export type SidebarItem = SidebarGroup | SidebarLink;

export function buildSidebar(
  corpus: CurriculumCorpus,
  channel: PublicationChannel,
): readonly SidebarItem[] {
  const byId = new Map(corpus.documents.map((document) => [document.data.id, document]));
  const tracks = corpus.documents
    .filter(isTrackDocument)
    .filter((document) => isVisible(document.data.status, channel));

  return tracks.map(({ data: track }) => ({
    label: track.title,
    items: track.modules.map((moduleId) => {
      const moduleDocument = byId.get(moduleId);
      if (moduleDocument?.data.kind !== 'module') {
        throw new Error(`Track ${track.id} has unresolved module: ${moduleId}`);
      }
      if (!isVisible(moduleDocument.data.status, channel)) {
        throw new Error(`Track ${track.id} has invisible module: ${moduleId}`);
      }
      return {
        label: moduleDocument.data.title,
        items: moduleDocument.data.lessons.map((lessonId) => {
          const lesson = byId.get(lessonId);
          if (lesson?.data.kind !== 'lesson') {
            throw new Error(`Module ${moduleId} has unresolved lesson: ${lessonId}`);
          }
          if (!isVisible(lesson.data.status, channel)) {
            throw new Error(`Module ${moduleId} has invisible lesson: ${lessonId}`);
          }
          return { label: lesson.data.title, link: `/${lesson.data.slug}/` };
        }),
      };
    }),
  }));
}

export async function loadSidebar(runtime: {
  curriculumRoot: string;
  channel: PublicationChannel;
}): Promise<readonly SidebarItem[]> {
  const corpus = await loadCurriculum(runtime.curriculumRoot);
  if (!corpus.ok) throw new Error(JSON.stringify(corpus.diagnostics));
  const graph = buildCurriculumGraph(corpus.value);
  if (!graph.ok) throw new Error(JSON.stringify(graph.diagnostics));
  const validation = validateCurriculumGraph(graph.value);
  if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));
  return buildSidebar(corpus.value, runtime.channel);
}
