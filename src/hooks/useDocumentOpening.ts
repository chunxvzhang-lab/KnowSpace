import { useCallback, useEffect, useRef } from "react";
import type { ChapterSource, EditorViewMode } from "../core/types";
import { samePath } from "../core/paths";
import { useDocumentCreation } from "./useDocumentCreation";
import { useUnsavedGuard } from "./useUnsavedGuard";
import { useVaultOpening } from "./useVaultOpening";

/**
 * Opening a document, and the gate that may stop it (R1 batch B12).
 *
 * App.tsx wired three hooks in a row to get here: the pickers that open a file
 * or a folder, the three create entry points, and the unsaved-changes guard
 * that every one of them has to pass through. They are one domain rather than
 * three - the guard exists precisely because those paths discard edits - so the
 * wiring moves as a unit and App keeps only what the shell reads from it.
 *
 * The `doOpen*` / `doCreate*` handlers are deliberately NOT returned. They were
 * only ever consumed by `useUnsavedGuard` two lines below, which is now inside
 * this file: parking them here removes six arguments from App's prop soup and
 * makes it impossible to call a raw, unguarded open by accident.
 *
 * `openDesktopMarkdownPath` moved with them. It is the same gate with a
 * same-file short circuit, and the reason it stayed in App until now was only
 * that a ref had to exist before the hooks consuming it were called - which is
 * true here too, one level up. The two latest-value refs are refreshed in an
 * effect with no dependency array, exactly as they were: the value must be
 * current before any keyboard handler can fire, and re-running a two-line
 * assignment is cheaper than reasoning about which identity changed.
 *
 * Why the refs' effect is now earlier in the commit order: it used to sit after
 * the tab-registration effect and before `useTabActions`; every consumer
 * (wiki links, global shortcuts, the backlink index, the desktop bridge) is
 * called further down, so it still registers before any of their effects read
 * these refs. Nothing reads them during the effect phase itself.
 *
 * This file is not on the `react-hooks/exhaustive-deps` exemption list, so the
 * two dependency arrays below are checked now and were not before - they pass
 * unchanged.
 */
export function useDocumentOpening(params: UseDocumentOpeningParams) {
  const {
    openSession,
    pendingBookmarkRef,
    activeLoadedChapterIdRef,
    isDirty,
    saveSession,
    discardChanges,
    setViewMode,
    manifestRef,
    tabsRef,
    absolutePath,
  } = params;

  const { doOpenMarkdownFile, doOpenDesktopMarkdownPath, doOpenMarkdownDirectory } =
    useVaultOpening({
      openSession,
      setViewMode,
      activeLoadedChapterIdRef,
      pendingBookmarkRef,
    });

  const { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas } = useDocumentCreation({
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
  });

  const { guardAction, handleDialogSave, handleDialogDiscard, handleDialogCancel } =
    useUnsavedGuard({
      isDirty,
      saveSession,
      discardChanges,
      setViewMode,
      manifestRef,
      tabsRef,
      doOpenMarkdownFile,
      doOpenDesktopMarkdownPath,
      doOpenMarkdownDirectory,
      doCreateNewFile,
      doCreateNewMindmap,
      doCreateNewCanvas,
    });

  const openDesktopMarkdownPath = useCallback(
    (
      nextPath: string,
      preloadedSource?: ChapterSource | null,
      options?: { viewMode?: EditorViewMode },
    ) => {
      if (samePath(absolutePath, nextPath)) {
        return;
      }
      guardAction({
        type: "open-desktop-file",
        absolutePath: nextPath,
        preloadedSource,
        viewMode: options?.viewMode,
      });
    },
    [absolutePath, guardAction],
  );

  const openDesktopMarkdownPathRef = useRef(openDesktopMarkdownPath);
  const guardActionRef = useRef(guardAction);

  useEffect(() => {
    openDesktopMarkdownPathRef.current = openDesktopMarkdownPath;
    guardActionRef.current = guardAction;
  });

  return {
    guardAction,
    guardActionRef,
    openDesktopMarkdownPathRef,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel,
  };
}

type VaultParams = Parameters<typeof useVaultOpening>[0];
type CreationParams = Parameters<typeof useDocumentCreation>[0];
type GuardParams = Parameters<typeof useUnsavedGuard>[0];

/**
 * Composed from the hooks this wrapper calls, instead of being written out:
 * a signature drift then shows up as a type error at the call below, not as a
 * silent mismatch between App and the hook it used to wire by hand.
 */
type UseDocumentOpeningParams = Pick<VaultParams, "openSession" | "pendingBookmarkRef"> &
  Pick<CreationParams, "activeLoadedChapterIdRef"> &
  Omit<
    GuardParams,
    | "doOpenMarkdownFile"
    | "doOpenDesktopMarkdownPath"
    | "doOpenMarkdownDirectory"
    | "doCreateNewFile"
    | "doCreateNewMindmap"
    | "doCreateNewCanvas"
  > & {
    /** The session's own path, for the same-file short circuit above. */
    absolutePath: string | null | undefined;
  };
