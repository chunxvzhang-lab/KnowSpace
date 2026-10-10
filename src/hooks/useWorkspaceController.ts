import { useRef, useState } from "react";

import type { BookManifest, Bookmark, RenderedChapter, SearchResult } from "../core/types";
import { EditorView } from "@codemirror/view";
import { useActiveDocument } from "./useActiveDocument";
import { useAutoSave, useAutoSaveEnabled } from "./useAutoSave";
import { useBacklinkIndex } from "./useBacklinkIndex";
import { useChapterRename } from "./useChapterRename";
import { useChapterSelection } from "./useChapterSelection";
import { useColumnResize } from "./useColumnResize";
import { useCommandLayer } from "./useCommandLayer";
import { useDocumentAuthoring } from "./useDocumentAuthoring";
import { useDocumentOpening } from "./useDocumentOpening";
import { useDocumentSession } from "./useDocumentSession";
import { useReadingSession } from "./useReadingSession";
import { useShellSync } from "./useShellSync";
import { useTabActions } from "./useTabActions";
import { useWikiLinkNavigation } from "./useWikiLinkNavigation";

import { useUiStore } from "../store/useUiStore";
import { useTabStore, type TabMeta } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * The workspace controller (R1 batch B19, the S4 step).
 *
 * Everything App.tsx used to orchestrate lives here: the shell's refs, the three
 * store subscriptions that are genuinely shell-level, and the twelve domain
 * hooks that B7-B18 moved out one at a time. `App` is now the *view* - it reads
 * this bag and renders it. That is the split the batches were walking toward;
 * doing it as one move is what the per-batch cap made impossible, which is why
 * it needed a decision rather than another slice.
 *
 * Why a hook and not a component with a context: the wiring has exactly one
 * consumer (App's JSX) and one owner (the App instance). A provider would add a
 * mechanism to solve a problem that does not exist yet, and it would make the
 * value's identity a thing to reason about. A plain returned object is the same
 * re-render contract the props had one line above it, so nothing about *when*
 * something renders changes - only where the wiring is written.
 *
 * Hook order is copied verbatim from App.tsx: session, auto-save, derived views,
 * column resize, opening/gate, chapter selection, reading session, tab actions,
 * wiki links, rename, authoring, shell sync, command layer, backlinks, canvas
 * flags. No call moved past another one, so every effect still registers in the
 * same sequence. This file is not on the exhaustive-deps exemption list, and it
 * needs no exemption: it declares no effect or callback of its own - the only
 * imperative bits are the render-phase ref mirrors, which came over unchanged.
 *
 * Three handlers were built in JSX before; they are functions here now, because
 * a view should not contain logic that a reader has to re-derive (each is still
 * re-created per render, exactly as the inline arrow was):
 * `openNoteFile` (the guard-wrapped desktop open), `handleOpenBacklinks` (which
 * tab the panel shows and whether it is up), and the forced save the conflict
 * dialog's "overwrite" runs.
 */
export function useWorkspaceController() {
  const readerRef = useRef<HTMLElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pendingBookmarkRef = useRef<Bookmark | null>(null);
  const pendingNavigationRef = useRef<{
    headingId?: string;
    lineNumber?: number;
    highlight?: boolean;
    searchResult?: SearchResult;
  } | null>(null);
  const activeLoadedChapterIdRef = useRef<string>("");
  const restoredChapterIdRef = useRef<string | null>(null);
  const navLockUntilRef = useRef<number>(0);

  // ── Vault (useVaultStore) ─────────────────────────────────────────────────
  //
  // B7 moved the bookmark list and the read-only search fields out of the shell,
  // B16 followed with the panel's tab/theme reads and its query setters: each
  // value now lives in the component that renders it (see SidebarRegion). What is
  // left is the manifest - the shell's class name and the chapter lookup read it,
  // and the migration rationale is written down once, in the store's header.
  const manifest = useVaultStore((s) => s.manifest);

  const manifestRef = useRef<BookManifest | null>(manifest);
  manifestRef.current = manifest;

  // ── Tabs (useTabStore) ────────────────────────────────────────────────────
  //
  // These selectors keep the identifiers the old useState calls used, which is
  // what let the rest of the file stay as it was. A tab carries no dirty flag:
  // only the active tab can be dirty, so it is derived at render (see
  // tabsForDisplay) - both decisions are recorded in useTabStore's header.
  const tabs = useTabStore((s) => s.tabs);
  const ensureTab = useTabStore((s) => s.ensureTab);
  const chapterId = useTabStore((s) => s.activeTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const rememberVisitedDoc = useTabStore((s) => s.rememberVisitedDoc);

  const tabsRef = useRef<TabMeta[]>(tabs);
  tabsRef.current = tabs;
  // The comparison pane's rendered content is a view artefact produced by
  // loading a second document, not part of what tabs are - so it stays state
  // here rather than joining the tab store.
  const [secondaryRenderedChapter, setSecondaryRenderedChapter] = useState<RenderedChapter | null>(
    null,
  );
  const secondaryReaderRef = useRef<HTMLElement | null>(null);
  const isDualSplitMode = Boolean(dualSplitTabId && tabs.some((t) => t.id === dualSplitTabId));

  // ── UI chrome (useUiStore) ────────────────────────────────────────────────
  //
  // Layout, overlays and appearance live in the store; only the fields the shell
  // renders or passes on are subscribed here, and the chrome setters that no
  // shell logic reads were dropped in B0/B16 (see useUiStore's header for the
  // migration and the localStorage it took over).
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const directoryOpen = useUiStore((s) => s.directoryOpen);
  const isFullscreen = useUiStore((s) => s.isFullscreen);
  const notice = useUiStore((s) => s.notice);
  const preferences = useUiStore((s) => s.preferences);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const isReviewFocus = useUiStore((s) => s.isReviewFocus);

  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setNotice = useUiStore((s) => s.setNotice);

  // Where the reader has scrolled to. It describes the rendered document, not
  // the vault, so it is state here rather than a store field.
  const [activeHeadingId, setActiveHeadingId] = useState<string | undefined>();

  const selectChapterRef = useRef<(id: string) => void>(() => {});

  // The editing session is one object, not nineteen aliases: the views read
  // fields off it, and handing the object around is what let B19 drop the alias
  // block from the shell.
  const doc = useDocumentSession();
  const sessionRef = useRef(doc.session);
  sessionRef.current = doc.session;

  // Auto-save (2-7): the same saveSession a Ctrl+S runs, AUTOSAVE_DEBOUNCE_MS
  // after the last keystroke. The switch itself - app settings (default ON) and
  // the broadcast that makes the About dialog toggle apply without a restart -
  // moved next to the scheduler in R1 batch B11; see useAutoSaveEnabled.
  const autoSaveEnabled = useAutoSaveEnabled();
  useAutoSave({
    enabled: autoSaveEnabled,
    isDirty: doc.isDirty,
    isSaving: doc.isSaving,
    conflictActive: doc.conflict !== null,
    sourceRevision: doc.session?.sourceRevision ?? 0,
    absolutePath: doc.session?.absolutePath ?? null,
    save: () => doc.saveSession(),
  });

  // ── Derived views of the open document (R1 batch B10-A) ───────────────────
  //
  // Five pure functions of the inputs below; the reasoning about their
  // dependency arrays - and why `activeTab` stays inside - lives with them in
  // useActiveDocument.
  const { tabsForDisplay, reviewableDocument, activeChapter, activeHeading, activeIndex } =
    useActiveDocument({
      tabs,
      chapterId,
      isDirty: doc.isDirty,
      session: doc.session,
      manifest,
      renderedChapter: doc.renderedChapter,
      activeHeadingId,
    });

  // ── Column dragging and fitting (useColumnResize) ─────────────────────────
  //
  // Its handlers keep the names the JSX already bound; the width state and the
  // drag/fit bounds live with the hook. Called once, here: the hook holds a
  // single window-level drag listener, and a second instance would answer the
  // same drag twice.
  const {
    handleDirResizeMouseDown,
    handleSidebarResizeMouseDown,
    handleDirDoubleClick,
    handleSidebarDoubleClick,
  } = useColumnResize();

  // ── Opening documents, and the gate that stops it (R1 batch B12) ──────────
  const {
    guardAction,
    guardActionRef,
    openDesktopMarkdownPathRef,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel,
  } = useDocumentOpening({
    openSession: doc.openSession,
    pendingBookmarkRef,
    activeLoadedChapterIdRef,
    isDirty: doc.isDirty,
    saveSession: doc.saveSession,
    discardChanges: doc.discardChanges,
    setViewMode: doc.setViewMode,
    manifestRef,
    tabsRef,
    absolutePath: doc.session?.absolutePath,
  });

  // ── Choosing a chapter, and the tab that follows (R1 batch B18) ───────────
  const { selectChapter } = useChapterSelection({
    chapterId,
    activeChapter,
    guardAction,
    ensureTab,
    manifestRef,
    tabsRef,
    setDirectoryOpen,
    setSidebarOpen,
    setViewMode: doc.setViewMode,
    selectChapterRef,
  });

  // ── Where the reader is, and every way to move it (R1 batch B13) ──────────
  const {
    searchResults,
    jumpToHeading,
    clearSearchHighlights,
    handleSearchJump,
    bookmarkedHeadingIds,
    jumpBookmark,
    addBookmark,
  } = useReadingSession({
    session: doc.session,
    renderedChapter: doc.renderedChapter,
    viewMode: doc.viewMode,
    chapterId,
    activeChapter,
    activeHeading,
    activeHeadingId,
    selectChapter,
    setActiveHeadingId,
    readerRef,
    editorViewRef,
    selectChapterRef,
    navLockUntilRef,
    pendingBookmarkRef,
    pendingNavigationRef,
    restoredChapterIdRef,
    primeRenderedCache: doc.primeRenderedCache,
  });

  // ── Tab-bar actions ───────────────────────────────────────────────────────
  const {
    handleOpenDualSplit,
    handleCloseDualSplit,
    handleCloseTab,
    handleDetachTab,
    handleCloseOtherTabs,
    handleCloseRightTabs,
  } = useTabActions({
    selectChapter,
    closeSession: doc.closeSession,
    activeLoadedChapterIdRef,
  });

  // ── Wiki-link navigation ─────────────────────────────────────────────────
  const { wikiLinkTargets, handleWikiLinkClick } = useWikiLinkNavigation({
    selectChapter,
    jumpToHeading,
    openDesktopMarkdownPathRef,
    pendingNavigationRef,
  });

  // ── Rename, and the features that produce a document ─────────────────────
  const { handleRenameChapter } = useChapterRename({
    session: doc.session,
    updateSource: doc.updateSource,
    openSession: doc.openSession,
  });

  const { handleCreateCanvasExtractNote, handleImportOutline } = useDocumentAuthoring({
    openSession: doc.openSession,
    setViewMode: doc.setViewMode,
    activeLoadedChapterIdRef,
  });

  // ── The shell's own synchronisation (R1 batch B15) ────────────────────────
  useShellSync({
    chapterId,
    rememberVisitedDoc,
    notice,
    setNotice,
    manifestRef,
    session: doc.session,
    viewMode: doc.viewMode,
    openSession: doc.openSession,
    setViewMode: doc.setViewMode,
    activeLoadedChapterIdRef,
    setSecondaryRenderedChapter,
  });

  // ── The command layer (R1 batch B14) ──────────────────────────────────────
  const {
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
  } = useCommandLayer({
    session: doc.session,
    setViewMode: doc.setViewMode,
    updateSource: doc.updateSource,
    renderPreviewNow: doc.renderPreviewNow,
    saveSession: doc.saveSession,
    activeChapter,
    editorViewRef,
    guardAction,
    saveSessionAs: doc.saveSessionAs,
    addBookmark,
    selectChapter,
    manifest,
    activeIndex,
    openDesktopMarkdownPathRef,
    guardActionRef,
    handleCloseDualSplit,
    handleCloseTab,
  });

  // ── Backlinks and the graph (B3b-5) ───────────────────────────────────────
  const {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  } = useBacklinkIndex({
    session: doc.session,
    activeChapter,
    selectChapter,
    editorViewRef,
    sessionRef,
    openDesktopMarkdownPathRef,
    updateSource: doc.updateSource,
  });

  const isCanvasActive = Boolean(
    (doc.viewMode === "canvas" || doc.session?.fileName?.toLowerCase().endsWith(".canvas")) &&
    doc.session,
  );
  const isCanvasFullscreen = isCanvasActive && isFullscreen;

  // The three handlers the shell used to build inline in its JSX. Same bodies,
  // same per-render identity, no longer a thing a reader of the view has to
  // interpret: the view says `openNoteFile`, and this is what that means.
  const openNoteFile = (filePath: string) => {
    openDesktopMarkdownPathRef.current?.(filePath);
  };
  // A flash card's double click: the note opens on the reader page. The open
  // path leaves the sidebar untouched, so the timeline the click came from
  // stays exactly where it is.
  const openNoteInReader = (filePath: string) => {
    openDesktopMarkdownPathRef.current?.(filePath, null, { viewMode: "read" });
  };
  // The timeline just toggled a todo inside a flash note — the file on disk
  // changed behind the reader's back. If that very note is open and has no
  // unsaved edits, re-read it so the preview shows the new checkbox state;
  // with unsaved edits the reader's text wins and the refresh is skipped
  // rather than silently overwriting their work.
  const handleFlashNoteFileChanged = (filePath: string) => {
    const activePath = doc.session?.absolutePath;
    if (!activePath) return;
    if (activePath.toLowerCase() !== filePath.toLowerCase()) return;
    if (doc.isDirty) return;
    doc.reloadFromDisk();
  };
  // 阅读视图里点击任务复选框：定位与翻转在会话层完成（干净时立刻落盘，
  // 磁盘随即经主进程广播回到闪念时间线）。
  const handleToggleTaskInReader = (blockStartLine: number, withinBlockIndex: number) => {
    void doc.toggleTaskAtSourceLine(blockStartLine, withinBlockIndex);
  };
  const handleOpenBacklinks = () => {
    setSidebarTab("backlinks");
    setSidebarOpen(true);
  };
  const saveSessionOverwriting = () => doc.saveSession({ force: true });

  return {
    // The editing session, as one object.
    doc,
    // Shell DOM and imperative handles the views write into.
    readerRef,
    secondaryReaderRef,
    editorViewRef,
    navLockUntilRef,
    // Tab strip and the open document.
    tabs,
    tabsForDisplay,
    chapterId,
    dualSplitTabId,
    isDualSplitMode,
    activeChapter,
    activeIndex,
    reviewableDocument,
    secondaryRenderedChapter,
    manifest,
    // Chrome the shell class name and the panes read.
    preferences,
    sidebarOpen,
    directoryOpen,
    isFullscreen,
    isGraphPaneOpen,
    isReviewFocus,
    isCanvasFullscreen,
    activeHeadingId,
    // Reading and navigation.
    searchResults,
    jumpToHeading,
    jumpBookmark,
    bookmarkedHeadingIds,
    handleSearchJump,
    clearSearchHighlights,
    openNoteFile,
    openNoteInReader,
    handleFlashNoteFileChanged,
    handleToggleTaskInReader,
    selectChapter,
    // Tab actions.
    handleOpenDualSplit,
    handleCloseDualSplit,
    handleCloseTab,
    handleDetachTab,
    handleCloseOtherTabs,
    handleCloseRightTabs,
    // Wiki links, rename, authoring.
    wikiLinkTargets,
    handleWikiLinkClick,
    handleRenameChapter,
    handleCreateCanvasExtractNote,
    handleImportOutline,
    // The command layer.
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
    addBookmark,
    // The unsaved-changes dialog's three answers and the conflict paths.
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel,
    saveSessionOverwriting,
    // Backlinks and the graph.
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
    handleOpenBacklinks,
    // Column resizing.
    handleDirResizeMouseDown,
    handleSidebarResizeMouseDown,
    handleDirDoubleClick,
    handleSidebarDoubleClick,
  };
}
