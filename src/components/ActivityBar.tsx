import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Bookmark,
  PencilLine,
  FilePlus2,
  FolderOpen,
  ListTree,
  Search,
  Sun,
  Sparkles,
  FileText,
  Info,
  Maximize2,
  Minimize2,
  Zap,
  GitFork,
  Network,
  Command,
  Boxes,
  Files,
} from "lucide-react";
import appLogo from "../assets/icon.png";
import type { EditorViewMode, ThemeMode, SidebarTab } from "../core/types";
import { useUiStore } from "../store/useUiStore";

type ActivityBarProps = {
  directoryOpen: boolean;
  onToggleDirectory: () => void;
  sidebarOpen: boolean;
  activeSidebarTab: SidebarTab;
  onSelectSidebarTab: (tab: SidebarTab) => void;
  viewMode: EditorViewMode;
  onViewModeChange: (mode: EditorViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onNewFile?: () => void;
  onOpenTemplates?: () => void;
  onOpenDirectory?: () => void;
  onOpenAbout?: () => void;
  isDirty?: boolean;
  backlinksCount?: number;
  onOpenGlobalGraph?: () => void;
  isGraphOpen?: boolean;
  onOpenCommandPalette?: () => void;
};

export function ActivityBar({
  directoryOpen,
  onToggleDirectory,
  sidebarOpen,
  activeSidebarTab,
  onSelectSidebarTab,
  viewMode,
  onViewModeChange,
  theme,
  onThemeChange,
  isFullscreen = false,
  onToggleFullscreen,
  onNewFile,
  onOpenTemplates,
  onOpenDirectory,
  onOpenAbout,
  isDirty = false,
  backlinksCount = 0,
  onOpenGlobalGraph,
  isGraphOpen = false,
  onOpenCommandPalette,
}: ActivityBarProps) {
  const aiOpen = useUiStore((s) => s.aiOpen);
  const openAi = useUiStore((s) => s.openAi);
  const closeAi = useUiStore((s) => s.closeAi);
  // Tooltips are rendered through a portal rather than with CSS ::after
  // pseudo-elements: the dock scrolls on short windows, and a scroll container
  // would clip a tooltip that extends past its right edge.
  const [tooltip, setTooltip] = useState<{ text: string; top: number; left: number } | null>(null);

  const handlePointerOver = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const el = target?.closest<HTMLElement>("[data-tooltip]");
    const text = el?.getAttribute("data-tooltip");
    if (!el || !text) {
      setTooltip(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTooltip({ text, top: rect.top + rect.height / 2, left: rect.right + 12 });
  }, []);

  const handlePointerLeave = useCallback(() => setTooltip(null), []);
  // A scroll invalidates the measured position, so simply hide it.
  const handleScroll = useCallback(() => setTooltip(null), []);

  return (
    <>
      <nav
        className="activity-bar"
        aria-label="快捷工具栏"
        onPointerOver={handlePointerOver}
        onPointerLeave={handlePointerLeave}
        onScroll={handleScroll}
      >
        {/* Top Brand Logo */}
        <div className="activity-brand" data-tooltip="KnowSpace · 个人知识工作台 (摸鱼Lab)">
          <div className="brand-badge">
            <img src={appLogo} alt="KnowSpace Logo" className="brand-logo-img" />
          </div>
        </div>

        {/* Main Feature Icons */}
        <div className="activity-group">
          <button
            type="button"
            className={`activity-btn ${directoryOpen ? "active" : ""}`}
            onClick={onToggleDirectory}
            data-tooltip="文档目录 (Ctrl+\)"
            aria-label="文档目录"
            aria-pressed={directoryOpen}
          >
            <FolderOpen size={18} />
            {isDirty && <span className="activity-dot" />}
          </button>

          {onOpenCommandPalette && (
            <button
              type="button"
              className="activity-btn"
              onClick={onOpenCommandPalette}
              data-tooltip="全局命令中枢 (Ctrl+K)"
              aria-label="全局命令中枢"
            >
              <Command size={18} />
            </button>
          )}

          <button
            type="button"
            className={`activity-btn ${aiOpen ? "active" : ""}`}
            onClick={() => (aiOpen ? closeAi() : openAi())}
            data-tooltip="AI 助理"
            aria-label="AI 助理"
            aria-pressed={aiOpen}
            aria-expanded={aiOpen}
            aria-controls={aiOpen ? "ai-workspace" : undefined}
          >
            <Sparkles size={18} />
          </button>

          <button
            type="button"
            className={`activity-btn ${sidebarOpen && activeSidebarTab === "toc" ? "active" : ""}`}
            onClick={() => onSelectSidebarTab("toc")}
            data-tooltip="大纲目录"
            aria-label="大纲目录"
            aria-pressed={sidebarOpen && activeSidebarTab === "toc"}
          >
            <ListTree size={18} />
          </button>

          <button
            type="button"
            className={`activity-btn ${sidebarOpen && activeSidebarTab === "bookmarks" ? "active" : ""}`}
            onClick={() => onSelectSidebarTab("bookmarks")}
            data-tooltip="精选书签 (Ctrl+B)"
            aria-label="书签列表"
            aria-pressed={sidebarOpen && activeSidebarTab === "bookmarks"}
          >
            <Bookmark size={18} />
          </button>

          <button
            type="button"
            className={`activity-btn ${sidebarOpen && activeSidebarTab === "search" ? "active" : ""}`}
            onClick={() => onSelectSidebarTab("search")}
            data-tooltip="全文搜索 (Ctrl+F)"
            aria-label="全文搜索"
            aria-pressed={sidebarOpen && activeSidebarTab === "search"}
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            className={`activity-btn ${sidebarOpen && activeSidebarTab === "space" ? "active" : ""}`}
            onClick={() => onSelectSidebarTab("space")}
            data-tooltip="闪念 Space 时间线"
            aria-label="闪念 Space 时间线看板"
          >
            <Zap size={18} className="activity-neon-amber" />
          </button>

          <button
            type="button"
            className={`activity-btn ${sidebarOpen && activeSidebarTab === "backlinks" ? "active" : ""}`}
            onClick={() => onSelectSidebarTab("backlinks")}
            data-tooltip="反向链接与引用"
            aria-label="反向链接与引用"
          >
            <GitFork size={18} className="activity-neon-cyan" />
            {backlinksCount > 0 && <span className="activity-badge">{backlinksCount}</span>}
          </button>
        </div>

        {/* Middle Quick Actions */}
        <div className="activity-divider" />
        <div className="activity-group">
          {onNewFile && (
            <button
              type="button"
              className="activity-btn"
              onClick={onNewFile}
              data-tooltip="新建文件 (Ctrl+N)"
              aria-label="新建文件"
            >
              <FilePlus2 size={18} />
            </button>
          )}

          {onOpenTemplates && (
            <button
              type="button"
              className="activity-btn"
              onClick={onOpenTemplates}
              data-tooltip="从模板新建"
              aria-label="从模板新建"
            >
              <Files size={18} />
            </button>
          )}

          {onOpenDirectory && (
            <button
              type="button"
              className="activity-btn"
              onClick={onOpenDirectory}
              data-tooltip="打开目录 (Ctrl+Shift+O)"
              aria-label="打开文件夹"
            >
              <FileText size={18} />
            </button>
          )}

          <button
            type="button"
            className="activity-btn flash-notes-activity-btn"
            onClick={() => {
              const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
              if (desktop?.capture.openFlashCapsule) {
                desktop.capture.openFlashCapsule();
              }
            }}
            data-tooltip="闪念胶囊 (全局热键唤起)"
            aria-label="闪念胶囊速记"
          >
            <Zap size={18} className="activity-neon-amber" />
          </button>

          {onOpenGlobalGraph && (
            <button
              type="button"
              className={`activity-btn ${isGraphOpen ? "active" : ""}`}
              onClick={onOpenGlobalGraph}
              data-tooltip="知识网络全景图谱 (Ctrl+G)"
              aria-label="知识网络全景图谱"
            >
              <Network size={18} className="activity-neon-cyan" />
            </button>
          )}
        </div>

        {/* Bottom Controls: View Mode & Fullscreen & Theme Switch & About */}
        <div className="activity-bottom">
          <div className="activity-viewmodes" role="group" aria-label="视图模式">
            <button
              type="button"
              className={`activity-btn mini ${viewMode === "live" ? "active" : ""}`}
              onClick={() => onViewModeChange("live")}
              data-tooltip="实时预览 (Ctrl+E)"
              aria-label="实时预览"
            >
              <PencilLine size={16} />
            </button>
            <button
              type="button"
              className={`activity-btn mini ${viewMode === "read" ? "active" : ""}`}
              onClick={() => onViewModeChange("read")}
              data-tooltip="阅读模式"
              aria-label="阅读模式"
              aria-pressed={viewMode === "read"}
            >
              <BookOpen size={16} />
            </button>
            <button
              type="button"
              className={`activity-btn mini ${viewMode === "mindmap" ? "active" : ""}`}
              onClick={() => onViewModeChange("mindmap")}
              data-tooltip="思维导图模式 (Ctrl+M)"
              aria-label="思维导图模式"
              aria-pressed={viewMode === "mindmap"}
            >
              <ListTree size={16} className="activity-neon-cyan" />
            </button>
            <button
              type="button"
              className={`activity-btn mini ${viewMode === "canvas" ? "active" : ""}`}
              onClick={() => onViewModeChange("canvas")}
              data-tooltip="空间白板模式"
              aria-label="空间白板模式"
              aria-pressed={viewMode === "canvas"}
            >
              <Boxes size={16} />
            </button>
          </div>

          {onToggleFullscreen && (
            <button
              type="button"
              className={`activity-btn ${isFullscreen ? "active" : ""}`}
              onClick={onToggleFullscreen}
              data-tooltip={isFullscreen ? "退出全屏 (F11 / Esc)" : "全屏模式 (F11)"}
              aria-label="全屏切换"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}

          {onOpenAbout && (
            <button
              type="button"
              className="activity-btn"
              onClick={onOpenAbout}
              data-tooltip="关于应用"
              aria-label="关于应用"
            >
              <Info size={18} />
            </button>
          )}

          <div
            className="activity-viewmodes activity-thememodes"
            role="group"
            aria-label="主题模式"
          >
            <button
              type="button"
              className={`activity-btn mini ${theme === "light" ? "active" : ""}`}
              onClick={() => onThemeChange("light")}
              data-tooltip="日光浅色 (Light)"
              aria-label="日光浅色"
              aria-pressed={theme === "light"}
            >
              <Sun size={15} />
            </button>
            <button
              type="button"
              className={`activity-btn mini ${theme === "twitter" ? "active theme-twitter-active" : ""}`}
              onClick={() => onThemeChange("twitter")}
              data-tooltip="极客暗黑 (Geek Dark)"
              aria-label="极客暗黑"
              aria-pressed={theme === "twitter"}
            >
              <Sparkles size={15} />
            </button>
          </div>
        </div>
      </nav>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="activity-tooltip"
            role="tooltip"
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            {tooltip.text}
          </div>,
          document.body,
        )}
    </>
  );
}
