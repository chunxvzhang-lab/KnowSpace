import { useRef } from "react";

import { useAppActions } from "./useAppActions";
import { useAppCommands } from "./useAppCommands";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

/**
 * The command layer (R1 batch B14).
 *
 * Three hooks that App.tsx called in a row and that are one layer, not three:
 * the session actions the palette and the chrome bind (print, extract-to-note,
 * flash capture, mindmap toggle, TOC reveal, flash merge, review focus, history
 * revert), the command registrations those actions are wrapped into (the open /
 * create entry points, the palette list, the navigation and appearance
 * callbacks), and the keyboard that executes them through the bus. Splitting
 * them across the component body made it possible - and App did it - to wire a
 * handler in one of the three and forget that another one was the entry point.
 *
 * What does not come back out is `initialHandledRef` - the "launch file has
 * already been handled this session" flag. Its only reader is the shell wiring,
 * which is inside this file, and a flag that exists to be read once per mount
 * should not be threaded through App to get there.
 *
 * `handlePrintDocument` does come back out (the toolbar renders it), but it is
 * produced *here* and handed to `useAppCommands` here as well: the command
 * registration can no longer be passed a different print handler than the one
 * the chrome calls, which is the kind of drift this layer used to be able to
 * grow.
 *
 * Order kept: actions, then commands (they consume the actions), then the
 * keyboard (it executes the commands). The hooks that were called between them
 * in App - the fullscreen sync, chapter loading, the desktop bridge, the notice
 * timer - own no part of this layer, so moving the three calls next to each
 * other registers the command bindings a few effects earlier in the commit and
 * changes nothing else.
 */
type ActionsParams = Parameters<typeof useAppActions>[0];
type CommandsParams = Parameters<typeof useAppCommands>[0];
type ShortcutsParams = Parameters<typeof useGlobalShortcuts>[0];

export function useCommandLayer(params: UseCommandLayerParams) {
  const {
    session,
    setViewMode,
    updateSource,
    renderPreviewNow,
    saveSession,
    activeChapter,
    editorViewRef,
    guardAction,
    saveSessionAs,
    addBookmark,
    selectChapter,
    manifest,
    activeIndex,
    openDesktopMarkdownPathRef,
    guardActionRef,
    handleCloseDualSplit,
    handleCloseTab,
  } = params;

  const initialHandledRef = useRef(false);

  const {
    handleReviewActiveChange,
    handlePrintDocument,
    handleExtractSelectionToNote,
    handleSendSelectionToFlash,
    handleToggleMindmap,
    handleRevealInToc,
    handleMergeFlashNote,
    handleRevertToContent,
  } = useAppActions({
    session,
    setViewMode,
    updateSource,
    renderPreviewNow,
    saveSession,
    activeChapter,
    editorViewRef,
  });

  const {
    handleOpenCommandPalette,
    handleToggleGraphPane,
    handleCloseGraphPane,
    openMarkdownFile,
    openMarkdownDirectory,
    createNewFile,
    createNewMindmap,
    createNewCanvas,
    goPrevious,
    goNext,
    toggleTypewriterMode,
    toggleFullscreen,
    commandActions,
  } = useAppCommands({
    guardAction,
    setViewMode,
    saveSession,
    saveSessionAs,
    addBookmark,
    selectChapter,
    manifest,
    activeIndex,
    handlePrintDocument,
  });

  useGlobalShortcuts({
    initialHandledRef,
    openDesktopMarkdownPathRef,
    guardActionRef,
    handleCloseDualSplit,
    handleCloseTab,
    selectChapter,
  });

  return {
    handleReviewActiveChange,
    handlePrintDocument,
    handleExtractSelectionToNote,
    handleSendSelectionToFlash,
    handleToggleMindmap,
    handleRevealInToc,
    handleMergeFlashNote,
    handleRevertToContent,
    handleOpenCommandPalette,
    handleToggleGraphPane,
    handleCloseGraphPane,
    openMarkdownFile,
    openMarkdownDirectory,
    createNewFile,
    createNewMindmap,
    createNewCanvas,
    goPrevious,
    goNext,
    toggleTypewriterMode,
    toggleFullscreen,
    commandActions,
  };
}

/**
 * Picked from the three hooks above, one field per consumer, so a signature
 * change in a leaf hook is a type error here rather than a mismatch between App
 * and the wiring it used to do by hand. `handlePrintDocument` is deliberately
 * absent: this file produces it.
 */
type UseCommandLayerParams = Pick<
  ActionsParams,
  | "session"
  | "setViewMode"
  | "updateSource"
  | "renderPreviewNow"
  | "saveSession"
  | "activeChapter"
  | "editorViewRef"
> &
  Pick<
    CommandsParams,
    "guardAction" | "saveSessionAs" | "addBookmark" | "selectChapter" | "manifest" | "activeIndex"
  > &
  Pick<
    ShortcutsParams,
    "openDesktopMarkdownPathRef" | "guardActionRef" | "handleCloseDualSplit" | "handleCloseTab"
  >;
