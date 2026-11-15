import { memo, useState, useRef, useEffect } from "react";
import type { EditorViewMode, RenderedChapter, ThemeMode } from "../core/types";
import type { MermaidTheme } from "../services/mermaid";
import { EditorPane, type WikiLinkTarget } from "./EditorPane";
import { ReaderPane } from "./ReaderPane";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { EditorView } from "@codemirror/view";

import type { LightboxMedia } from "./MediaLightbox";

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
  /** 阅读视图里点击任务复选框（块起始行 + 块内序号），见 ReaderPane。 */
  onToggleTask?: (blockStartLine: number, withinBlockIndex: number) => void;
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
  isLargeDocument: _isLargeDocument = false,
  autoPreviewPaused = false,
  onRefreshPreview,
  readOnly = false,
  showLineNumbers = true,
  typewriterMode = false,
  currentFilePath,
  onOpenLightbox,
  onEditorViewReady,
  wikiLinkTargets,
  onToggleTask,
  onWikiLinkClick,
  backlinksCount,
  onOpenBacklinks,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: DocumentWorkspaceProps) {
  const [hasEditor, setHasEditor] = useState(viewMode !== "read");
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (viewMode !== "read") setHasEditor(true);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === "live") editorViewRef.current?.focus();
  }, [viewMode, currentFilePath]);

  return (
    <div className={`document-workspace view-${viewMode}`}>
      {/* Editor Section */}
      {(hasEditor || viewMode !== "read") && (
        <div
          className="workspace-pane editor-section"
          style={viewMode === "read" ? { display: "none" } : { flex: "1 1 100%" }}
        >
          <EditorPane
            key={currentFilePath}
            value={source}
            onChange={onSourceChange}
            theme={theme}
            fontScale={fontScale}
            onSave={onSave}
            readOnly={readOnly}
            livePreviewMode
            typewriterMode={typewriterMode}
            currentFilePath={currentFilePath}
            wikiLinkTargets={wikiLinkTargets}
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

      {/* Reader / Preview Section: always mounted so print & PDF export can render markdown in all modes */}
      <div
        className={`workspace-pane reader-section ${viewMode === "live" ? "print-only-reader" : ""}`}
        style={{ flex: "1 1 100%" }}
      >
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
          documentKey={currentFilePath}
          containerRef={containerRef}
          fontScale={fontScale}
          mermaidTheme={mermaidTheme}
          onMermaidError={onMermaidError}
          showLineNumbers={showLineNumbers}
          onOpenLightbox={onOpenLightbox}
          wikiLinkTargets={wikiLinkTargets}
          onToggleTask={onToggleTask}
          onWikiLinkClick={onWikiLinkClick}
          backlinksCount={backlinksCount}
          onOpenBacklinks={onOpenBacklinks}
        />
      </div>
    </div>
  );
});
