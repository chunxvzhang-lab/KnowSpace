import { useCallback } from "react";
import type {
  ChapterManifest,
  DocumentSession,
  EditorViewMode,
  RenderedChapter,
  ThemeMode,
} from "../core/types";
import type { EditorView as CmEditorView } from "@codemirror/view";
import type { WikiLinkTarget } from "./EditorPane";
import { CanvasView } from "./CanvasView";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { DualDocumentWorkspace } from "./DualDocumentWorkspace";
import { GraphWorkspaceLayout } from "./GraphWorkspaceLayout";
import { MindmapView } from "./MindmapView";
import type { MermaidTheme } from "../services/mermaid";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";
import { EmptyReader } from "./EmptyReader";
import type { useBacklinkIndex } from "../hooks/useBacklinkIndex";

type GraphView = Pick<ReturnType<typeof useBacklinkIndex>, "graphData" | "currentActiveId">;

type WorkspaceRouterProps = {
  session: DocumentSession | null;
  activeChapter: ChapterManifest | undefined;
  renderedChapter: RenderedChapter | null;
  secondaryRenderedChapter: RenderedChapter | null;
  viewMode: EditorViewMode;
  isDirty: boolean;
  isSaving: boolean;
  isLargeDocument: boolean;
  autoPreviewPaused: boolean;
  isDualSplitMode: boolean;
  readerRef: { current: HTMLElement | null };
  secondaryReaderRef: { current: HTMLElement | null };
  editorViewRef: { current: CmEditorView | null };
  navLockUntilRef: { current: number };
  updateSource: (source: string) => void;
  renderPreviewNow: (() => void) | undefined;
  saveSession: () => void;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  handleCloseDualSplit: () => void;
  handlePrintDocument: () => void;
  handleExtractSelectionToNote: (selectedText: string, suggestedTitle: string) => void;
  handleSendSelectionToFlash: (text: string) => void;
  handleCreateCanvasExtractNote: (extractedMarkdown: string, defaultDocTitle?: string) => void;
  handleWikiLinkClick: (target: string) => void;
  handleJumpToBacklink: (sourceId: string) => void;
  handleToggleMindmap: () => void;
  handleRevealInToc: () => void;
  handleOpenBacklinks: () => void;
  wikiLinkTargets: WikiLinkTarget[];
  /** 阅读视图里点击任务复选框：块起始行 + 块内序号（见 ReaderPane）。 */
  onToggleTask: (blockStartLine: number, withinBlockIndex: number) => void;
  backlinksCount: number;
  graph: GraphView;
  handleCloseGraphPane: () => void;
  onOpenDesktopMarkdownPath: (absolutePath: string) => void;
  jumpToHeading: (headingId: string, behavior?: ScrollBehavior, highlight?: boolean) => void;
  createNewFile: () => void;
  createNewMindmap: () => void;
  createNewCanvas: () => void;
  openMarkdownDirectory: () => void;
};

function resolveMermaidTheme(theme: ThemeMode): MermaidTheme {
  if (theme === "twitter") return "dark";
  if (theme === "eink") return "neutral";
  if (theme === "light") return "default";
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "default";
}

/**
 * Which workspace fills the reader frame: dual split, mind map, canvas, or the
 * document workspace — wrapped in the graph split when that pane is open.
 *
 * The branch order is load-bearing and reads like a priority list: the dual
 * split outranks the view mode, the mind map and canvas are file-type driven as
 * well as view-mode driven, and the plain workspace is the default. Appearance
 * (theme, font scale, typewriter) comes straight from the UI store — this is a
 * view, and the shell should not have to thread appearance through it.
 */
