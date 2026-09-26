import { useCallback, useEffect, useRef } from "react";
import type { RenderedChapter } from "../core/types";
import type { EditorView as CmEditorView } from "@codemirror/view";
import { EditorView as EditorViewModule } from "@codemirror/view";
import { resolveBookmark } from "../services/bookmarks";
import { renderMarkdown } from "../services/markdown";
import { loadReadingPosition, saveReadingPosition } from "../services/storage";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import { renderedCacheKey } from "./useDocumentSession";

type PendingNavigation = {
  headingId?: string;
  lineNumber?: number;
  highlight?: boolean;
  searchResult?: import("../core/types").SearchResult;
};

type UseReadingPersistenceParams = {
  chapterId: string;
  renderedChapter: RenderedChapter | null;
  /** The outline's current heading — its change is what schedules the next save. */
  activeHeadingId: string | undefined;
  readerRef: { current: HTMLElement | null };
  editorViewRef: { current: CmEditorView | null };
  activeHeadingRef: { current: string | undefined };
  scrollRatioRef: { current: number };
  pendingBookmarkRef: { current: import("../core/types").Bookmark | null };
  pendingNavigationRef: { current: PendingNavigation | null };
  restoredChapterIdRef: { current: string | null };
  jumpToHeading: (headingId: string, behavior?: ScrollBehavior, highlight?: boolean) => void;
  jumpToRatio: (ratio: number) => void;
  handleSearchJump: (result: import("../core/types").SearchResult) => void;
  primeRenderedCache: (key: string, rendered: RenderedChapter) => void;
};

/**
 * Where the reader is, kept across sessions and across visits.
 *
 * Four jobs that all serve the same question: saving the position as the
 * reader settles, restoring it (or a queued bookmark / cross-document
 * navigation) when a document renders, pre-rendering the neighbours so the
 * next open is instant, and tracking which heading is on screen. They were
 * four scattered effects in App; they are one concern.
 */
