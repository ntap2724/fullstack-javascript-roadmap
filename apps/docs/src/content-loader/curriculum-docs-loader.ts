import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type { Loader } from 'astro/loaders';
import { createDocEntries } from '../lib/create-doc-entries.js';
import type { PublicationChannel } from '../lib/publication-channel.js';

export interface CurriculumDocsLoaderOptions {
  channel: PublicationChannel;
  curriculumRoot: string;
}

type LoaderContext = Parameters<NonNullable<Loader['load']>>[0];

export function curriculumDocsLoader(options: CurriculumDocsLoaderOptions): Loader {
  let latestContext: LoaderContext | undefined;
  let activeWatcher: LoaderContext['watcher'];
  let listeners:
    | {
        add: (filePath: string) => void;
        change: (filePath: string) => void;
        unlink: (filePath: string) => void;
      }
    | undefined;
  let reloadQueue = Promise.resolve();

  async function reload(context: LoaderContext): Promise<void> {
    const outcome = await loadCurriculum(options.curriculumRoot);
    if (!outcome.ok) {
      throw new Error(
        `Curriculum loading failed:\n${outcome.diagnostics
          .map(
            (diagnostic) => `${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`,
          )
          .join('\n')}`,
      );
    }

    const graph = buildCurriculumGraph(outcome.value);
    if (!graph.ok) {
      throw new Error(
        `Curriculum graph building failed:\n${graph.diagnostics
          .map(
            (diagnostic) => `${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`,
          )
          .join('\n')}`,
      );
    }

    const validation = validateCurriculumGraph(graph.value);
    if (!validation.ok) {
      throw new Error(
        `Curriculum graph validation failed:\n${validation.diagnostics
          .map(
            (diagnostic) => `${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`,
          )
          .join('\n')}`,
      );
    }

    const entries = createDocEntries(outcome.value, options);
    context.store.clear();
    for (const entry of entries) {
      const data = await context.parseData({ id: entry.id, data: entry.data });
      const rendered = await context.renderMarkdown(entry.body, {
        fileURL: pathToFileURL(entry.filePath),
      });
      const digest = context.generateDigest({ data, body: entry.body });
      const siteRoot = path.resolve(options.curriculumRoot, '..', 'apps', 'docs');
      context.store.set({
        id: entry.id,
        data,
        body: entry.body,
        rendered,
        filePath: path.relative(siteRoot, entry.filePath).split(path.sep).join('/'),
        digest,
      });
    }
  }

  function isInsideRoot(filePath: string): boolean {
    const relative = path.relative(options.curriculumRoot, path.resolve(filePath));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  function enqueueReload(filePath: string): void {
    const context = latestContext;
    if (!isInsideRoot(filePath) || context === undefined) return;
    reloadQueue = reloadQueue
      .then(() => reload(context))
      .catch((error: unknown) => {
        context.logger.error(error instanceof Error ? error.message : String(error));
        queueMicrotask(() => {
          throw error;
        });
      });
  }

  function detachWatcher(): void {
    if (activeWatcher === undefined || listeners === undefined) return;
    activeWatcher.off('add', listeners.add);
    activeWatcher.off('change', listeners.change);
    activeWatcher.off('unlink', listeners.unlink);
  }

  function attachWatcher(watcher: NonNullable<typeof activeWatcher>): void {
    if (watcher === activeWatcher) return;
    detachWatcher();
    listeners = {
      add: enqueueReload,
      change: enqueueReload,
      unlink: enqueueReload,
    };
    activeWatcher = watcher;
    watcher.add(options.curriculumRoot);
    watcher.on('add', listeners.add);
    watcher.on('change', listeners.change);
    watcher.on('unlink', listeners.unlink);
  }

  return {
    name: 'curriculum-docs-loader',
    load: async (context) => {
      latestContext = context;
      await reload(context);
      if (context.watcher !== undefined) attachWatcher(context.watcher);
    },
  };
}
