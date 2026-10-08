import { AppOverlays } from "./components/AppOverlays";
import { AppShellChrome } from "./components/AppShellChrome";
import { SidebarRegion } from "./components/SidebarRegion";
import { TabBar } from "./components/TabBar";
import { WorkspaceRouter } from "./components/WorkspaceRouter";
import { useWorkspaceController } from "./hooks/useWorkspaceController";

/**
 * The shell view (R1 batch B19).
 *
 * App.tsx is the reading application's outermost component, and after twenty-odd
 * batches of extraction it had become a file that did two jobs at once: it
 * orchestrated about a dozen hooks *and* assembled the four regions that render
 * them. The orchestration moved into `useWorkspaceController` (one file, one job,
 * hook order copied verbatim); what is left here is the assembly - which is what
 * a component is supposed to be.
 *
 * `c` is read, never written. There is no state, no effect, no callback and no
 * store subscription in this file: every value is either passed straight to the
 * region that renders it or composed into the shell's class name. That is also
 * what finally makes the `react-hooks/exhaustive-deps` exemption in
 * eslint.config.mjs meaningless for App.tsx - there are no hooks left for it to
 * look at. (Deleting that line is still a gate-config change and still needs its
 * own decision.)
 *
 * The one thing here that is not pure wiring is the class name below: the shell's
 * layout states are eight independent flags, and the CSS keys off their exact
 * concatenation. It stayed a template for the same reason the regions keep their
 * prop lists - moving it into a helper would only hide which flags the shell
 * answers to.
 */
