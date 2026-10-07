import { useEffect } from "react";
import { scheduleMermaidWarmUp } from "../services/mermaid";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useChapterLoading } from "./useChapterLoading";
import { useDesktopBridgeSync } from "./useDesktopBridgeSync";
import { useFullscreenSync } from "./useFullscreenSync";

/**
 * The shell's own synchronisation (R1 batch B15).
 *
 * Six pieces of App.tsx that no user action owns: the tab-bar item is not what
 * runs them. They keep one thing in step with another - the window's fullscreen
 * state with the store, "the active tab is chapter X" with "the session holds
 * chapter X", the store's preferences with the main process, a visited chapter
 * with the tab store's history, a fresh notice with its own expiry, and the
 * first mermaid diagram with an API that is already warm.
 *
 * They move together because they are the wiring that has to happen once per
 * mount regardless of what the reader does next, which is also the one class of
 * effect that is easy to lose in a refactor: nothing breaks visibly if the
 * notice stops expiring or the launch path is handled twice.
 *
 * The dependency arrays are now checked, not exempt: App.tsx is still on the
 * per-file `react-hooks/exhaustive-deps` list in eslint.config.mjs, new modules
 * are not. That is what forced the notice effect to say `setNotice` out loud -
 * the store action is created once in the store body, so its identity never
 * changes and the timer starts and stops on exactly the same `notice` values as
 * before. Nothing else was added to a list to make the lint pass.
 */
export function useShellSync(params: UseShellSyncParams) {
  const {
    chapterId,
    rememberVisitedDoc,
    notice,
    setNotice,
    manifestRef,
    session,
    viewMode,
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
    setSecondaryRenderedChapter,
  } = params;

  // Mermaid idle warm-up (profile finding: first render ~400ms of one-off API
  // init vs ~50ms marginal): schedule once at mount so a diagram opened in the
  // normal browsing rhythm never pays the cold path.
  useEffect(() => {
    scheduleMermaidWarmUp();
  }, []);

  // Recording a visit belongs to the store, which owns the de-duplication and
  // the cap as well.
  useEffect(() => {
    if (chapterId) rememberVisitedDoc(chapterId);
  }, [chapterId, rememberVisitedDoc]);

  // A notice dismisses itself. The 4500ms is the toast's contract, not the
  // caller's: whoever sets a message gets the same lifetime.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  // Both directions of the fullscreen sync: the document's own fullscreenchange,
  // and the bridge's initial read (the window may already be fullscreen when the
  // renderer mounts) plus its event. See useFullscreenSync.
  useFullscreenSync();

  // Turning "the active tab is chapter X" into "the session holds chapter X":
  // the loader with its already-loaded short-circuits, the canvas-closes-panels
  // rule, and the dual-split pane's independent load.
  useChapterLoading({
    session,
    viewMode,
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
    setSecondaryRenderedChapter,
  });

  // Native window-frame theme and the hidden-files scan setting (with the
  // re-listing that makes it visible at once). See useDesktopBridgeSync.
  useDesktopBridgeSync({ manifestRef });
}

type LoadingParams = Parameters<typeof useChapterLoading>[0];
type BridgeParams = Parameters<typeof useDesktopBridgeSync>[0];
type TabState = ReturnType<typeof useTabStore.getState>;
type UiState = ReturnType<typeof useUiStore.getState>;

/**
 * The session-driven fields come from `useChapterLoading` itself and the two
 * history/toast fields from the stores that own them, so this wrapper cannot
 * drift from either while App still supplies the values it holds.
 */
type UseShellSyncParams = Pick<
  LoadingParams,
  | "session"
  | "viewMode"
  | "openSession"
  | "setViewMode"
  | "activeLoadedChapterIdRef"
  | "setSecondaryRenderedChapter"
> &
  Pick<BridgeParams, "manifestRef"> & {
    chapterId: TabState["activeTabId"];
    rememberVisitedDoc: TabState["rememberVisitedDoc"];
    notice: UiState["notice"];
    setNotice: UiState["setNotice"];
  };
