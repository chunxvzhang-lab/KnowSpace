import {
  BookOpen,
  Bookmark,
  Code2,
  Columns,
  FilePlus2,
  FolderOpen,
  ListTree,
  Search,
  Sun,
  Sparkles,
  Feather,
  FileText,
  Info,
  Maximize2,
  Minimize2,
  Zap,
  GitFork,
  Network,
  Command,
  Boxes,
} from "lucide-react";
import appLogo from "../assets/icon.png";
import type { EditorViewMode, ThemeMode, SidebarTab } from "../core/types";

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
  onOpenDirectory,
  onOpenAbout,
  isDirty = false,
  backlinksCount = 0,
  onOpenGlobalGraph,
  isGraphOpen = false,
  onOpenCommandPalette,
}: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="快捷工具栏">
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
          className={`activity-btn ${sidebarOpen && activeSidebarTab === "toc" ? "active" : ""}`}
          onClick={() => onSelectSidebarTab("toc")}
          data-tooltip="大纲目录"
          aria-label="大纲目录"
        >
          <ListTree size={18} />
        </button>

        <button
          type="button"
          className={`activity-btn ${sidebarOpen && activeSidebarTab === "bookmarks" ? "active" : ""}`}
          onClick={() => onSelectSidebarTab("bookmarks")}
          data-tooltip="精选书签 (Ctrl+B)"
          aria-label="书签列表"
        >
          <Bookmark size={18} />
        </button>

        <button
          type="button"
          className={`activity-btn ${sidebarOpen && activeSidebarTab === "search" ? "active" : ""}`}
          onClick={() => onSelectSidebarTab("search")}
          data-tooltip="全文搜索 (Ctrl+F)"
          aria-label="全文搜索"
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
          <Zap size={18} style={{ color: "#f59e0b" }} />
        </button>

        <button
          type="button"
          className={`activity-btn ${sidebarOpen && activeSidebarTab === "backlinks" ? "active" : ""}`}
          onClick={() => onSelectSidebarTab("backlinks")}
          data-tooltip="反向链接与引用"
          aria-label="反向链接与引用"
        >
          <GitFork size={18} style={{ color: "#38bdf8" }} />
          {backlinksCount > 0 && (
            <span className="activity-badge">{backlinksCount}</span>
          )}
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
            const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
            if (desktop?.openFlashCapsule) {
              desktop.openFlashCapsule();
            }
          }}
          data-tooltip="闪念胶囊 (全局热键唤起)"
          aria-label="闪念胶囊速记"
        >
          <Zap size={18} style={{ color: "#f59e0b" }} />
        </button>

        {onOpenGlobalGraph && (
          <button
            type="button"
            className={`activity-btn ${isGraphOpen ? "active" : ""}`}
            onClick={onOpenGlobalGraph}
            data-tooltip="知识网络全景图谱 (Ctrl+G)"
            aria-label="知识网络全景图谱"
          >
            <Network size={18} style={{ color: "#38bdf8" }} />
          </button>
        )}
      </div>

      {/* Bottom Controls: View Mode & Fullscreen & Theme Switch & About */}
      <div className="activity-bottom">
        <div className="activity-viewmodes" role="group" aria-label="视图模式">
          <button
            type="button"
            className={`activity-btn mini ${viewMode === "read" ? "active" : ""}`}
            onClick={() => onViewModeChange("read")}
            data-tooltip="阅读模式"
          >
            <BookOpen size={16} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${viewMode === "split" ? "active" : ""}`}
            onClick={() => onViewModeChange("split")}
            data-tooltip="分屏模式"
          >
            <Columns size={16} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${viewMode === "source" ? "active" : ""}`}
            onClick={() => onViewModeChange("source")}
            data-tooltip="源码模式"
          >
            <Code2 size={16} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${viewMode === "mindmap" ? "active" : ""}`}
            onClick={() => onViewModeChange("mindmap")}
            data-tooltip="思维导图模式 (Ctrl+M)"
          >
            <ListTree size={16} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${viewMode === "canvas" ? "active" : ""}`}
            onClick={() => onViewModeChange("canvas")}
            data-tooltip="空间白板模式"
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

        <div className="activity-viewmodes activity-thememodes" role="group" aria-label="主题模式">
          <button
            type="button"
            className={`activity-btn mini ${theme === "light" ? "active" : ""}`}
            onClick={() => onThemeChange("light")}
            data-tooltip="日光浅色 (Light)"
            aria-label="日光浅色"
          >
            <Sun size={15} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${theme === "eink" ? "active theme-eink-active" : ""}`}
            onClick={() => onThemeChange("eink")}
            data-tooltip="仿电子墨水屏 (E-ink Paper)"
            aria-label="仿电子墨水屏"
          >
            <Feather size={15} />
          </button>
          <button
            type="button"
            className={`activity-btn mini ${theme === "twitter" ? "active theme-twitter-active" : ""}`}
            onClick={() => onThemeChange("twitter")}
            data-tooltip="极客暗黑 (Geek Dark)"
            aria-label="极客暗黑"
          >
            <Sparkles size={15} />
          </button>
        </div>
      </div>
    </nav>
  );
}
