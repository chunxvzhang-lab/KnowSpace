import { useCallback, useMemo } from "react";
import { createBookmark, resolveBookmark } from "../services/bookmarks";
import { extractExcerpt } from "../services/markdown";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { Bookmark, ChapterManifest, Heading, RenderedChapter } from "../core/types";

/**
 * Bookmarks: which heading in the open chapter carries one, jumping to a saved
 * one, and saving a new one.
 *
 * Seventh logic hook out of App.tsx (R1 batch B3b-7) and the last of the batch.
 * It spans two regions of the component — the memo marking bookmarked headings
 * and the two callbacks — which is the same shape the search batch had, and for
 * the same reason: the callbacks are what the JSX reaches for, and the memo
 * exists to feed the outline.
 *
 * Seven things travel in. The interesting one is \`pendingBookmarkRef\`: a
 * bookmark pointing at another chapter cannot be resolved until that chapter has
 * loaded, so the jump stores it in a ref and the reading-position restore in
 * App.tsx picks it up afterwards. That ref is therefore shared rather than owned
 * here. \`jumpToHeading\` and \`jumpToRatio\` come from useSearch, because a
 * bookmark resolves to one or the other.
 */

type UseBookmarksParams = {
  renderedChapter: RenderedChapter | null;
  activeChapter?: ChapterManifest;
  activeHeading?: Heading;
  selectChapter: (chapterId: string) => void;
  jumpToHeading: (headingId: string, behavior?: ScrollBehavior, highlight?: boolean) => void;
  jumpToRatio: (ratio: number) => void;
  readerRef: { current: HTMLElement | null };
  /** Where the reader has scrolled to, read when saving a bookmark. */
  scrollRatioRef: { current: number };
  /** A bookmark waiting for its chapter to load, shared with the restore effect. */
  pendingBookmarkRef: { current: Bookmark | null };
};

export function useBookmarks({
  renderedChapter,
  activeChapter,
  activeHeading,
  selectChapter,
  jumpToHeading,
  jumpToRatio,
  readerRef,
  scrollRatioRef,
  pendingBookmarkRef,
}: UseBookmarksParams) {
  const bookmarks = useVaultStore((s) => s.bookmarks);
  const manifest = useVaultStore((s) => s.manifest);
  const persistBookmarks = useVaultStore((s) => s.persistBookmarks);
  const setNotice = useUiStore((s) => s.setNotice);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const chapterId = useTabStore((s) => s.activeTabId);

  /** Heading ids in the open chapter that already carry a bookmark. */
  const bookmarkedHeadingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bookmark of bookmarks) {
      if (bookmark.chapterId === chapterId && bookmark.headingId) {
        ids.add(bookmark.headingId);
      }
    }
    return ids;
  }, [bookmarks, chapterId]);

  const jumpBookmark = useCallback(
    (bookmark: Bookmark) => {
      if (bookmark.chapterId !== chapterId) {
        // Another chapter: remember it and go there. The restore effect in
        // App.tsx resolves it once that chapter has loaded.
        pendingBookmarkRef.current = bookmark;
        selectChapter(bookmark.chapterId);
        return;
      }
      pendingBookmarkRef.current = null;
      if (!renderedChapter) return;
      const resolution = resolveBookmark(bookmark, renderedChapter.headings, renderedChapter.checksum);
      if (resolution.message) setNotice(resolution.message);
      if (resolution.targetHeadingId) {
        jumpToHeading(resolution.targetHeadingId, "smooth", true);
      } else {
        jumpToRatio(resolution.scrollRatio);
      }
    },
    [
      renderedChapter,
      chapterId,
      jumpToHeading,
      jumpToRatio,
      selectChapter,
      pendingBookmarkRef,
      setNotice,
    ]
  );

  const addBookmark = useCallback(() => {
    if (!manifest || !renderedChapter || !chapterId || !readerRef.current) return;
    const bookmark = createBookmark({
      bookId: manifest.id,
      chapterId,
      chapterSrc: activeChapter?.src,
      activeHeading,
      scrollRatio: scrollRatioRef.current,
      excerpt: extractExcerpt(readerRef.current, activeHeading?.id),
      chapterChecksum: renderedChapter.checksum,
    });
    persistBookmarks([bookmark, ...bookmarks]);
    setSidebarOpen(true);
    setSidebarTab("toc");
    setNotice("书签已保存。");
  }, [
    activeChapter?.src,
    activeHeading,
    bookmarks,
    chapterId,
    manifest,
    persistBookmarks,
    renderedChapter,
    readerRef,
    scrollRatioRef,
    setNotice,
    setSidebarOpen,
    setSidebarTab,
  ]);

  return { bookmarkedHeadingIds, jumpBookmark, addBookmark };
}