export function App() {
  const c = useWorkspaceController();

  return (
    <div
      className={`app-shell theme-${c.preferences.theme} ${c.sidebarOpen ? "sidebar-open" : "sidebar-closed"}${c.directoryOpen ? "" : " directory-closed"}${c.manifest ? "" : " empty-source"}${c.isFullscreen ? " is-fullscreen" : ""}${c.isCanvasFullscreen ? " is-canvas-fullscreen" : ""}${c.isDualSplitMode ? " is-dual-split-mode" : ""}${c.isReviewFocus ? " is-review-focus" : ""}`}
    >
      {/* Shell chrome — dock, toolbar, directory, status bar. Everything the
          stores own is read inside AppShellChrome; children are the workspace's
          session-driven middle. */}
      <AppShellChrome
        session={c.doc.session}
        viewMode={c.doc.viewMode}
        setViewMode={c.doc.setViewMode}
        isDirty={c.doc.isDirty}
        isLargeDocument={c.doc.isLargeDocument}
        activeChapter={c.activeChapter}
        activeIndex={c.activeIndex}
        backlinksCount={c.currentLinkedReferences.length}
        selectChapter={c.selectChapter}
        handleRenameChapter={c.handleRenameChapter}
        handleImportOutline={c.handleImportOutline}
        createNewFile={c.createNewFile}
        createNewMindmap={c.createNewMindmap}
        createNewCanvas={c.createNewCanvas}
        openMarkdownFile={c.openMarkdownFile}
        openMarkdownDirectory={c.openMarkdownDirectory}
        toggleFullscreen={c.toggleFullscreen}
        toggleTypewriterMode={c.toggleTypewriterMode}
        goPrevious={c.goPrevious}
        goNext={c.goNext}
        addBookmark={c.addBookmark}
        saveSession={c.doc.saveSession}
        handlePrintDocument={c.handlePrintDocument}
        handleToggleGraphPane={c.handleToggleGraphPane}
        handleOpenCommandPalette={c.handleOpenCommandPalette}
        handleDirResizeMouseDown={c.handleDirResizeMouseDown}
        handleDirDoubleClick={c.handleDirDoubleClick}
      >
        {/* The panel decides its own visibility, reads its own tab/theme and
            owns the search box - see SidebarRegion. */}
        <SidebarRegion
          isDualSplitMode={c.isDualSplitMode}
          isCanvasFullscreen={c.isCanvasFullscreen}
          session={c.doc.session}
          renderedChapter={c.doc.renderedChapter}
          activeHeadingId={c.activeHeadingId}
          reviewableDocument={c.reviewableDocument}
          bookmarkedHeadingIds={c.bookmarkedHeadingIds}
          jumpToHeading={c.jumpToHeading}
          jumpBookmark={c.jumpBookmark}
          searchResults={c.searchResults}
          handleSearchJump={c.handleSearchJump}
          clearSearchHighlights={c.clearSearchHighlights}
          onOpenNoteFile={c.openNoteFile}
          handleReviewActiveChange={c.handleReviewActiveChange}
          handleMergeFlashNote={c.handleMergeFlashNote}
          handleSidebarResizeMouseDown={c.handleSidebarResizeMouseDown}
          handleSidebarDoubleClick={c.handleSidebarDoubleClick}
          backlinks={{
            currentDocTitle: c.currentDocTitle,
            currentLinkedReferences: c.currentLinkedReferences,
            currentUnlinkedMentions: c.currentUnlinkedMentions,
            handleJumpToBacklink: c.handleJumpToBacklink,
            handleConvertMention: c.handleConvertMention,
            graphData: c.graphData,
          }}
        />

        <section className="reader-frame">
          {!c.isCanvasFullscreen && c.tabs.length > 0 && (
            <TabBar
              tabs={c.tabsForDisplay}
              activeTabId={c.chapterId}
              dualSplitTabId={c.dualSplitTabId}
              onSelectTab={c.selectChapter}
              onCloseTab={c.handleCloseTab}
              onCloseOtherTabs={c.handleCloseOtherTabs}
              onCloseRightTabs={c.handleCloseRightTabs}
              onOpenDualSplit={c.handleOpenDualSplit}
              onCloseDualSplit={c.handleCloseDualSplit}
              onDetachTab={c.handleDetachTab}
              isGraphPaneOpen={c.isGraphPaneOpen}
              onToggleGraphPane={c.handleToggleGraphPane}
            />
          )}
          <WorkspaceRouter
            session={c.doc.session}
            activeChapter={c.activeChapter}
            renderedChapter={c.doc.renderedChapter}
            secondaryRenderedChapter={c.secondaryRenderedChapter}
            viewMode={c.doc.viewMode}
            isDirty={c.doc.isDirty}
            isSaving={c.doc.isSaving}
            isLargeDocument={c.doc.isLargeDocument}
            autoPreviewPaused={c.doc.autoPreviewPaused}
            isDualSplitMode={c.isDualSplitMode}
            readerRef={c.readerRef}
            secondaryReaderRef={c.secondaryReaderRef}
            editorViewRef={c.editorViewRef}
            navLockUntilRef={c.navLockUntilRef}
            updateSource={c.doc.updateSource}
            renderPreviewNow={c.doc.renderPreviewNow}
            saveSession={c.doc.saveSession}
            setViewMode={c.doc.setViewMode}
            toggleFullscreen={c.toggleFullscreen}
            isFullscreen={c.isFullscreen}
            handleCloseDualSplit={c.handleCloseDualSplit}
            handlePrintDocument={c.handlePrintDocument}
            handleExtractSelectionToNote={c.handleExtractSelectionToNote}
            handleSendSelectionToFlash={c.handleSendSelectionToFlash}
            handleCreateCanvasExtractNote={c.handleCreateCanvasExtractNote}
            handleWikiLinkClick={c.handleWikiLinkClick}
            handleJumpToBacklink={c.handleJumpToBacklink}
            handleToggleMindmap={c.handleToggleMindmap}
            handleRevealInToc={c.handleRevealInToc}
            handleOpenBacklinks={c.handleOpenBacklinks}
            wikiLinkTargets={c.wikiLinkTargets}
            backlinksCount={c.currentLinkedReferences.length}
            graph={{ graphData: c.graphData, currentActiveId: c.currentActiveId }}
            handleCloseGraphPane={c.handleCloseGraphPane}
            onOpenDesktopMarkdownPath={c.openNoteFile}
            jumpToHeading={c.jumpToHeading}
            createNewFile={c.createNewFile}
            createNewMindmap={c.createNewMindmap}
            createNewCanvas={c.createNewCanvas}
            openMarkdownDirectory={c.openMarkdownDirectory}
          />
        </section>
      </AppShellChrome>

      {/* Floating surfaces — lightbox, guard dialogs, palette, history, about,
          toast. They read the lightbox, open flags, notice and preferences from
          the stores themselves; only the editing session and the actions the
          controller orchestrates are passed in. */}
      <AppOverlays
        session={c.doc.session}
        conflict={c.doc.conflict}
        activeChapter={c.activeChapter}
        renderedChapter={c.doc.renderedChapter}
        commandActions={c.commandActions}
        onSelectChapter={c.selectChapter}
        onJumpToHeading={(id) => c.jumpToHeading(id, "smooth", true)}
        onSavePending={c.handleDialogSave}
        onDiscardPending={c.handleDialogDiscard}
        onCancelPending={c.handleDialogCancel}
        onReloadFromDisk={c.doc.reloadFromDisk}
        onOverwrite={c.saveSessionOverwriting}
        onSaveAs={c.doc.saveSessionAs}
        onClearConflict={c.doc.clearConflict}
        onRevertToContent={c.handleRevertToContent}
      />
    </div>
  );
}

export default App;
