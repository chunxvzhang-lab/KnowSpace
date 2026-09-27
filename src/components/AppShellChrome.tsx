import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { ActivityBar } from "./ActivityBar";
import { ChapterList } from "./ChapterList";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import type {
  ChapterManifest,
  DocumentSession,
  EditorViewMode,
  SidebarTab,
  ThemeMode,
} from "../core/types";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

type AppShellChromeProps = {
  session: DocumentSession | null;
  viewMode: EditorViewMode;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  isDirty: boolean;
  isLargeDocument: boolean;
  activeChapter?: ChapterManifest;
  activeIndex: number;
  /** How many documents link to the active one; the dock's backlinks badge. */
  backlinksCount: number;
  selectChapter: (chapterId: string) => void;
  handleRenameChapter: (chapter: ChapterManifest) => Promise<void>;
  handleImportOutline: () => Promise<void>;
  createNewFile: () => void;
  createNewMindmap: () => void;
  createNewCanvas: () => void;
  openMarkdownFile: (file: File) => void;
  openMarkdownDirectory: () => void;
  toggleFullscreen: () => Promise<void>;
  toggleTypewriterMode: () => void;
  goPrevious: () => void;
  goNext: () => void;
  addBookmark: () => void;
  saveSession: (options?: {
    force?: boolean;
    content?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  handlePrintDocument: () => Promise<void>;
  handleToggleGraphPane: () => void;
  handleOpenCommandPalette: () => void;
  handleDirResizeMouseDown: (event: ReactMouseEvent) => void;
  handleDirDoubleClick: () => void;
  children: ReactNode;
};

/**
 * The shell's fixed chrome (final trim): the activity dock, the toolbar, the
 * document directory with its resizer, and the status bar — the four blocks
 * that are all gated on the same "not dual-split, not canvas-fullscreen"
 * condition and draw almost entirely on store state.
 *
 * Following the SidebarPanel/AppOverlays pattern, everything the stores own is
 * read here directly (layout flags, preferences, the manifest, the active tab,
 * the widths); only the editing session and the actions App orchestrates travel
 * in as props. `isDualSplitMode` and `isCanvasFullscreen` are recomputed from
 * the same inputs App uses for the shell class name — two pure derivations of
 * the same store fields, so the two can never disagree about a gate.
 *
 * `children` is the workspace's variable middle — the side panel and the reader
 * frame — which stays in App because it is the part the session drives.
 */
export function AppShellChrome({
  session,
  viewMode,
  setViewMode,
  isDirty,
  isLargeDocument,
  activeChapter,
  activeIndex,
  backlinksCount,
  selectChapter,
  handleRenameChapter,
  handleImportOutline,
  createNewFile,
  createNewMindmap,
  createNewCanvas,
  openMarkdownFile,
  openMarkdownDirectory,
  toggleFullscreen,
  toggleTypewriterMode,
  goPrevious,
  goNext,
  addBookmark,
  saveSession,
  handlePrintDocument,
  handleToggleGraphPane,
  handleOpenCommandPalette,
  handleDirResizeMouseDown,
  handleDirDoubleClick,
  children,
}: AppShellChromeProps) {
  const manifest = useVaultStore((s) => s.manifest);
  const chapterId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const directoryOpen = useUiStore((s) => s.directoryOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const isFullscreen = useUiStore((s) => s.isFullscreen);
  const typewriterMode = useUiStore((s) => s.typewriterMode);
  const preferences = useUiStore((s) => s.preferences);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  // The width setters and persistLayout moved into useColumnResize along with
  // the drag that drives them. The widths are still subscribed where the
  // resizers and panels render them — which is here now.
  const directoryWidth = useUiStore((s) => s.directoryWidth);
  const resizingType = useUiStore((s) => s.resizingType);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const setVersionHistoryOpen = useUiStore((s) => s.setVersionHistoryOpen);
  const patchPreferences = useUiStore((s) => s.patchPreferences);
  const setPreferences = useUiStore((s) => s.setPreferences);

  // The comparison pane lives in a separate tab; when it is the active split,
  // the shell drops its own chrome and the router renders both panes.
  const isDualSplitMode = Boolean(dualSplitTabId && tabs.some((t) => t.id === dualSplitTabId));

  const isCanvasActive = Boolean(
    (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) && session,
  );
  const isCanvasFullscreen = isCanvasActive && isFullscreen;

  const handleSelectSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (sidebarOpen && sidebarTab === tab) {
        setSidebarOpen(false);
      } else {
        setSidebarTab(tab);
        setSidebarOpen(true);
      }
    },
    [sidebarOpen, sidebarTab, setSidebarOpen, setSidebarTab],
  );

  return (
    <>
      {!isDualSplitMode && !isCanvasFullscreen && (
        <ActivityBar
          directoryOpen={directoryOpen}
          onToggleDirectory={() => setDirectoryOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
          activeSidebarTab={sidebarTab}
          onSelectSidebarTab={handleSelectSidebarTab}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          theme={preferences.theme}
          onThemeChange={(theme: ThemeMode) => setPreferences((current) => ({ ...current, theme }))}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onNewFile={window.bookMDDesktop ? createNewFile : undefined}
          onOpenDirectory={window.bookMDDesktop ? openMarkdownDirectory : undefined}
          onOpenAbout={() => setAboutOpen(true)}
          isDirty={isDirty}
          backlinksCount={backlinksCount}
          onOpenGlobalGraph={handleToggleGraphPane}
          isGraphOpen={isGraphPaneOpen}
          onOpenCommandPalette={handleOpenCommandPalette}
        />
      )}

      <div className="main-viewport-container">
        {!isDualSplitMode && !isCanvasFullscreen && (
          <Toolbar
            title={manifest?.title ?? "Markdown Viewer"}
            chapterTitle={activeChapter?.title ?? "打开 Markdown 文件或目录"}
            isDirty={isDirty}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            canGoPrevious={activeIndex > 0}
            canGoNext={Boolean(
              manifest && activeIndex >= 0 && activeIndex < manifest.chapters.length - 1,
            )}
            sidebarOpen={sidebarOpen}
            directoryOpen={directoryOpen}
            theme={preferences.theme}
            fontScale={preferences.fontScale}
            showLineNumbers={preferences.showLineNumbers}
            onToggleLineNumbers={() =>
              patchPreferences({ showLineNumbers: !preferences.showLineNumbers })
            }
            showHiddenFiles={preferences.showHiddenFiles}
            hasDirectory={Boolean(manifest?.rootPath)}
            onToggleHiddenFiles={() =>
              patchPreferences({ showHiddenFiles: !preferences.showHiddenFiles })
            }
            typewriterMode={typewriterMode}
            onToggleTypewriterMode={toggleTypewriterMode}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onPrevious={goPrevious}
            onNext={goNext}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            onToggleDirectory={() => setDirectoryOpen((open) => !open)}
            onAddBookmark={addBookmark}
            onNewFile={window.bookMDDesktop ? createNewFile : undefined}
            onSave={() => saveSession()}
            canSave={Boolean(session?.writable)}
            onOpenMarkdown={openMarkdownFile}
            onOpenDirectory={window.bookMDDesktop ? openMarkdownDirectory : undefined}
            onFontScaleChange={(fontScale) => patchPreferences({ fontScale })}
            onPrint={handlePrintDocument}
            onOpenCommandPalette={handleOpenCommandPalette}
            onOpenVersionHistory={() => setVersionHistoryOpen(true)}
          />
        )}

        <div className="workspace">
          {!isDualSplitMode && !isCanvasFullscreen && directoryOpen ? (
            manifest ? (
              <div
                style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }}
                className="chapter-list-container"
              >
                <ChapterList
                  manifest={manifest}
                  activeChapterId={chapterId}
                  isDirty={isDirty}
                  onSelectChapter={selectChapter}
                  onRenameChapter={handleRenameChapter}
                  onNewMindmap={window.bookMDDesktop ? createNewMindmap : undefined}
                  onNewCanvas={window.bookMDDesktop ? createNewCanvas : undefined}
                  onImportOutline={
                    window.bookMDDesktop?.files.pickOutlineFile ? handleImportOutline : undefined
                  }
                />
              </div>
            ) : (
              <aside
                className="chapter-list empty-library"
                style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }}
                aria-label="文档目录"
              >
                <div className="tree-heading">DOCUMENT</div>
                <p>打开一个 Markdown 文件，新建文件，或在桌面版中打开文件目录。</p>
              </aside>
            )
          ) : null}

          {!isDualSplitMode && !isCanvasFullscreen && directoryOpen && (
            <div
              className={`layout-resizer ${resizingType === "dir" ? "is-active" : ""}`}
              onMouseDown={handleDirResizeMouseDown}
              onDoubleClick={handleDirDoubleClick}
              role="separator"
              aria-orientation="vertical"
              title="拖拽调整文档目录栏宽度（双击自适应最佳宽度）"
            />
          )}

          {children}
        </div>

        {!isCanvasFullscreen && (
          <StatusBar
            fileName={session?.fileName}
            chapterTitle={activeChapter?.title}
            source={session?.source}
            isDirty={isDirty}
            writable={session?.writable}
            lineEnding={session?.lineEnding}
            viewMode={viewMode}
            isLargeDocument={isLargeDocument}
          />
        )}
      </div>
    </>
  );
}
