import { vi } from "vitest";

/**
 * A fake for the Electron preload bridge.
 *
 * `KnowSpaceDesktopAPI` declares 60+ methods, but App.tsx only calls 23 of them
 * (list them with `node scripts/list-desktop-api-usage.cjs src/App.tsx`). Faking
 * exactly those keeps the harness small enough to read and lets App-level tests
 * exist at all — before this, not a single test rendered `<App />`, so the R1
 * refactor had no safety net whatsoever.
 *
 * Every method resolves to an empty but well-formed result, which is enough for
 * the app to mount and be driven through its happy paths. Individual tests
 * override only the calls they care about.
 */

export type DesktopMock = ReturnType<typeof createDesktopMock>;

/** A minimal vault: one folder with two markdown files. */
export const SAMPLE_CHAPTERS = [
  {
    id: "chapter:path:notes%2Fa.md",
    title: "notes / a",
    src: "notes/a.md",
    absolutePath: "C:/vault/notes/a.md",
  },
  {
    id: "chapter:path:notes%2Fb.md",
    title: "notes / b",
    src: "notes/b.md",
    absolutePath: "C:/vault/notes/b.md",
  },
];

export const SAMPLE_MANIFEST = {
  id: "vault:test",
  title: "Test Vault",
  description: "",
  rootPath: "C:/vault",
  chapters: SAMPLE_CHAPTERS,
};

/** Source payload width when the loader returns a document. */
export function sampleSource(markdown: string, absolutePath: string) {
  return {
    markdown,
    baseUrl: `file:///${absolutePath}/`,
    cacheKey: absolutePath,
    diskVersion: { size: markdown.length, mtimeMs: 1 },
    hasBom: false,
    lineEnding: "\n",
    absolutePath,
  };
}

/**
 * Builds the fake bridge. Any method not relevant to a given test still exists,
 * so a component reaching for it does not explode.
 */
export function createDesktopMock() {
  const noop = vi.fn().mockResolvedValue(undefined);

  const mock = {
    // ── Vault / directory ────────────────────────────────────────────────
    getInitialSyncData: vi.fn().mockResolvedValue({
      manifest: SAMPLE_MANIFEST,
      windowTitle: "KnowSpace",
    }),
    openDirectory: vi.fn().mockResolvedValue({ canceled: true }),
    refreshDirectory: vi.fn().mockResolvedValue(SAMPLE_MANIFEST),
    getDirectoryForFile: vi.fn().mockResolvedValue(SAMPLE_MANIFEST),

    // ── Documents ────────────────────────────────────────────────────────
    // Note the argument shapes: readMarkdownFile/readMarkdownBatch take a bare
    // path (or paths), while saveMarkdownFile takes a request object.
    readMarkdownFile: vi
      .fn()
      .mockImplementation((absolutePath: string) =>
        Promise.resolve(sampleSource(`# loaded ${absolutePath}`, absolutePath))
      ),
    readMarkdownBatch: vi
      .fn()
      .mockImplementation((paths: string[]) =>
        Promise.resolve(paths.map((p) => sampleSource(`# batch ${p}`, p)))
      ),
    createMarkdownFile: vi.fn().mockResolvedValue({
      canceled: true,
    }),
    saveMarkdownFile: vi
      .fn()
      .mockImplementation((request: { absolutePath: string; content: string }) =>
        Promise.resolve({
          success: true,
          absolutePath: request.absolutePath,
          baseUrl: `file:///${request.absolutePath}/`,
          cacheKey: request.absolutePath,
          diskVersion: { size: request.content.length, mtimeMs: 2 },
        })
      ),
    renameMarkdownFile: vi.fn().mockResolvedValue({ success: true }),

    // ── Window / shell ───────────────────────────────────────────────────
    toggleFullScreen: noop,
    isFullScreen: vi.fn().mockResolvedValue(false),
    onFullScreenChanged: vi.fn().mockReturnValue(() => {}),
    openInNewWindow: noop,
    setNativeTheme: noop,
    getLaunchFilePath: vi.fn().mockResolvedValue(null),

    // ── Main-process events ──────────────────────────────────────────────
    onOpenFilePath: vi.fn().mockReturnValue(() => {}),
    onMenuCommand: vi.fn().mockReturnValue(() => {}),
    onBeforeClose: vi.fn().mockReturnValue(() => {}),
    onFlashNoteSaved: vi.fn().mockReturnValue(() => {}),
    resolveBeforeClose: noop,

    // ── Flash notes / export ─────────────────────────────────────────────
    saveFlashNote: vi.fn().mockResolvedValue({ success: true }),
    getFlashNotesSummary: vi.fn().mockResolvedValue({
      success: true,
      spaceDir: "C:/vault/Space",
      notes: [],
      totalTodos: 0,
      completedTodos: 0,
    }),
    printToPdf: vi.fn().mockResolvedValue({ success: true }),
  };

  return mock;
}

/** Installs the fake on both bridge names and returns it. */
export function installDesktopMock(): DesktopMock {
  const mock = createDesktopMock();
  const target = window as unknown as Record<string, unknown>;
  target.knowSpaceDesktop = mock;
  target.bookMDDesktop = mock;
  return mock;
}

/** Removes the fake so other test files start clean. */
export function removeDesktopMock(): void {
  const target = window as unknown as Record<string, unknown>;
  delete target.knowSpaceDesktop;
  delete target.bookMDDesktop;
}