export function WorkspaceRouter({
  session,
  activeChapter,
  renderedChapter,
  secondaryRenderedChapter,
  viewMode,
  isDirty,
  isSaving,
  isLargeDocument,
  autoPreviewPaused,
  isDualSplitMode,
  readerRef,
  secondaryReaderRef,
  editorViewRef,
  navLockUntilRef,
  updateSource,
  renderPreviewNow,
  saveSession,
  setViewMode,
  toggleFullscreen,
  isFullscreen,
  handleCloseDualSplit,
  handlePrintDocument,
  handleExtractSelectionToNote,
  handleSendSelectionToFlash,
  handleCreateCanvasExtractNote,
  handleWikiLinkClick,
  handleJumpToBacklink,
  handleToggleMindmap,
  handleRevealInToc,
  handleOpenBacklinks,
  wikiLinkTargets,
  onToggleTask,
  backlinksCount,
  graph,
  handleCloseGraphPane,
  onOpenDesktopMarkdownPath,
  jumpToHeading,
  createNewFile,
  createNewMindmap,
  createNewCanvas,
  openMarkdownDirectory,
}: WorkspaceRouterProps) {
  const theme = useUiStore((s) => s.preferences.theme);
  const fontScale = useUiStore((s) => s.preferences.fontScale);
  const showLineNumbers = useUiStore((s) => s.preferences.showLineNumbers);
  const typewriterMode = useUiStore((s) => s.typewriterMode);
  const setLightboxMedia = useUiStore((s) => s.setLightboxMedia);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const tabs = useTabStore((s) => s.tabs);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const setNotice = useUiStore((s) => s.setNotice);
  const allChapters = useVaultStore((s) => s.manifest?.chapters);

  const handleMermaidError = useCallback(() => {
    setNotice("Mermaid 图表渲染失败，请检查语法。");
  }, [setNotice]);

  const innerWorkspace =
    isDualSplitMode && secondaryRenderedChapter ? (
      <DualDocumentWorkspace
        primaryTitle={activeChapter?.title ?? session?.fileName ?? "主文档"}
        viewMode={viewMode}
        source={session?.source ?? ""}
        onSourceChange={updateSource}
        renderedChapter={renderedChapter}
        primaryContainerRef={readerRef}
        theme={theme}
        fontScale={fontScale}
        mermaidTheme={resolveMermaidTheme(theme)}
        onMermaidError={handleMermaidError}
        onSave={saveSession}
        isLargeDocument={isLargeDocument}
        autoPreviewPaused={autoPreviewPaused}
        onRefreshPreview={renderPreviewNow}
        readOnly={!session?.writable}
        showLineNumbers={showLineNumbers}
        typewriterMode={typewriterMode}
        currentFilePath={session?.absolutePath || undefined}
        onOpenLightbox={(media) => setLightboxMedia(media)}
        onEditorViewReady={(view) => {
          editorViewRef.current = view;
        }}
        secondaryTitle={tabs.find((t) => t.id === dualSplitTabId)?.title ?? "对照文档"}
        secondaryRenderedChapter={secondaryRenderedChapter}
        secondaryContainerRef={secondaryReaderRef}
        onCloseSecondary={handleCloseDualSplit}
        wikiLinkTargets={wikiLinkTargets}
        onToggleTask={onToggleTask}
        onWikiLinkClick={handleWikiLinkClick}
        backlinksCount={backlinksCount}
        onOpenBacklinks={handleOpenBacklinks}
        onExtractToNote={handleExtractSelectionToNote}
        onSendToFlash={handleSendSelectionToFlash}
        onPrint={handlePrintDocument}
        onToggleMindmap={handleToggleMindmap}
        onRevealInToc={handleRevealInToc}
      />
    ) : viewMode === "mindmap" && session ? (
      <MindmapView
        title={activeChapter?.title ?? session?.fileName ?? "知识思维导图"}
        headings={renderedChapter?.headings ?? []}
        source={session.source}
        onSourceChange={updateSource}
        editable={session.writable}
        theme={theme}
        // Identifies the document whose folds are being remembered.
        // The absolute path is preferred because two chapters can
        // share a title; `src` and the file name cover the cases
        // where there is no path to hand.
        documentKey={session.absolutePath || activeChapter?.src || session.fileName}
        onJumpToHeading={(headingId, _line) => {
          setViewMode("split");
          window.setTimeout(() => {
            jumpToHeading(headingId, "smooth", true);
          }, 80);
        }}
        // The same resolver the reader uses when a `[[wiki link]]` in
        // the text is clicked: one answer to "which file is this name",
        // not a second one that could disagree with it.
        onWikiLinkClick={handleWikiLinkClick}
        onClose={() => setViewMode("split")}
      />
    ) : (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) &&
      session ? (
      <CanvasView
        key={session.chapterId || session.absolutePath || "canvas-session"}
        title={activeChapter?.title ?? session.fileName ?? "空间白板"}
        source={session.source}
        onSourceChange={updateSource}
        editable={session.writable}
        theme={theme}
        allChapters={allChapters}
        onOpenFile={onOpenDesktopMarkdownPath}
        onExtractToNote={(docTitle, content) => handleCreateCanvasExtractNote(content, docTitle)}
        onClose={() => setViewMode("split")}
        onSave={saveSession}
        isDirty={isDirty}
        isSaving={isSaving}
        currentFilePath={session.absolutePath || session.fileName}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    ) : session ? (
      <DocumentWorkspace
        viewMode={viewMode}
        source={session.source}
        onSourceChange={updateSource}
        renderedChapter={renderedChapter}
        containerRef={readerRef}
        theme={theme}
        fontScale={fontScale}
        mermaidTheme={resolveMermaidTheme(theme)}
        onMermaidError={handleMermaidError}
        onSave={saveSession}
        isLargeDocument={isLargeDocument}
        autoPreviewPaused={autoPreviewPaused}
        onRefreshPreview={renderPreviewNow}
        readOnly={!session.writable}
        showLineNumbers={showLineNumbers}
        typewriterMode={typewriterMode}
        currentFilePath={session.absolutePath || undefined}
        onOpenLightbox={(media) => setLightboxMedia(media)}
        onEditorViewReady={(view) => {
          editorViewRef.current = view;
        }}
        navLockUntilRef={navLockUntilRef}
        wikiLinkTargets={wikiLinkTargets}
        onToggleTask={onToggleTask}
        onWikiLinkClick={handleWikiLinkClick}
        backlinksCount={backlinksCount}
        onOpenBacklinks={handleOpenBacklinks}
        onExtractToNote={handleExtractSelectionToNote}
        onSendToFlash={handleSendSelectionToFlash}
        onPrint={handlePrintDocument}
        onToggleMindmap={handleToggleMindmap}
        onRevealInToc={handleRevealInToc}
      />
    ) : (
      <EmptyReader
        readerRef={readerRef}
        createNewFile={createNewFile}
        createNewMindmap={createNewMindmap}
        createNewCanvas={createNewCanvas}
        openMarkdownDirectory={openMarkdownDirectory}
      />
    );

  if (isGraphPaneOpen) {
    return (
      <GraphWorkspaceLayout
        viewMode={viewMode}
        graphData={graph.graphData}
        currentDocId={graph.currentActiveId}
        theme={theme}
        onSelectNode={handleJumpToBacklink}
        onCloseGraph={handleCloseGraphPane}
      >
        {innerWorkspace}
      </GraphWorkspaceLayout>
    );
  }

  return innerWorkspace;
}
