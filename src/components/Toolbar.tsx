import { useRef } from "react";
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FileUp,
  FilePlus2,
  Save,
  Type,
  Maximize2,
  Minimize2,
  Hash,
  Eye,
  Printer,
  Command,
  History,
} from "lucide-react";
import type { EditorViewMode, ThemeMode } from "../core/types";
import { ViewModeControl } from "./ViewModeControl";

type ToolbarProps = {
  title: string;
  chapterTitle: string;
  isDirty?: boolean;
  viewMode: EditorViewMode;
  onViewModeChange: (mode: EditorViewMode) => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  sidebarOpen?: boolean;
  directoryOpen?: boolean;
  theme?: ThemeMode;
  fontScale: number;
  showLineNumbers?: boolean;
  onToggleLineNumbers?: () => void;
  typewriterMode?: boolean;
  onToggleTypewriterMode?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleSidebar?: () => void;
  onToggleDirectory?: () => void;
  onAddBookmark: () => void;
  onNewFile?: () => void;
  onSave?: () => void;
  canSave?: boolean;
  onOpenMarkdown: (file: File) => void;
  onOpenDirectory?: () => void;
  onThemeChange?: (theme: ThemeMode) => void;
  onFontScaleChange: (scale: number) => void;
  onPrint?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenVersionHistory?: () => void;
};

export function Toolbar(props: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) props.onOpenMarkdown(file);
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="title-stack">
          <strong>{props.title}</strong>
          <div className="chapter-title-row">
            {props.isDirty && <span className="dirty-dot" title="有未保存的修改" />}
            <span className={props.isDirty ? "is-dirty" : ""}>{props.chapterTitle}</span>
          </div>
        </div>
      </div>

      <div className="toolbar-center">
        <ViewModeControl mode={props.viewMode} onChange={props.onViewModeChange} />
      </div>

      <div className="toolbar-actions">
        {props.onOpenCommandPalette && (
          <button
            aria-label="全局命令面板 (Ctrl+K)"
            className="icon-button"
            onClick={props.onOpenCommandPalette}
            title="全局命令面板 (Ctrl+K)"
          >
            <Command size={16} />
          </button>
        )}

        {props.onNewFile && (
          <button
            aria-label="新建 Markdown 文件"
            className="icon-button"
            onClick={props.onNewFile}
            title="新建文件 (Ctrl+N)"
          >
            <FilePlus2 size={17} />
          </button>
        )}

        <button
          aria-label="保存当前文件"
          className={`icon-button ${props.isDirty ? "active highlight" : ""}`}
          onClick={props.onSave}
          disabled={!props.canSave && !props.isDirty}
          title="保存文件 (Ctrl+S)"
        >
          <Save size={17} />
        </button>

        {props.onOpenVersionHistory && (
          <button
            aria-label="版本快照与历史比对 (Ctrl+Shift+H)"
            className="icon-button"
            onClick={props.onOpenVersionHistory}
            title="版本快照与历史比对 (Ctrl+Shift+H)"
          >
            <History size={17} />
          </button>
        )}

        <button
          aria-label="上一章"
          className="icon-button"
          onClick={props.onPrevious}
          disabled={!props.canGoPrevious}
          title="上一篇 (Alt+Left)"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          aria-label="下一章"
          className="icon-button"
          onClick={props.onNext}
          disabled={!props.canGoNext}
          title="下一篇 (Alt+Right)"
        >
          <ChevronRight size={18} />
        </button>

        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".md,.markdown,.canvas,text/markdown,application/json"
          onChange={handleFileChange}
        />
        <button
          aria-label="打开文件"
          className="icon-button"
          onClick={() => fileInputRef.current?.click()}
          title="打开单个文件 (Ctrl+O)"
        >
          <FileUp size={17} />
        </button>

        {props.onOpenDirectory ? (
          <button
            aria-label="打开 Markdown 目录"
            className="icon-button"
            onClick={props.onOpenDirectory}
            title="打开文档文件夹 (Ctrl+Shift+O)"
          >
            <FolderOpen size={17} />
          </button>
        ) : null}

        <button
          aria-label="添加书签"
          className="icon-button"
          onClick={props.onAddBookmark}
          title="添加书签 (Ctrl+B)"
        >
          <BookmarkPlus size={17} />
        </button>

        {props.onToggleTypewriterMode && (
          <button
            className={`icon-button ${props.typewriterMode ? "active" : ""}`}
            onClick={props.onToggleTypewriterMode}
            aria-label={props.typewriterMode ? "关闭打字机居中滚动" : "开启打字机居中滚动"}
            title={props.typewriterMode ? "打字机模式：已开启（Alt+T）" : "打字机模式：已关闭（Alt+T）"}
          >
            <Eye size={17} />
          </button>
        )}

        {props.onToggleLineNumbers && (
          <button
            className={`icon-button ${props.showLineNumbers ? "active" : ""}`}
            onClick={props.onToggleLineNumbers}
            aria-label={props.showLineNumbers ? "隐藏正文预览行号" : "显示正文预览行号"}
            title={props.showLineNumbers ? "正文行号：已开启（点击隐藏）" : "正文行号：已隐藏（点击开启）"}
          >
            <Hash size={17} />
          </button>
        )}

        {props.onToggleFullscreen && (
          <button
            className={`icon-button ${props.isFullscreen ? "active" : ""}`}
            onClick={props.onToggleFullscreen}
            aria-label={props.isFullscreen ? "退出全屏" : "全屏模式"}
            title={props.isFullscreen ? "退出全屏 (F11 / Esc)" : "全屏模式 (F11)"}
          >
            {props.isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        )}

        {props.onPrint && (
          <button
            className="icon-button"
            onClick={props.onPrint}
            aria-label="打印与导出高保真 PDF"
            title="打印与导出高保真 PDF (Ctrl+P)"
          >
            <Printer size={17} />
          </button>
        )}

        <label className="font-control" title="阅读字号">
          <Type size={16} />
          <input
            aria-label="阅读字号"
            type="range"
            min="0.85"
            max="1.35"
            step="0.05"
            value={props.fontScale}
            onChange={(event) => props.onFontScaleChange(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    </header>
  );
}
