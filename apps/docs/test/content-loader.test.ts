import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader, LoaderContext, ParseDataOptions, RenderMarkdownOptions } from 'astro/loaders';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { curriculumDocsLoader } from '../src/content-loader/curriculum-docs-loader.js';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));
const closureRouteId = 'lessons/javascript/functions/closure-private-state';
const eventNames = ['add', 'change', 'unlink'] as const;

type WatcherEvent = (typeof eventNames)[number];
type WatcherListener = (filePath: string) => void;
type RenderedContent = Awaited<ReturnType<LoaderContext['renderMarkdown']>>;

interface StoredEntry {
  id: string;
  data: Record<string, unknown>;
  body: string;
  rendered: RenderedContent;
  filePath: string;
  digest: string;
}

interface WatcherDouble {
  add: Mock<(paths: string | string[]) => WatcherDouble>;
  listeners: Map<WatcherEvent, WatcherListener>;
  off: Mock<(event: WatcherEvent, listener: WatcherListener) => WatcherDouble>;
  on: Mock<(event: WatcherEvent, listener: WatcherListener) => WatcherDouble>;
}

interface ContextDouble {
  clear: Mock<() => void>;
  context: LoaderContext;
  error: Mock<(message: string) => void>;
  generateDigest: Mock<(value: Record<string, unknown> | string) => string>;
  parseData: Mock<
    (options: ParseDataOptions<Record<string, unknown>>) => Promise<Record<string, unknown>>
  >;
  renderMarkdown: Mock<(body: string, options?: RenderMarkdownOptions) => Promise<RenderedContent>>;
  set: Mock<(entry: StoredEntry) => boolean>;
}

function createWatcherDouble(): WatcherDouble {
  const listeners = new Map<WatcherEvent, WatcherListener>();
  const watcher: WatcherDouble = {
    add: vi.fn<(paths: string | string[]) => WatcherDouble>(() => watcher),
    listeners,
    off: vi.fn<(event: WatcherEvent, listener: WatcherListener) => WatcherDouble>(
      (event, listener) => {
        if (listeners.get(event) === listener) listeners.delete(event);
        return watcher;
      },
    ),
    on: vi.fn<(event: WatcherEvent, listener: WatcherListener) => WatcherDouble>(
      (event, listener) => {
        listeners.set(event, listener);
        return watcher;
      },
    ),
  };
  return watcher;
}

function createContextDouble(watcher?: WatcherDouble): ContextDouble {
  const clear = vi.fn<() => void>();
  const set = vi.fn<(entry: StoredEntry) => boolean>(() => true);
  const parseData = vi.fn<
    (options: ParseDataOptions<Record<string, unknown>>) => Promise<Record<string, unknown>>
  >(({ data }) => Promise.resolve(data));
  const renderMarkdown = vi.fn<
    (body: string, options?: RenderMarkdownOptions) => Promise<RenderedContent>
  >((body) =>
    Promise.resolve({
      html: `<article>${body}</article>`,
      metadata: {},
    }),
  );
  const generateDigest = vi.fn<(value: Record<string, unknown> | string) => string>(
    (value: Record<string, unknown> | string) => `digest:${JSON.stringify(value)}`,
  );
  const error = vi.fn<(message: string) => void>();
  const usedContext = {
    generateDigest,
    logger: { error },
    parseData,
    renderMarkdown,
    store: { clear, set },
    watcher,
  };

  return {
    clear,
    context: usedContext as unknown as LoaderContext,
    error,
    generateDigest,
    parseData,
    renderMarkdown,
    set,
  };
}

