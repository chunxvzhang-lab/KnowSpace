import { memo, useState, useRef, useCallback, useEffect } from "react";
import type { EditorViewMode, RenderedChapter, ThemeMode } from "../core/types";
import type { MermaidTheme } from "../services/mermaid";
import { EditorPane, type WikiLinkTarget } from "./EditorPane";
import { ReaderPane } from "./ReaderPane";
import { RefreshCw, AlertCircle, Link2, Link2Off } from "lucide-react";
import { useSyncScroll } from "../hooks/useSyncScroll";
import { useSyncSelection } from "../hooks/useSyncSelection";

import type { LightboxMedia } from "./MediaLightbox";

const SPLIT_RATIO_KEY = "bookmd.layout.splitRatio";

type DocumentWorkspaceProps = {
  viewMode: EditorViewMode;
  source: string;
  onSourceChange: (source: string) => void;
  renderedChapter: RenderedChapter | null;
  containerRef: React.RefObject<HTMLElement | null>;
  theme: ThemeMode;
  fontScale: number;
  mermaidTheme: MermaidTheme;
  onMermaidError: () => void;
  onSave?: () => void;
  isLargeDocument?: boolean;
  autoPreviewPaused?: boolean;
  onRefreshPreview?: () => void;
  readOnly?: boolean;
  showLineNumbers?: boolean;
  typewriterMode?: boolean;
  currentFilePath?: string;
  onOpenLightbox?: (media: LightboxMedia) => void;
  onEditorViewReady?: (view: any) => void;
  navLockUntilRef?: React.MutableRefObject<number>;
  wikiLinkTargets?: WikiLinkTarget[];
  onWikiLinkClick?: (target: string) => void;
  backlinksCount?: number;
  onOpenBacklinks?: () => void;
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  onSendToFlash?: (text: string) => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;
};

