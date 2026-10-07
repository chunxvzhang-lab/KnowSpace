import { useRef } from "react";

import { useBookmarks } from "./useBookmarks";
import { useReadingPersistence } from "./useReadingPersistence";
import { useReadingTracker } from "./useReadingTracker";
import { useSearch } from "./useSearch";

/**
 * Where the reader is, and every way to move it (R1 batch B13).
 *
 * Four calls App wired by hand, in four places, feeding each other: search
 * produces `jumpToHeading` / `jumpToRatio` that the bookmark jump and the
 * reading-position restore both use; the tracker's scroll idle is what drives
 * the position save; the restore path is what picks up a queued bookmark or a
 * cross-document navigation. Split across the component body, that chain could
 * only be read by scrolling. It is one domain, so it is one call.
 *
 * Two refs moved in with it because nothing outside this domain reads them:
 * `activeHeadingRef` (the heading the tracker last saw, used to tell a real
 * change from a re-render) and `scrollRatioRef` (the ratio a position is saved
 * at). Everything else - the DOM handles the shell renders into, the pending
 * bookmark and pending navigation queues - stays App's, because the workspace,
 * the tab strip and the desktop bridge read them too.
 *
 * `saveCurrentReadingPosition` does not come back out: its only caller was the
 * tracker three lines below, which is now inside this file, so App can no
 * longer call it out of order. `jumpToRatio` stayed in for the same reason -
 * the bookmark jump and the position restore were its only two readers, and a
 * value nobody consumes should not be handed out as an invitation (the rule B10
 * learned from eslint, not from a grep).
 *
 * Order kept: search, bookmarks, persistence, tracker. The persistence hook's
 * own note said it must sit before the tracker - that still holds here, and the
 * tracker now also sits after every producer it reports into.
 */
export function useReadingSession(params: UseReadingSessionParams) {
  const {
    session,
    renderedChapter,
    viewMode,
    editorViewRef,
    readerRef,
    selectChapterRef,
    setActiveHeadingId,
    navLockUntilRef,
    pendingNavigationRef,
    activeChapter,
    activeHeading,
    selectChapter,
    pendingBookmarkRef,
    chapterId,
    activeHeadingId,
    restoredChapterIdRef,
    primeRenderedCache,
  } = params;

  const activeHeadingRef = useRef<string | undefined>(undefined);
  const scrollRatioRef = useRef(0);

  const { searchResults, jumpToHeading, jumpToRatio, clearSearchHighlights, handleSearchJump } =
    useSearch({
      renderedChapter,
      session,
      viewMode,
      editorViewRef,
      readerRef,
      selectChapterRef,
      setActiveHeadingId,
      navLockUntilRef,
      pendingNavigationRef,
    });

  const { bookmarkedHeadingIds, jumpBookmark, addBookmark } = useBookmarks({
    renderedChapter,
    activeChapter,
    activeHeading,
    selectChapter,
    jumpToHeading,
    jumpToRatio,
    readerRef,
    scrollRatioRef,
    pendingBookmarkRef,
  });

  const { saveCurrentReadingPosition } = useReadingPersistence({
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
  });

  useReadingTracker({
    containerRef: readerRef,
    headings: renderedChapter?.headings ?? [],
    activeHeadingRef,
    scrollRatioRef,
    onActiveHeadingChange: setActiveHeadingId,
    onScrollIdle: saveCurrentReadingPosition,
    navLockUntilRef,
  });

  return {
    searchResults,
    jumpToHeading,
    clearSearchHighlights,
    handleSearchJump,
    bookmarkedHeadingIds,
    jumpBookmark,
    addBookmark,
  };
}

type SearchParams = Parameters<typeof useSearch>[0];
type BookmarkParams = Parameters<typeof useBookmarks>[0];
type PersistenceParams = Parameters<typeof useReadingPersistence>[0];

/**
 * Every field is picked from the hook that actually consumes it, so a signature
 * change in a leaf hook is a type error here rather than a silent argument
 * mismatch. The values this domain produces itself - the search jump helpers,
 * the position saver, the two refs above - are simply not in the type, which is
 * what stops a caller passing a stale copy of them in.
 */
type UseReadingSessionParams = Pick<
  SearchParams,
  | "session"
  | "renderedChapter"
  | "viewMode"
  | "editorViewRef"
  | "readerRef"
  | "selectChapterRef"
  | "setActiveHeadingId"
  | "navLockUntilRef"
  | "pendingNavigationRef"
> &
  Pick<BookmarkParams, "activeChapter" | "activeHeading" | "selectChapter" | "pendingBookmarkRef"> &
  Pick<
    PersistenceParams,
    "chapterId" | "activeHeadingId" | "restoredChapterIdRef" | "primeRenderedCache"
  >;
