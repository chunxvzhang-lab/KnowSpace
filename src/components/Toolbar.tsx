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
  Files,
  MoreHorizontal,
  X,
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
  /**
   * Whether the directory tree is showing documents hidden by a leading dot.
   *
   * The control is only offered when a folder is open (`hasDirectory`): the
   * setting is stored regardless, but with a single document there is no tree
   * for it to change.
   */
  showHiddenFiles?: boolean;
  onToggleHiddenFiles?: () => void;
  hasDirectory?: boolean;
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
  onOpenTemplates?: () => void;
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
  const toolsRef = useRef<HTMLDialogElement | null>(null);

  function toolAction(action: () => void) {
    toolsRef.current?.close();
    action();
  }

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
            className="command-button toolbar-command"
            onClick={props.onOpenCommandPalette}
            title="全局命令面板 (Ctrl+K)"
          >
            <Command size={16} />
            <span className="toolbar-command-label">搜索与命令</span>
            <kbd className="toolbar-command-key">Ctrl K</kbd>
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

        {props.onOpenTemplates && (
          <button
            type="button"
            aria-label="从模板新建"
            title="从模板新建"
            className="icon-button"
            onClick={props.onOpenTemplates}
          >
            <Files size={17} />
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

        <div className="toolbar-navigation" role="group" aria-label="文档导航">
          <button
            type="button"
            aria-label="上一章"
            className="icon-button"
            onClick={props.onPrevious}
            disabled={!props.canGoPrevious}
            title="上一篇 (Alt+Left)"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="下一章"
            className="icon-button"
            onClick={props.onNext}
            disabled={!props.canGoNext}
            title="下一篇 (Alt+Right)"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".md,.markdown,.canvas,text/markdown,application/json"
          onChange={handleFileChange}
        />
        {props.onToggleFullscreen && (
          <button
            type="button"
            className={`icon-button ${props.isFullscreen ? "active" : ""}`}
            onClick={props.onToggleFullscreen}
            aria-label={props.isFullscreen ? "退出全屏" : "全屏模式"}
            title={props.isFullscreen ? "退出全屏 (F11 / Esc)" : "全屏模式 (F11)"}
          >
            {props.isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="文档工具"
          title="文档工具：打开、历史、书签与阅读设置"
          aria-haspopup="dialog"
          onClick={() => toolsRef.current?.showModal()}
        >
          <MoreHorizontal size={19} />
        </button>
        <dialog
          ref={toolsRef}
          className="toolbar-tools-dialog"
          aria-labelledby="toolbar-tools-title"
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (event.target === event.currentTarget) toolsRef.current?.close();
          }}
        >
          <div className="toolbar-tools-heading">
            <h2 id="toolbar-tools-title">文档工具</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭文档工具"
              onClick={() => toolsRef.current?.close()}
            >
              <X size={18} />
            </button>
          </div>
          <div className="toolbar-tool-list">
            <button type="button" onClick={() => toolAction(() => fileInputRef.current?.click())}>
              <FileUp size={17} />
              <span>打开文件</span>
              <kbd>Ctrl+O</kbd>
            </button>
            {props.onOpenDirectory && (
              <button type="button" onClick={() => toolAction(props.onOpenDirectory!)}>
                <FolderOpen size={17} />
                <span>打开 Markdown 目录</span>
              </button>
            )}
            {props.onOpenVersionHistory && (
              <button type="button" onClick={() => toolAction(props.onOpenVersionHistory!)}>
                <History size={17} />
                <span>版本快照与历史比对 (Ctrl+Shift+H)</span>
              </button>
            )}
            <button type="button" onClick={() => toolAction(props.onAddBookmark)}>
              <BookmarkPlus size={17} />
              <span>添加书签</span>
              <kbd>Ctrl+B</kbd>
            </button>
            {props.onPrint && (
              <button type="button" onClick={() => toolAction(props.onPrint!)}>
                <Printer size={17} />
                <span>打印与导出高保真 PDF</span>
                <kbd>Ctrl+P</kbd>
              </button>
            )}
          </div>
          <h3>阅读设置</h3>
          <div className="toolbar-tool-list">
            {props.onToggleTypewriterMode && (
              <button
                type="button"
                aria-pressed={Boolean(props.typewriterMode)}
                onClick={props.onToggleTypewriterMode}
              >
                <Eye size={17} />
                <span>{props.typewriterMode ? "关闭打字机居中滚动" : "开启打字机居中滚动"}</span>
                <kbd>Alt+T</kbd>
              </button>
            )}
            {props.onToggleLineNumbers && (
              <button
                type="button"
                aria-pressed={Boolean(props.showLineNumbers)}
                onClick={props.onToggleLineNumbers}
              >
                <Hash size={17} />
                <span>{props.showLineNumbers ? "隐藏正文预览行号" : "显示正文预览行号"}</span>
              </button>
            )}
            {props.onToggleHiddenFiles && props.hasDirectory && (
              <button
                type="button"
                aria-pressed={Boolean(props.showHiddenFiles)}
                onClick={props.onToggleHiddenFiles}
              >
                <Eye size={17} />
                <span>{props.showHiddenFiles ? "隐藏点开头的文件" : "显示点开头的文件"}</span>
              </button>
            )}
          </div>
          <label className="font-control" title="阅读字号">
            <Type size={16} />
            <span>阅读字号</span>
            <input
              aria-label="阅读字号"
              type="range"
              min="0.85"
              max="1.35"
              step="0.05"
              value={props.fontScale}
              onChange={(event) => props.onFontScaleChange(Number(event.currentTarget.value))}
            />
            <output>{Math.round(props.fontScale * 100)}%</output>
          </label>
        </dialog>
      </div>
    </header>
  );
}
