import { useCallback, useEffect } from "react";

import type { BookManifest, ChapterManifest, EditorViewMode } from "../core/types";
import type { TabMeta } from "../store/useTabStore";
import type { PendingAction } from "./useUnsavedGuard";

/**
 * Choosing a chapter, and keeping the tab strip honest about it (R1 batch B18).
 *
 * The last two pieces of imperative wiring App.tsx owned: `selectChapter` (the
 * one entry point every tab click, palette result, keyboard shortcut and
 * backlink jump funnels through) and the effect that registers the document that
 * choice produced. They are one concern - "the reader picked a chapter, now the
 * session and the tab list have to agree" - and moving them is what emptied
 * App.tsx of effects and callbacks.
 *
 * Why `selectChapter` cannot live in a store: it reads the `chapterId` of the
 * render it was created in and the guard of that same moment. It is a
 * component-scoped callback, not a store action.
 *
 * The dependency array is complete, and saying so is the point. App.tsx sits on
 * the per-file `react-hooks/exhaustive-deps` exemption in eslint.config.mjs, so
 * this callback had never been checked; here it is. Three setters were missing -
 * `setDirectoryOpen`, `setSidebarOpen`, `setViewMode` - and listing them is not
 * a behaviour change, because all three are stable identities: the first two are
 * Zustand actions created once in the store body, and `setViewMode` is
 * `handleSetViewMode`, whose chain is `useCallback([triggerRender])` ->
 * `useCallback([rememberRendered])` -> `useCallback([])`. A value that never
 * changes identity can be listed without the callback ever re-forming. Nothing
 * was disabled and nothing was added to make the rule pass: this is the code
 * half of lifting the exemption.
 *
 * `manifestRef` and `tabsRef` are listed for the same rule and a different
 * reason - the rule cannot see through a parameter to know it holds a ref, so a
 * `.current` read asks for the object itself. They are `useRef` results in App,
 * so listing them costs nothing; a caller that handed over a fresh object every
 * render would only pay a re-formed callback, which is extra renders, never a
 * wrong navigation.
 */
export function useChapterSelection(params: UseChapterSelectionParams) {
  const {
    chapterId,
    activeChapter,
    guardAction,
    ensureTab,
    manifestRef,
    tabsRef,
    setDirectoryOpen,
    setSidebarOpen,
    setViewMode,
    selectChapterRef,
  } = params;

  const selectChapter = useCallback(
    (nextChapterId: string) => {
      const targetChap = manifestRef.current?.chapters.find((c) => c.id === nextChapterId);
      const targetTab = tabsRef.current?.find((t) => t.id === nextChapterId);
      const targetSrc =
        targetChap?.src || targetTab?.relativePath || targetChap?.title || targetTab?.title || "";
      const isCanvas = targetSrc.toLowerCase().endsWith(".canvas");
      // A canvas owns the whole middle pane, so the directory and the side panel
      // are closed and the view is switched before anything is parked. That
      // ordering is how it was in App.tsx and is kept deliberately: switching
      // the chrome for a canvas is not itself a navigation, so it must not wait
      // behind the unsaved-changes guard - and it still applies when the reader
      // clicks the tab they are already on.
      if (isCanvas) {
        setDirectoryOpen(false);
        setSidebarOpen(false);
        setViewMode("canvas");
      }
      if (nextChapterId === chapterId) return;
      guardAction({ type: "select-chapter", chapterId: nextChapterId });
    },
    [chapterId, guardAction, manifestRef, tabsRef, setDirectoryOpen, setSidebarOpen, setViewMode],
  );

  // A render-phase write, kept in the hook that owns the callback: the ref is
  // how hooks registered *before* this one (search takes selectChapterRef) and
  // components mounted later both reach the latest version, without App
  // threading a sixteen-prop hand-off.
  selectChapterRef.current = selectChapter;

  // Keep the active document's tab registered, and its metadata fresh.
  //
  // This was a forty-nine line effect that also mirrored `isDirty` into the tab
  // array - which is what made a keystroke write into tab state, and why the
  // dependency list carried both `isDirty` and `chapterId`. The dirty flag is
  // derived now (see useTabStore), so all that remains is registration and
  // renames, and ensureTab returns the untouched state when neither happened.
  //
  // One thing the old code carried that is worth recording: a guard reading
  // `activeChapter.id === chapterId`. It could never be false - activeChapter is
  // looked up *by* chapterId - so it was dead, and dropping it here is not a
  // behaviour change.
  useEffect(() => {
    if (!activeChapter) return;
    ensureTab({
      id: activeChapter.id,
      title: activeChapter.title,
      relativePath: activeChapter.src,
      absolutePath: activeChapter.absolutePath,
    });
  }, [activeChapter, ensureTab]);

  return { selectChapter };
}

/**
 * Refs are typed structurally (`{ current: T }`) rather than as
 * `MutableRefObject`, the way the other migrated hooks do it, so the signature
 * does not depend on which React version's ref typings the project is on.
 */
type UseChapterSelectionParams = {
  /** The tab the reader is on - App's alias for the tab store's active id. */
  chapterId: string;
  activeChapter: ChapterManifest | undefined;
  guardAction: (action: PendingAction) => void;
  ensureTab: (tab: TabMeta) => void;
  manifestRef: { current: BookManifest | null };
  tabsRef: { current: TabMeta[] };
  setDirectoryOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  selectChapterRef: { current: (id: string) => void };
};
