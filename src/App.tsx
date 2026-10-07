import { useCallback, useEffect, useRef, useState } from "react";

import { AppOverlays } from "./components/AppOverlays";
import { AppShellChrome } from "./components/AppShellChrome";
import { SidebarRegion } from "./components/SidebarRegion";
import { TabBar } from "./components/TabBar";
import { WorkspaceRouter } from "./components/WorkspaceRouter";
import type { BookManifest, Bookmark, RenderedChapter, SearchResult } from "./core/types";
import { EditorView } from "@codemirror/view";
import { useCommandLayer } from "./hooks/useCommandLayer";
import { useChapterRename } from "./hooks/useChapterRename";
import { useAutoSave, useAutoSaveEnabled } from "./hooks/useAutoSave";
import { useActiveDocument } from "./hooks/useActiveDocument";
import { useColumnResize } from "./hooks/useColumnResize";
import { useDocumentAuthoring } from "./hooks/useDocumentAuthoring";
import { useDocumentOpening } from "./hooks/useDocumentOpening";
import { useShellSync } from "./hooks/useShellSync";
import { useReadingSession } from "./hooks/useReadingSession";
import { useBacklinkIndex } from "./hooks/useBacklinkIndex";
import { useDocumentSession } from "./hooks/useDocumentSession";
import { useTabActions } from "./hooks/useTabActions";
import { useWikiLinkNavigation } from "./hooks/useWikiLinkNavigation";

import { useUiStore } from "./store/useUiStore";
import { useTabStore, type TabMeta } from "./store/useTabStore";
import { useVaultStore } from "./store/useVaultStore";