function listener(watcher: WatcherDouble, event: WatcherEvent): WatcherListener {
  const callback = watcher.listeners.get(event);
  expect(callback).toBeDefined();
  if (callback === undefined) {
    throw new Error(`Missing ${event} watcher listener`);
  }
  return callback;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('curriculumDocsLoader', () => {
  it('performs a complete rendered reload with the Astro data-store shape', async () => {
    const calls: string[] = [];
    const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot });
    const context = createContextDouble();
    context.clear.mockImplementation(() => {
      calls.push('clear');
    });
    context.parseData.mockImplementation(({ data }) => {
      calls.push('parseData');
      return Promise.resolve(data);
    });
    context.renderMarkdown.mockImplementation((body) => {
      calls.push('renderMarkdown');
      return Promise.resolve({ html: `<article>${body}</article>`, metadata: {} });
    });
    context.generateDigest.mockImplementation((value) => {
      calls.push('generateDigest');
      return `digest:${JSON.stringify(value)}`;
    });
    context.set.mockImplementation(() => {
      calls.push('set');
      return true;
    });

    await loader.load(context.context);

    expect(context.clear).toHaveBeenCalledOnce();
    expect(context.parseData).toHaveBeenCalledTimes(9);
    const closureRenderCall = context.renderMarkdown.mock.calls.find(([body]) =>
      body.includes('RELEASE_ZERO_CLOSURE_BODY'),
    );
    expect(closureRenderCall).toBeDefined();
    expect(closureRenderCall?.[0]).toContain('RELEASE_ZERO_CLOSURE_BODY');
    expect(closureRenderCall?.[1]?.fileURL).toBeInstanceOf(URL);
    expect(context.generateDigest).toHaveBeenCalledTimes(9);
    expect(calls).toEqual([
      'clear',
      ...Array.from({ length: 9 }, () => [
        'parseData',
        'renderMarkdown',
        'generateDigest',
        'set',
      ]).flat(),
    ]);

    const closureSet = context.set.mock.calls.find(([entry]) => entry.id === closureRouteId);
    expect(closureSet).toBeDefined();
    const closureEntry = closureSet?.[0];
    expect(closureEntry?.id).toBe(closureRouteId);
    expect(closureEntry?.body).toContain('RELEASE_ZERO_CLOSURE_BODY');
    expect(closureEntry?.rendered.html).toContain('RELEASE_ZERO_CLOSURE_BODY');
    expect(closureEntry?.filePath).toMatch(/lesson-js-closure-private-state\.md$/);
    expect(typeof closureEntry?.digest).toBe('string');
    expect(closureEntry?.data).toMatchObject({
      semanticId: 'lesson-js-closure-private-state',
      sourcePath: 'curriculum/lessons/lesson-js-closure-private-state.md',
    });
  });

  it('scopes watcher events, serializes reloads, and registers one listener set', async () => {
    const watcher = createWatcherDouble();
    const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot });
    const context = createContextDouble(watcher);

    await loader.load(context.context);
    await loader.load(context.context);

    expect(watcher.add).toHaveBeenCalledOnce();
    expect(watcher.add).toHaveBeenCalledWith(curriculumRoot);
    expect(watcher.on.mock.calls.map(([event]) => event)).toEqual(eventNames);

    const blockedReloads = new Set<number>();
    const releases: (() => void)[] = [];
    let activeReloads = 0;
    let maximumActiveReloads = 0;
    context.renderMarkdown.mockImplementation(async (body: string) => {
      const reloadNumber = context.clear.mock.calls.length;
      if (reloadNumber > 2 && !blockedReloads.has(reloadNumber)) {
        blockedReloads.add(reloadNumber);
        activeReloads += 1;
        maximumActiveReloads = Math.max(maximumActiveReloads, activeReloads);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        activeReloads -= 1;
      }
      return { html: `<article>${body}</article>`, metadata: {} };
    });

    listener(watcher, 'unlink')(path.resolve(curriculumRoot, '..', 'outside.md'));
    listener(watcher, 'add')(path.join(curriculumRoot, 'lessons', 'inside-a.md'));
    listener(watcher, 'change')(path.join(curriculumRoot, 'lessons', 'inside-b.md'));

    await vi.waitFor(() => {
      expect(releases).toHaveLength(1);
    });
    expect(maximumActiveReloads).toBe(1);
    releases.shift()?.();
    await vi.waitFor(() => {
      expect(releases).toHaveLength(1);
    });
    expect(maximumActiveReloads).toBe(1);
    releases.shift()?.();
    await vi.waitFor(() => {
      expect(context.set).toHaveBeenCalledTimes(36);
    });

    expect(maximumActiveReloads).toBe(1);
    expect(context.set).toHaveBeenCalledTimes(36);
  });

  it('detaches an old watcher and reloads through the latest context', async () => {
    const firstWatcher = createWatcherDouble();
    const secondWatcher = createWatcherDouble();
    const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot });
    const firstContext = createContextDouble(firstWatcher);
    const secondContext = createContextDouble(secondWatcher);

    await loader.load(firstContext.context);
    const firstListeners = new Map(firstWatcher.listeners);
    await loader.load(secondContext.context);

    expect(firstWatcher.off.mock.calls).toEqual(
      eventNames.map((event) => [event, firstListeners.get(event)]),
    );
    expect(secondWatcher.add).toHaveBeenCalledWith(curriculumRoot);
    expect(secondWatcher.on.mock.calls.map(([event]) => event)).toEqual(eventNames);

    listener(secondWatcher, 'change')(path.join(curriculumRoot, 'lessons', 'changed.md'));
    await vi.waitFor(
      () => {
        expect(secondContext.clear).toHaveBeenCalledTimes(2);
      },
      { timeout: 10_000 },
    );
    expect(firstContext.clear).toHaveBeenCalledOnce();
  });

  it('logs and surfaces a watcher reload failure', async () => {
    const watcher = createWatcherDouble();
    const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot });
    const context = createContextDouble(watcher);
    const surfaced: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      surfaced.push(callback);
    });

    await loader.load(context.context);
    const reloadError = new Error('watch reload failed');
    context.parseData.mockRejectedValueOnce(reloadError);
    listener(watcher, 'add')(path.join(curriculumRoot, 'lessons', 'broken.md'));

    await vi.waitFor(
      () => {
        expect(context.error).toHaveBeenCalledWith(reloadError.message);
      },
      { timeout: 10_000 },
    );
    expect(surfaced).toHaveLength(1);
    expect(() => {
      surfaced[0]?.();
    }).toThrow(reloadError);
  });

  it('surfaces a graph-invalid watcher reload before replacing the previous store', async () => {
    const temporaryParent = await mkdtemp(path.join(tmpdir(), 'roadmap-watcher-curriculum-'));
    const temporaryRoot = path.join(temporaryParent, 'curriculum');
    try {
      await cp(curriculumRoot, temporaryRoot, { recursive: true });
      const watcher = createWatcherDouble();
      const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot: temporaryRoot });
      const context = createContextDouble(watcher);
      const surfaced: (() => void)[] = [];
      vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
        surfaced.push(callback);
      });

      await loader.load(context.context);
      expect(context.clear).toHaveBeenCalledOnce();
      expect(context.set).toHaveBeenCalledTimes(9);

      const changedLesson = path.join(temporaryRoot, 'lessons', 'lesson-js-function-values.md');
      const originalSource = await readFile(changedLesson, 'utf8');
      const graphInvalidSource = originalSource.replace('status: published', 'status: draft');
      expect(graphInvalidSource).not.toBe(originalSource);
      await writeFile(changedLesson, graphInvalidSource, 'utf8');
      listener(watcher, 'change')(changedLesson);

      await vi.waitFor(
        () => {
          expect(context.error).toHaveBeenCalledWith(
            expect.stringContaining('CURRICULUM_PUBLICATION_001'),
          );
        },
        { timeout: 10_000 },
      );
      expect(context.clear).toHaveBeenCalledOnce();
      expect(context.set).toHaveBeenCalledTimes(9);
      expect(surfaced).toHaveLength(1);
      expect(() => {
        surfaced[0]?.();
      }).toThrow(/CURRICULUM_PUBLICATION_001/);
    } finally {
      await rm(temporaryParent, { force: true, recursive: true });
    }
  });

  it('throws curriculum diagnostics before clearing the store', async () => {
    const invalidRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-invalid-curriculum-'));
    try {
      await writeFile(
        path.join(invalidRoot, 'invalid.md'),
        '---\nid: invalid-without-required-fields\n---\n',
        'utf8',
      );
      const loader: Loader = curriculumDocsLoader({
        channel: 'production',
        curriculumRoot: invalidRoot,
      });
      const context = createContextDouble();

      await expect(loader.load(context.context)).rejects.toThrow(/CURRICULUM_SCHEMA_001/);
      expect(context.clear).not.toHaveBeenCalled();
    } finally {
      await rm(invalidRoot, { force: true, recursive: true });
    }
  });
  it('stores a site-root-relative filePath instead of an absolute path', async () => {
    const loader = curriculumDocsLoader({ channel: 'production', curriculumRoot });
    const context = createContextDouble();
    await loader.load(context.context);

    const storedPaths = context.set.mock.calls.map(
      (call: [{ filePath: string }]) => call[0].filePath,
    );
    expect(storedPaths.length).toBeGreaterThan(0);
    for (const filePath of storedPaths) {
      expect(path.isAbsolute(filePath)).toBe(false);
      expect(filePath).toMatch(/^(\.\.\/)+curriculum\//);
    }
  });
});
