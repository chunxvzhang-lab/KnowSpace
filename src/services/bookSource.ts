import type { BookManifest, ChapterSource } from "../core/types";
import demoManifest from "../../public/books/demo/manifest.json";
import welcomeMd from "../../public/books/demo/chapters/01-welcome.md?raw";
import readerFlowMd from "../../public/books/demo/chapters/02-reader-flow.md?raw";
import advancedMd from "../../public/books/demo/chapters/03-advanced-markdown.md?raw";

const EMBEDDED_CHAPTERS: Record<string, string> = {
  welcome: welcomeMd,
  "reader-flow": readerFlowMd,
  "advanced-markdown": advancedMd,
  "chapters/01-welcome.md": welcomeMd,
  "chapters/02-reader-flow.md": readerFlowMd,
  "chapters/03-advanced-markdown.md": advancedMd,
};

/**
 * The book that ships inside the app, for the web build and for first run.
 *
 * One book, hard-coded, and the chapter loader below is hard-coded to match: there is
 * no folder to open without the desktop bridge, so the manifest this app can be showing
 * is this one.
 */
export async function loadPackagedBook(): Promise<BookManifest> {
  const manifest = demoManifest as BookManifest;
  validateManifest(manifest);
  return manifest;
}

/**
 * Loads a chapter **of the packaged book**.
 *
 * Named for that, because the name used to be `loadChapterMarkdown` and the URL below
 * says `books/demo/` — which reads like a bug to anyone who takes the old name at its
 * word. It is the fallback for when there is no desktop bridge: with one, App reads the
 * chapter from disk through the bridge and this is never called. So the manifest that
 * arrives here is the packaged one, and the hard-coded path is the book.
 */
export async function loadPackagedChapterMarkdown(
  manifest: BookManifest,
  chapterId: string,
): Promise<ChapterSource> {
  const chapter = manifest.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error(`未知章节：${chapterId}`);

  // 1. Prioritize embedded raw markdown for zero-latency, offline, and file:// protocol safety
  const embedded = EMBEDDED_CHAPTERS[chapter.id] ?? EMBEDDED_CHAPTERS[chapter.src];
  if (typeof embedded === "string") {
    return {
      markdown: embedded,
      baseUrl: window.location.href,
    };
  }

  // 2. Fallback to a fetch for anything the bundle does not carry. The path is the
  // packaged book's, which is the only book reachable without the desktop bridge.
  const chapterUrl = `books/demo/${chapter.src}`;
  const response = await fetch(chapterUrl);
  if (!response.ok) {
    throw new Error(`无法加载章节“${chapter.title}”（${response.status}）`);
  }
  return {
    markdown: await response.text(),
    baseUrl: new URL(".", new URL(chapterUrl, window.location.href)).toString(),
  };
}

function validateManifest(manifest: BookManifest): void {
  if (!manifest.id || !manifest.title || !Array.isArray(manifest.chapters)) {
    throw new Error("书籍清单缺少 id、title 或 chapters。");
  }
  if (manifest.chapters.length === 0) {
    throw new Error("书籍清单没有章节。");
  }
  for (const chapter of manifest.chapters) {
    if (!chapter.id || !chapter.title || !chapter.src) {
      throw new Error("章节条目必须包含 id、title 和 src。");
    }
  }
}
