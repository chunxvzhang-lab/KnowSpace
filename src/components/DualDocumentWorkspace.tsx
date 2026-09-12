import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { EditorViewMode, RenderedChapter, ThemeMode } from "../core/types";
import type { LightboxMedia } from "./MediaLightbox";
import type { MermaidTheme } from "../services/mermaid";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { ReaderPane } from "./ReaderPane";
import type { WikiLinkTarget } from "./EditorPane";
import { X, Columns2, BookOpen } from "lucide-react";

const DUAL_SPLIT_RATIO_KEY = "bookmd.layout.dualSplitRatio";

type DualDocumentWorkspaceProps = {
  // Primary (Left) Document
  primaryTitle: string;
  viewMode: EditorViewMode;
  source: string;
  onSourceChange: (source: string) => void;
  renderedChapter: RenderedChapter | null;
  primaryContainerRef: React.RefObject<HTMLElement | null>;
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
  wikiLinkTargets?: WikiLinkTarget[];
  onWikiLinkClick?: (target: string) => void;
  backlinksCount?: number;
  onOpenBacklinks?: () => void;
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  onSendToFlash?: (text: string) => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;

  // Secondary (Right) Document
  secondaryTitle: string;
  secondaryRenderedChapter: RenderedChapter | null;
  secondaryContainerRef: React.RefObject<HTMLElement | null>;
  onCloseSecondary: () => void;
};

export const DualDocumentWorkspace = memo(function DualDocumentWorkspace({
  primaryTitle,
  viewMode,
  source,
  onSourceChange,
  renderedChapter,
  primaryContainerRef,
  theme,
  fontScale,
  mermaidTheme,
  onMermaidError,
  onSave,
  isLargeDocument,
  autoPreviewPaused,
  onRefreshPreview,
  readOnly,
  showLineNumbers = true,
  typewriterMode,
  currentFilePath,
  onOpenLightbox,
  onEditorViewReady,
  wikiLinkTargets,
  onWikiLinkClick,
  backlinksCount,
  onOpenBacklinks,

  secondaryTitle,
  secondaryRenderedChapter,
  secondaryContainerRef,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
  onCloseSecondary,
}: DualDocumentWorkspaceProps) {
  const [dualRatio, setDualRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(DUAL_SPLIT_RATIO_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (!Number.isNaN(val) && val >= 0.2 && val <= 0.8) return val;
      }
    } catch {
      // fallback
    }
    return 0.5;
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const currentRatioRef = { current: dualRatio };

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(newRatio, 0.2), 0.8);
      currentRatioRef.current = clamped;
      setDualRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.classList.remove("is-resizing-col");
      try {
        localStorage.setItem(DUAL_SPLIT_RATIO_KEY, currentRatioRef.current.toString());
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
      ref={containerRef}
      className={`dual-document-workspace ${isDragging ? "is-resizing" : ""}`}
    >
      {/* Left Primary Document Pane */}
      <div
        className="dual-pane dual-pane-primary"
        style={{ flex: `0 0 ${dualRatio * 100}%` }}
      >
        <div className="dual-pane-header">
          <div className="dual-pane-title-group">
            <BookOpen size={14} className="dual-pane-icon text-orange" />
            <span className="dual-pane-tag primary-tag">主文档</span>
            <span className="dual-pane-title" title={primaryTitle}>
              {primaryTitle}
            </span>
          </div>
        </div>
        <div className="dual-pane-content">
          <DocumentWorkspace
            viewMode={viewMode}
            source={source}
            onSourceChange={onSourceChange}
            renderedChapter={renderedChapter}
            containerRef={primaryContainerRef}
            theme={theme}
            fontScale={fontScale}
            mermaidTheme={mermaidTheme}
            onMermaidError={onMermaidError}
            onSave={onSave}
            isLargeDocument={isLargeDocument}
            autoPreviewPaused={autoPreviewPaused}
            onRefreshPreview={onRefreshPreview}
            readOnly={readOnly}
            showLineNumbers={showLineNumbers}
            typewriterMode={typewriterMode}
            currentFilePath={currentFilePath}
            onOpenLightbox={onOpenLightbox}
            onEditorViewReady={onEditorViewReady}
            wikiLinkTargets={wikiLinkTargets}
            onWikiLinkClick={onWikiLinkClick}
            backlinksCount={backlinksCount}
            onOpenBacklinks={onOpenBacklinks}
            onExtractToNote={onExtractToNote}
            onSendToFlash={onSendToFlash}
            onPrint={onPrint}
            onToggleMindmap={onToggleMindmap}
            onRevealInToc={onRevealInToc}
          />
        </div>
      </div>

      {/* Center Draggable Resizer */}
      <div
        className={`workspace-splitter dual-splitter ${isDragging ? "is-active" : ""}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setDualRatio(0.5);
          try {
            localStorage.setItem(DUAL_SPLIT_RATIO_KEY, "0.5");
          } catch {
            // ignore
          }
        }}
        role="separator"
        aria-orientation="vertical"
        title="拖拽调整两文档分屏比例（双击重置 1:1 等宽）"
      >
        <div className="splitter-handle" />
      </div>

      {/* Right Secondary Document Pane */}
      <div
        className="dual-pane dual-pane-secondary"
        style={{ flex: `1 1 ${(1 - dualRatio) * 100}%` }}
      >
        <div className="dual-pane-header">
          <div className="dual-pane-title-group">
            <Columns2 size={14} className="dual-pane-icon text-cyan" />
            <span className="dual-pane-tag secondary-tag">对照分屏</span>
            <span className="dual-pane-title" title={secondaryTitle}>
              {secondaryTitle}
            </span>
          </div>
          <button
            type="button"
            className="dual-close-split-btn"
            onClick={onCloseSecondary}
            title="退出分屏对比 (Esc)"
          >
            <X size={14} />
            <span>退出分屏</span>
          </button>
        </div>
        <div className="dual-pane-content">
          <ReaderPane
            chapter={secondaryRenderedChapter}
            containerRef={secondaryContainerRef}
            fontScale={fontScale}
            mermaidTheme={mermaidTheme}
            onMermaidError={onMermaidError}
            showLineNumbers={showLineNumbers}
            onOpenLightbox={onOpenLightbox}
            wikiLinkTargets={wikiLinkTargets}
            onWikiLinkClick={onWikiLinkClick}
          />
        </div>
      </div>
    </div>
  );
});