export function App() {
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

  // ── Vault (useVaultStore · R1 batch B2) ───────────────────────────────────
  //
  // The open folder. Batch B7 moved the bookmark list, the bookmark writer and
  // the read-only search fields into the panel that renders them; B16 followed
  // with the two search setters and the panel's tab/theme reads, because
  // SidebarRegion is what writes a query and clears the active match in the same
  // action. What is left here is the manifest - the shell's own class name and
  // the chapter lookup still read it.
  const manifest = useVaultStore((s) => s.manifest);

  const manifestRef = useRef<BookManifest | null>(manifest);
  manifestRef.current = manifest;

  // ── Tabs (useTabStore · R1 batch B1) ──────────────────────────────────────
  //
  // Same technique as the UI store: these aliases keep the identifiers the
  // useState calls used, so roughly ninety reads of `chapterId` and fifteen
  // `setTabs` call sites needed no change.
  //
  // What did change is that a tab no longer carries a dirty flag. Only the
  // active tab can be dirty — there is a single editing session — so it is
  // derived at render instead (see tabsForDisplay). That removes the effect
  // which used to mirror `isDirty` into this array, and with it the last path
  // by which a keystroke reached tab state.
  const tabs = useTabStore((s) => s.tabs);
  const ensureTab = useTabStore((s) => s.ensureTab);
  const chapterId = useTabStore((s) => s.activeTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const rememberVisitedDoc = useTabStore((s) => s.rememberVisitedDoc);

  const tabsRef = useRef<TabMeta[]>(tabs);
  tabsRef.current = tabs;
  // The comparison pane's rendered content stays here: it is a view artefact
  // produced by loading a second document, not part of what tabs are.
  const [secondaryRenderedChapter, setSecondaryRenderedChapter] = useState<RenderedChapter | null>(
    null,
  );
  const secondaryReaderRef = useRef<HTMLElement | null>(null);
  const isDualSplitMode = Boolean(dualSplitTabId && tabs.some((t) => t.id === dualSplitTabId));

  // ── UI chrome (useUiStore · R1 batch B0) ──────────────────────────────────
  //
  // Layout, overlays and appearance now live in a Zustand store, so this
  // component stops owning state that no other shell logic cares about.
  //
  // The selector names deliberately match the useState identifiers they
  // replace — that is what let the rest of the file stay exactly as it was:
  // every read, every set, including the 14 functional-update call sites. Only
  // the callbacks that hand-rolled localStorage persistence needed edits,
  // because the store owns that now too.
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
  // The chrome-side setters (themes, about, palette, history, typewriter,
  // preferences) and the pane widths the chrome renders are no longer aliased
  // here: AppShellChrome, useAppCommands and useAppActions read the same store
  // fields directly.

  // Where the reader has scrolled to. Stays here because it describes the
  // rendered document, not the vault.
  const [activeHeadingId, setActiveHeadingId] = useState<string | undefined>();

  // Pane widths and the "a divider is being dragged" flag come from the store,
  // which reads and writes the same localStorage keys as the initialisers that
  // used to live here. Dragging them is useColumnResize's job.
  const selectChapterRef = useRef<(id: string) => void>(() => {});

  const {
    session,
    renderedChapter,
    viewMode,
    isDirty,
    isSaving,
    isLargeDocument,
    autoPreviewPaused,
    conflict,
    openSession,
    updateSource,
    renderPreviewNow,
    primeRenderedCache,
    setViewMode,
    saveSession,
    saveSessionAs,
    reloadFromDisk,
    discardChanges,
    clearConflict,
    closeSession,
  } = useDocumentSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Auto-save (2-7): the same saveSession a Ctrl+S runs, AUTOSAVE_DEBOUNCE_MS
  // after the last keystroke. The switch itself - app settings (default ON) and
  // the broadcast that makes the About dialog toggle apply without a restart -
  // moved next to the scheduler in R1 batch B11; see useAutoSaveEnabled.
  const autoSaveEnabled = useAutoSaveEnabled();
  useAutoSave({
    enabled: autoSaveEnabled,
    isDirty,
    isSaving,
    conflictActive: conflict !== null,
    sourceRevision: session?.sourceRevision ?? 0,
    absolutePath: session?.absolutePath ?? null,
    save: () => saveSession(),
  });

  // ── Derived views of the open document (R1 batch B10-A) ───────────────────
  //
  // Five values the shell renders, all pure functions of the inputs below; the
  // reasoning about their dependency arrays lives with them in useActiveDocument.
  // (`activeTab` stays inside the hook - App has no use for it once the chapter
  // lookup moved with it, and eslint is what proved that, not a grep.)
  const { tabsForDisplay, reviewableDocument, activeChapter, activeHeading, activeIndex } =
    useActiveDocument({
      tabs,
      chapterId,
      isDirty,
      session,
      manifest,
      renderedChapter,
      activeHeadingId,
    });

  // ── Column dragging and fitting (R1 batch B3b) ────────────────────────────
  //
  // The first hook out of App.tsx. Its four handlers keep the names the JSX
  // already used, so the two resizer elements below are unchanged. The width
  // stores stay subscribed here because the resizers render their width.
  const {
    handleDirResizeMouseDown,
    handleSidebarResizeMouseDown,
    handleDirDoubleClick,
    handleSidebarDoubleClick,
  } = useColumnResize();

  // ── Opening documents, and the gate that stops it (R1 batch B12) ──────────
  //
  // The folder/file pickers, the three create entry points and the unsaved
  // changes guard were wired in a row right here: one domain, because the guard
  // exists precisely to stop those paths discarding edits. The raw do-open /
  // do-create handlers no longer come back to App at all - only the gate, the
  // two latest-value refs the keyboard and wiki links read, and the dialog's
  // three answers.
  const {
    guardAction,
    guardActionRef,
    openDesktopMarkdownPathRef,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel,
  } = useDocumentOpening({
    openSession,
    pendingBookmarkRef,
    activeLoadedChapterIdRef,
    isDirty,
    saveSession,
    discardChanges,
    setViewMode,
    manifestRef,
    tabsRef,
    absolutePath: session?.absolutePath,
  });

  const selectChapter = useCallback(
    (nextChapterId: string) => {
      const targetChap = manifestRef.current?.chapters.find((c) => c.id === nextChapterId);
      const targetTab = tabsRef.current?.find((t) => t.id === nextChapterId);
      const targetSrc =
        targetChap?.src || targetTab?.relativePath || targetChap?.title || targetTab?.title || "";
      const isCanvas = targetSrc.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        setDirectoryOpen(false);
        setSidebarOpen(false);
        setViewMode("canvas");
      }
      if (nextChapterId === chapterId) return;
      guardAction({ type: "select-chapter", chapterId: nextChapterId });
    },
    [chapterId, guardAction],
  );
  selectChapterRef.current = selectChapter;

  // Keep the active document's tab registered, and its metadata fresh.
  //
  // This was a forty-nine line effect that also mirrored `isDirty` into the tab
  // array — which is what made a keystroke write into tab state, and why the
  // dependency list carried both `isDirty` and `chapterId`. The dirty flag is
  // derived now, so all that remains is registration and renames, and ensureTab
  // returns the untouched state when neither has happened.
  //
  // One thing the old code carried that is worth recording: a guard reading
  // `activeChapter.id === chapterId`. It could never be false — activeChapter is
  // looked up *by* chapterId — so it was dead, and dropping it here is not a
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

  // openDesktopMarkdownPath itself moved into useDocumentOpening above (B12);
  // the other guardAction wrappers and the command bindings that consume them
  // live in the command layer below (useCommandLayer, which calls
  // useAppCommands).

  // ── Where the reader is, and every way to move it (R1 batch B13) ──────────
  //
  // Search, bookmarks, reading-position persistence and the scroll tracker were
  // four calls in four places that feed each other: the bookmark jump uses the
  // search module's jumpToHeading / jumpToRatio, the tracker's scroll idle is
  // what drives the save, and the restore path picks up a queued bookmark or a
  // cross-document navigation. The position saver itself stays inside - its only
  // caller was the tracker.
  const {
    searchResults,
    jumpToHeading,
    clearSearchHighlights,
    handleSearchJump,
    bookmarkedHeadingIds,
    jumpBookmark,
    addBookmark,
  } = useReadingSession({
    session,
    renderedChapter,
    viewMode,
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
    primeRenderedCache,
  });

  // ── Tab-bar actions (R1 batch) ────────────────────────────────────────────
  //
  // The six handlers the tab bar binds: dual split open/close and the four
  // kinds of close. What a close implies for the active tab and the editing
  // session lives in the hook; the store owns the array transforms.
  const {
    handleOpenDualSplit,
    handleCloseDualSplit,
    handleCloseTab,
    handleDetachTab,
    handleCloseOtherTabs,
    handleCloseRightTabs,
  } = useTabActions({ selectChapter, closeSession, activeLoadedChapterIdRef });

  // ── Wiki-link navigation (R1 batch) ──────────────────────────────────────
  //
  // Resolving a `[[wiki link]]` click and the completion list the editor offers
  // — one navigation domain, one hook.
  const { wikiLinkTargets, handleWikiLinkClick } = useWikiLinkNavigation({
    selectChapter,
    jumpToHeading,
    openDesktopMarkdownPathRef,
    pendingNavigationRef,
  });

  // ── Rename, and the features that produce a document (R1 batch) ──────────
  const { handleRenameChapter } = useChapterRename({ session, updateSource, openSession });

  const { handleCreateCanvasExtractNote, handleImportOutline } = useDocumentAuthoring({
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
  });

  // Bookmarks, the reading position and the scroll tracker moved up into
  // useReadingSession with the search helpers they all read (B13).

  // ── The shell's own synchronisation (R1 batch B15) ────────────────────────
  //
  // Fullscreen, "the active tab is chapter X" -> "the session holds chapter X",
  // preferences pushed to the main process, the visit history, the notice
  // expiry and the mermaid warm-up: the wiring that runs once per mount no
  // matter what the reader does next. It sits here because the session values
  // it feeds are ready by now, and every hook that consumes a loaded chapter is
  // called below it.
  useShellSync({
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
  });

  // ── The command layer (R1 batch B14) ──────────────────────────────────────
  //
  // Session actions, the command registrations around them, and the keyboard
  // that runs them through the bus: three calls in a row that were one layer.
  // The launch-handled flag stays inside it, and so does the wiring that hands
  // the print action to the command list - the chrome and the command can no
  // longer be given different print handlers.
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
  });

  // The notice's own expiry moved up into useShellSync with the rest of the
  // once-per-mount wiring (B15), where the dependency list is actually checked.

  // Backlink Index & Mentions
  // backlinkIndex and the vault search index live in useVaultStore alongside the
  // manifest they are derived from.

  // Cooperative idle background index scheduler
  // Guarantees 0ms lag upon opening files or folders, with buttery-smooth 60/120fps UI responsiveness.
  // ── Backlinks and the graph (R1 batch B3b-5) ─────────────────────────────
  //
  // Seven names come back out: the side panel and the graph pane read five of
  // them, and two are needed again further down.
  const {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  } = useBacklinkIndex({
    session,
    activeChapter,
    selectChapter,
    editorViewRef,
    sessionRef,
    openDesktopMarkdownPathRef,
    updateSource,
  });

  const isCanvasActive = Boolean(
    (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) && session,
  );
  const isCanvasFullscreen = isCanvasActive && isFullscreen;

  return (
    <div
      className={`app-shell theme-${preferences.theme} ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}${directoryOpen ? "" : " directory-closed"}${manifest ? "" : " empty-source"}${isFullscreen ? " is-fullscreen" : ""}${isCanvasFullscreen ? " is-canvas-fullscreen" : ""}${isDualSplitMode ? " is-dual-split-mode" : ""}${isReviewFocus ? " is-review-focus" : ""}`}
    >
      {/* Shell chrome — dock, toolbar, directory, status bar. Everything the
          stores own is read inside AppShellChrome; children are the workspace's
          session-driven middle. */}
      <AppShellChrome
        session={session}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isDirty={isDirty}
        isLargeDocument={isLargeDocument}
        activeChapter={activeChapter}
        activeIndex={activeIndex}
        backlinksCount={currentLinkedReferences.length}
        selectChapter={selectChapter}
        handleRenameChapter={handleRenameChapter}
        handleImportOutline={handleImportOutline}
        createNewFile={createNewFile}
        createNewMindmap={createNewMindmap}
        createNewCanvas={createNewCanvas}
        openMarkdownFile={openMarkdownFile}
        openMarkdownDirectory={openMarkdownDirectory}
        toggleFullscreen={toggleFullscreen}
        toggleTypewriterMode={toggleTypewriterMode}
        goPrevious={goPrevious}
        goNext={goNext}
        addBookmark={addBookmark}
        saveSession={saveSession}
        handlePrintDocument={handlePrintDocument}
        handleToggleGraphPane={handleToggleGraphPane}
        handleOpenCommandPalette={handleOpenCommandPalette}
        handleDirResizeMouseDown={handleDirResizeMouseDown}
        handleDirDoubleClick={handleDirDoubleClick}
      >
        {/* The panel decides its own visibility, reads its own tab/theme and
            owns the search box - see SidebarRegion. */}
        <SidebarRegion
          isDualSplitMode={isDualSplitMode}
          isCanvasFullscreen={isCanvasFullscreen}
          session={session}
          renderedChapter={renderedChapter}
          activeHeadingId={activeHeadingId}
          reviewableDocument={reviewableDocument}
          bookmarkedHeadingIds={bookmarkedHeadingIds}
          jumpToHeading={jumpToHeading}
          jumpBookmark={jumpBookmark}
          searchResults={searchResults}
          handleSearchJump={handleSearchJump}
          clearSearchHighlights={clearSearchHighlights}
          openNoteFileRef={openDesktopMarkdownPathRef}
          handleReviewActiveChange={handleReviewActiveChange}
          handleMergeFlashNote={handleMergeFlashNote}
          handleSidebarResizeMouseDown={handleSidebarResizeMouseDown}
          handleSidebarDoubleClick={handleSidebarDoubleClick}
          backlinks={{
            currentDocTitle,
            currentLinkedReferences,
            currentUnlinkedMentions,
            handleJumpToBacklink,
            handleConvertMention,
            graphData,
          }}
        />

        <section className="reader-frame">
          {!isCanvasFullscreen && tabs.length > 0 && (
            <TabBar
              tabs={tabsForDisplay}
              activeTabId={chapterId}
              dualSplitTabId={dualSplitTabId}
              onSelectTab={selectChapter}
              onCloseTab={handleCloseTab}
              onCloseOtherTabs={handleCloseOtherTabs}
              onCloseRightTabs={handleCloseRightTabs}
              onOpenDualSplit={handleOpenDualSplit}
              onCloseDualSplit={handleCloseDualSplit}
              onDetachTab={handleDetachTab}
              isGraphPaneOpen={isGraphPaneOpen}
              onToggleGraphPane={handleToggleGraphPane}
            />
          )}
          <WorkspaceRouter
            session={session}
            activeChapter={activeChapter}
            renderedChapter={renderedChapter}
            secondaryRenderedChapter={secondaryRenderedChapter}
            viewMode={viewMode}
            isDirty={isDirty}
            isSaving={isSaving}
            isLargeDocument={isLargeDocument}
            autoPreviewPaused={autoPreviewPaused}
            isDualSplitMode={isDualSplitMode}
            readerRef={readerRef}
            secondaryReaderRef={secondaryReaderRef}
            editorViewRef={editorViewRef}
            navLockUntilRef={navLockUntilRef}
            updateSource={updateSource}
            renderPreviewNow={renderPreviewNow}
            saveSession={saveSession}
            setViewMode={setViewMode}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            handleCloseDualSplit={handleCloseDualSplit}
            handlePrintDocument={handlePrintDocument}
            handleExtractSelectionToNote={handleExtractSelectionToNote}
            handleSendSelectionToFlash={handleSendSelectionToFlash}
            handleCreateCanvasExtractNote={handleCreateCanvasExtractNote}
            handleWikiLinkClick={handleWikiLinkClick}
            handleJumpToBacklink={handleJumpToBacklink}
            handleToggleMindmap={handleToggleMindmap}
            handleRevealInToc={handleRevealInToc}
            handleOpenBacklinks={() => {
              setSidebarTab("backlinks");
              setSidebarOpen(true);
            }}
            wikiLinkTargets={wikiLinkTargets}
            backlinksCount={currentLinkedReferences.length}
            graph={{ graphData, currentActiveId }}
            handleCloseGraphPane={handleCloseGraphPane}
            onOpenDesktopMarkdownPath={(p) => openDesktopMarkdownPathRef.current?.(p)}
            jumpToHeading={jumpToHeading}
            createNewFile={createNewFile}
            createNewMindmap={createNewMindmap}
            createNewCanvas={createNewCanvas}
            openMarkdownDirectory={openMarkdownDirectory}
          />
        </section>
      </AppShellChrome>

      {/* Floating surfaces — lightbox, guard dialogs, palette, history, about, toast.
          They read the lightbox, open flags, notice and preferences from the
          stores themselves; only the editing session and the actions this
          component orchestrates are passed in. */}
      <AppOverlays
        session={session}
        conflict={conflict}
        activeChapter={activeChapter}
        renderedChapter={renderedChapter}
        commandActions={commandActions}
        onSelectChapter={selectChapter}
        onJumpToHeading={(id) => jumpToHeading(id, "smooth", true)}
        onSavePending={handleDialogSave}
        onDiscardPending={handleDialogDiscard}
        onCancelPending={handleDialogCancel}
        onReloadFromDisk={reloadFromDisk}
        onOverwrite={() => saveSession({ force: true })}
        onSaveAs={saveSessionAs}
        onClearConflict={clearConflict}
        onRevertToContent={handleRevertToContent}
      />
    </div>
  );
}

export default App;