export const DocumentWorkspace = memo(function DocumentWorkspace({
  viewMode,
  source,
  onSourceChange,
  renderedChapter,
  containerRef,
  theme,
  fontScale,
  mermaidTheme,
  onMermaidError,
  onSave,
  isLargeDocument = false,
  autoPreviewPaused = false,
  onRefreshPreview,
  readOnly = false,
  showLineNumbers = true,
  typewriterMode = false,
  currentFilePath,
  onOpenLightbox,
  onEditorViewReady,
  navLockUntilRef,
  wikiLinkTargets,
  onWikiLinkClick,
  backlinksCount,
  onOpenBacklinks,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: DocumentWorkspaceProps) {
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const saved = localStorage.getItem(SPLIT_RATIO_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (!Number.isNaN(val) && val >= 0.15 && val <= 0.85) return val;
      }
    } catch {
      // fallback
    }
    return 0.5;
  });
  const [isDragging, setIsDragging] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const {
    syncEnabled,
    toggleSync,
    editorViewRef,
    handleEditorScroll,
  } = useSyncScroll({ containerRef, viewMode, navLockUntilRef });

  const {
    handleEditorSelectionChange,
    handlePreviewSelectionChange,
  } = useSyncSelection({
    containerRef,
    viewMode,
    editorViewRef,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const currentRatioRef = { current: splitRatio };

    const handleMouseMove = (e: MouseEvent) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const isNarrow = rect.width < 980;

      let newRatio: number;
      if (isNarrow) {
        // Vertical split
        newRatio = (e.clientY - rect.top) / rect.height;
      } else {
        // Horizontal split
        newRatio = (e.clientX - rect.left) / rect.width;
      }
      const clamped = Math.min(Math.max(newRatio, 0.15), 0.85);
      currentRatioRef.current = clamped;
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.classList.remove("is-resizing-col");
      try {
        localStorage.setItem(SPLIT_RATIO_KEY, currentRatioRef.current.toString());
      } catch {
        // ignore
      }
    };

    document.body.classList.add("is-resizing-col");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.classList.remove("is-resizing-col");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={workspaceRef}
      className={`document-workspace view-${viewMode} ${isDragging ? "is-resizing" : ""}`}
    >
      {/* Editor Section */}
      {viewMode !== "read" && (
        <div
          className="workspace-pane editor-section"
          style={
            viewMode === "split"
              ? { flex: `0 0 ${splitRatio * 100}%` }
              : { flex: "1 1 100%" }
          }
        >
          {viewMode === "split" && (
            <div className="pane-header-bar">
              <span className="pane-header-title">编辑器源码</span>
              <button
                type="button"
                className={`sync-scroll-badge ${syncEnabled ? "active" : ""}`}
                onClick={toggleSync}
                title={syncEnabled ? "分屏同步滚动：已开启（点击关闭）" : "分屏同步滚动：已关闭（点击开启）"}
              >
                {syncEnabled ? <Link2 size={12} /> : <Link2Off size={12} />}
                <span>同步滚动</span>
              </button>
            </div>
          )}
          <EditorPane
            value={source}
            onChange={onSourceChange}
            theme={theme}
            fontScale={fontScale}
            onSave={onSave}
            readOnly={readOnly}
            typewriterMode={typewriterMode}
            currentFilePath={currentFilePath}
            wikiLinkTargets={wikiLinkTargets}
            onScroll={handleEditorScroll}
            onSelectionChange={handleEditorSelectionChange}
            onEditorViewReady={(view) => {
              editorViewRef.current = view;
              onEditorViewReady?.(view);
            }}
            onExtractToNote={onExtractToNote}
            onSendToFlash={onSendToFlash}
            onPrint={onPrint}
            onToggleMindmap={onToggleMindmap}
            onRevealInToc={onRevealInToc}
          />
        </div>
      )}

      {/* Resizer bar for split mode */}
      {viewMode === "split" && (
        <div
          className={`workspace-splitter ${isDragging ? "is-active" : ""}`}
          onMouseDown={handleMouseDown}
          onDoubleClick={() => {
            setSplitRatio(0.5);
            try {
              localStorage.setItem(SPLIT_RATIO_KEY, "0.5");
            } catch {
              // ignore
            }
          }}
          role="separator"
          aria-orientation="vertical"
          title="拖拽调整编辑器与预览窗口比例（双击自适应 1:1 等宽）"
        >
          <div className="splitter-handle" />
        </div>
      )}

      {/* Reader / Preview Section: always mounted so print & PDF export can render markdown in all modes */}
      <div
        className={`workspace-pane reader-section ${viewMode === "source" ? "source-mode-reader print-only-reader" : ""}`}
        style={
          viewMode === "split"
            ? { flex: `1 1 ${(1 - splitRatio) * 100}%` }
            : { flex: "1 1 100%" }
        }
      >
        {viewMode === "split" && (
          <div className="pane-header-bar">
            <span className="pane-header-title">实时预览</span>
          </div>
        )}
        {autoPreviewPaused && (
          <div className="large-doc-notice">
            <AlertCircle size={15} />
            <span>大文件自动预览已暂停（提升编辑流畅度）</span>
            {onRefreshPreview && (
              <button
                type="button"
                className="preview-refresh-btn"
                onClick={onRefreshPreview}
                title="立即刷新预览"
              >
                <RefreshCw size={13} />
                <span>刷新预览</span>
              </button>
            )}
          </div>
        )}
        <ReaderPane
          chapter={renderedChapter}
          containerRef={containerRef}
          fontScale={fontScale}
          mermaidTheme={mermaidTheme}
          onMermaidError={onMermaidError}
          onElementClick={handlePreviewSelectionChange}
          showLineNumbers={showLineNumbers}
          onOpenLightbox={onOpenLightbox}
          wikiLinkTargets={wikiLinkTargets}
          onWikiLinkClick={onWikiLinkClick}
          backlinksCount={backlinksCount}
          onOpenBacklinks={onOpenBacklinks}
        />
      </div>
    </div>
  );
});