export function useReadingPersistence({
  chapterId,
  renderedChapter,
  activeHeadingId,
  readerRef,
  editorViewRef,
  activeHeadingRef,
  scrollRatioRef,
  pendingBookmarkRef,
  pendingNavigationRef,
  restoredChapterIdRef,
  jumpToHeading,
  jumpToRatio,
  handleSearchJump,
  primeRenderedCache,
}: UseReadingPersistenceParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setNotice = useUiStore((s) => s.setNotice);

  const activeChapterSrc = manifest?.chapters.find((c) => c.id === chapterId)?.src;

  const saveCurrentReadingPosition = useCallback(() => {
    if (!manifest || !chapterId) return;
    saveReadingPosition({
      bookId: manifest.id,
      chapterId,
      chapterSrc: activeChapterSrc,
      headingId: activeHeadingRef.current,
      scrollRatio: scrollRatioRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, [activeChapterSrc, chapterId, manifest, activeHeadingRef, scrollRatioRef]);

  // Restore reading position or bookmark position
  useEffect(() => {
    if (!manifest || !renderedChapter || !chapterId) return;

    // Only restore once per chapter load/switch, unless a bookmark or navigation was queued
    if (
      restoredChapterIdRef.current === chapterId &&
      !pendingBookmarkRef.current &&
      !pendingNavigationRef.current
    )
      return;
    restoredChapterIdRef.current = chapterId;

    const pendingNav = pendingNavigationRef.current;
    if (pendingNav) {
      pendingNavigationRef.current = null;
      requestAnimationFrame(() => {
        if (pendingNav.searchResult) {
          handleSearchJump({ ...pendingNav.searchResult, chapterId: undefined });
        } else if (pendingNav.headingId) {
          jumpToHeading(pendingNav.headingId, "smooth", pendingNav.highlight ?? true);
        } else if (pendingNav.lineNumber && editorViewRef.current) {
          const editor = editorViewRef.current;
          const totalLines = editor.state.doc.lines;
          const safeLineNum = Math.min(Math.max(1, pendingNav.lineNumber), totalLines);
          const line = editor.state.doc.line(safeLineNum);
          editor.dispatch({
            selection: { anchor: line.from, head: line.from },
            effects: EditorViewModule.scrollIntoView(line.from, { y: "start", yMargin: 40 }),
          });
        }
      });
      return;
    }

    const pending = pendingBookmarkRef.current;
    if (pending) {
      pendingBookmarkRef.current = null;
      const resolution = resolveBookmark(
        pending,
        renderedChapter.headings,
        renderedChapter.checksum,
      );
      if (resolution.message) setNotice(resolution.message);
      requestAnimationFrame(() => {
        if (resolution.targetHeadingId) {
          jumpToHeading(resolution.targetHeadingId, "smooth", true);
        } else {
          jumpToRatio(resolution.scrollRatio);
        }
      });
      return;
    }

    const saved = loadReadingPosition(manifest.id, manifest.chapters);
    if (saved?.chapterId === chapterId) {
      requestAnimationFrame(() => {
        if (
          saved.headingId &&
          renderedChapter.headings.some((heading) => heading.id === saved.headingId)
        ) {
          jumpToHeading(saved.headingId, "auto", false);
        } else {
          jumpToRatio(saved.scrollRatio);
        }
      });
    } else {
      // New chapter with no saved position: cleanly reset scroll to the very top
      requestAnimationFrame(() => {
        readerRef.current?.scrollTo({ top: 0, behavior: "auto" });
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            selection: { anchor: 0, head: 0 },
            effects: EditorViewModule.scrollIntoView(0, { y: "start" }),
          });
        }
      });
    }
  }, [
    renderedChapter,
    chapterId,
    jumpToHeading,
    jumpToRatio,
    manifest,
    restoredChapterIdRef,
    pendingBookmarkRef,
    pendingNavigationRef,
    handleSearchJump,
    editorViewRef,
    readerRef,
    setNotice,
  ]);

  // Periodic position save
  useEffect(() => {
    if (!manifest || !chapterId) return;
    const handle = window.setTimeout(() => {
      saveCurrentReadingPosition();
    }, 650);
    return () => window.clearTimeout(handle);
  }, [activeHeadingId, chapterId, manifest, saveCurrentReadingPosition]);

  /**
   * Renders the documents either side of the open one, while nothing else needs
   * the thread.
   *
   * The other half of making a document switch instant. The render cache only
   * helps a document that has been opened before, and the common case is moving
   * forward through a folder in order — so the next document is rendered before
   * it is asked for, and opening it hits the cache and swaps in one commit.
   *
   * Deliberately narrow: two neighbours, not a window, and only on an idle
   * callback. Pre-loading more than the reader is likely to reach for would be
   * reading files off disk and rendering them to save a wait that most of them
   * never have.
   */
  const preloadedRef = useRef<Set<string>>(new Set<string>());
  useEffect(() => {
    if (!manifest?.chapters?.length || !chapterId) return;
    const index = manifest.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return;

    const neighbours = [manifest.chapters[index + 1], manifest.chapters[index - 1]].filter(
      (chapter): chapter is (typeof manifest.chapters)[number] =>
        Boolean(chapter?.absolutePath) && !chapter.src.toLowerCase().endsWith(".canvas"),
    );
    if (neighbours.length === 0) return;

    let cancelled = false;

    const run = async () => {
      for (const chapter of neighbours) {
        if (cancelled) return;
        const absolutePath = chapter.absolutePath;
        if (!absolutePath) continue;
        // Asked once per session per file: re-rendering a neighbour every time
        // the reader steps between two documents would undo the saving.
        const seenKey = absolutePath.toLowerCase();
        if (preloadedRef.current.has(seenKey)) continue;
        preloadedRef.current.add(seenKey);

        try {
          const source = await window.bookMDDesktop?.readMarkdownFile(absolutePath);
          if (cancelled || !source?.markdown) continue;
          const rendered = await renderMarkdown(source.markdown, source.baseUrl);
          if (cancelled) continue;
          primeRenderedCache(
            renderedCacheKey({
              absolutePath,
              chapterId: chapter.id,
              sourceLength: source.markdown.length,
              diskVersion: source.diskVersion ?? null,
            }),
            rendered,
          );
        } catch {
          // A neighbour that cannot be read is not a problem: it is a
          // pre-load, and the reader will get the normal error if they open it.
        }
      }
    };

    const handle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void run(), { timeout: 3000 })
        : window.setTimeout(() => void run(), 1200);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle as number);
      }
    };
  }, [manifest, chapterId, primeRenderedCache]);

  return { saveCurrentReadingPosition };
}
