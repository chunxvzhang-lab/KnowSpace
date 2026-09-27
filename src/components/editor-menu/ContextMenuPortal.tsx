import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "@codemirror/view";
import {
  Scissors,
  Copy,
  Clipboard,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Highlighter,
  Link,
  FilePlus,
  Anchor,
  Zap,
  Heading1,
  List,
  Table,
  Printer,
  FileText,
  ChevronRight,
} from "lucide-react";
import type { SubmenuType } from "./useSubmenuController";

type ContextMenuPortalProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  adjustedPos: { left: number; top: number };
  view: EditorView;
  onClose: () => void;
  hasSelection: boolean;
  selectedChars: number;
  totalWords: number;
  totalChars: number;
  wrapSelection: (prefix: string, suffix?: string, defaultContent?: string) => void;
  handleCut: () => void;
  handleCopy: () => void;
  handlePaste: () => void;
  handleExtractToNote: () => void;
  handleCreateBlockRef: () => void;
  handleSendToFlash: () => void;
  activeSubmenu: SubmenuType;
  handleOpenSubmenu: (
    name: SubmenuType,
    anchorEl: HTMLElement,
    width?: number,
    height?: number,
  ) => void;
  handleOpenTablePicker: (anchorEl: HTMLElement) => void;
  handleImmediateCloseSubmenu: () => void;
  handleScheduleClose: () => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;
};

/**
 * The main context-menu portal: knowledge ops, clipboard, format ribbon,
 * submenu triggers, workflow/system actions and the pinned stats footer.
 *
 * Extracted verbatim from EditorContextMenu (decomposition of the context
 * menu): the JSX below is the original portal body, prop-driven so the
 * composition root keeps owning state. The scrollable body
 * (`.editor-context-menu-scroll`) plus pinned footer (`.context-menu-footer`)
 * pairing is what the mount tests assert; footer text reads the word/char
 * stats the root derives from the render-time selection snapshot.
 */
export function ContextMenuPortal({
  menuRef,
  adjustedPos,
  view,
  onClose,
  hasSelection,
  selectedChars,
  totalWords,
  totalChars,
  wrapSelection,
  handleCut,
  handleCopy,
  handlePaste,
  handleExtractToNote,
  handleCreateBlockRef,
  handleSendToFlash,
  activeSubmenu,
  handleOpenSubmenu,
  handleOpenTablePicker,
  handleImmediateCloseSubmenu,
  handleScheduleClose,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: ContextMenuPortalProps) {
  return createPortal(
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: adjustedPos.left, top: adjustedPos.top }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {/* Scrollable Body: Prevents clipping on any screen or window height */}
      <div className="editor-context-menu-scroll">
        {/* Group 1: Knowledge Operations (Obsidian Powered) */}
        <div className="menu-group" onMouseEnter={handleImmediateCloseSubmenu}>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => wrapSelection("[[", "]]", "")}
            title="将选中文本包装为双向链接"
          >
            <span className="menu-icon">🔗</span>
            <span className="menu-label">
              {hasSelection ? "包装为双链 [[选区]]" : "插入双向链接"}
            </span>
            <span className="menu-shortcut">[[</span>
          </button>

          <button
            type="button"
            className="context-menu-item"
            onClick={handleExtractToNote}
            title="将选中文本提取创建为独立的新笔记，并在原地替换为双链"
          >
            <FilePlus size={14} className="menu-icon" />
            <span className="menu-label">提取选区为新笔记</span>
            <span className="menu-shortcut">Extract</span>
          </button>

          <button
            type="button"
            className="context-menu-item"
            onClick={handleCreateBlockRef}
            title="为当前行生成块锚点指纹 (^block-id) 并复制引用链接"
          >
            <Anchor size={14} className="menu-icon" />
            <span className="menu-label">创建段落块引用 (^block)</span>
            <span className="menu-shortcut">#^</span>
          </button>

          <button
            type="button"
            className="context-menu-item"
            onClick={handleSendToFlash}
            title="将选中内容快速归档至 Space 闪念胶囊时间线"
          >
            <Zap size={14} className="menu-icon text-amber" />
            <span className="menu-label">存入闪念收集箱 (Space)</span>
            <span className="menu-shortcut">Alt+Space</span>
          </button>
        </div>

        <div className="menu-divider" />

        {/* Group 2: Clipboard Actions */}
        <div className="menu-group" onMouseEnter={handleImmediateCloseSubmenu}>
          {hasSelection && (
            <button type="button" className="context-menu-item" onClick={handleCut}>
              <Scissors size={14} className="menu-icon" />
              <span className="menu-label">剪切</span>
              <span className="menu-shortcut">Ctrl+X</span>
            </button>
          )}
          <button
            type="button"
            className="context-menu-item"
            onClick={handleCopy}
            disabled={!hasSelection}
          >
            <Copy size={14} className="menu-icon" />
            <span className="menu-label">复制</span>
            <span className="menu-shortcut">Ctrl+C</span>
          </button>
          <button type="button" className="context-menu-item" onClick={handlePaste}>
            <Clipboard size={14} className="menu-icon" />
            <span className="menu-label">粘贴</span>
            <span className="menu-shortcut">Ctrl+V</span>
          </button>
        </div>

        <div className="menu-divider" />

        {/* Group 3: Formatting Horizontal Ribbon (Height reduced from ~190px to 32px) */}
        <div
          className="format-ribbon"
          role="toolbar"
          aria-label="文字格式工具栏"
          onMouseEnter={handleImmediateCloseSubmenu}
        >
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("**")}
            title="加粗 (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("*")}
            title="斜体 (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("~~")}
            title="删除线 (~~)"
          >
            <Strikethrough size={13} />
          </button>
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("`")}
            title="行内代码 (`)"
          >
            <Code size={13} />
          </button>
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("==")}
            title="文本高亮 (==)"
          >
            <Highlighter size={13} />
          </button>
          <button
            type="button"
            className="format-ribbon-btn"
            onClick={() => wrapSelection("[", "](https://)", "链接文字")}
            title="插入超链接 (Ctrl+K)"
          >
            <Link size={13} />
          </button>
        </div>

        <div className="menu-divider" />

        {/* Group 4: Paragraph, Structure & Table Submenus */}
        <div className="menu-group">
          {/* Submenu: Paragraph Headings */}
          <div
            className={`context-menu-item has-submenu ${activeSubmenu === "headings" ? "active" : ""}`}
            onMouseEnter={(e) => handleOpenSubmenu("headings", e.currentTarget, 170, 140)}
            onMouseLeave={handleScheduleClose}
          >
            <Heading1 size={14} className="menu-icon" />
            <span className="menu-label">转为标题</span>
            <ChevronRight size={13} className="submenu-arrow" />
          </div>

          {/* Submenu: Lists & Blockquotes */}
          <div
            className={`context-menu-item has-submenu ${activeSubmenu === "lists" ? "active" : ""}`}
            onMouseEnter={(e) => handleOpenSubmenu("lists", e.currentTarget, 180, 160)}
            onMouseLeave={handleScheduleClose}
          >
            <List size={14} className="menu-icon" />
            <span className="menu-label">列表与段落排版</span>
            <ChevronRight size={13} className="submenu-arrow" />
          </div>

          {/* Direct First-Class Item: Custom Table (Row/Col Picker) */}
          <div
            className={`context-menu-item has-submenu ${activeSubmenu === "tablePicker" ? "active" : ""}`}
            onMouseEnter={(e) => handleOpenTablePicker(e.currentTarget)}
            onClick={(e) => handleOpenTablePicker(e.currentTarget)}
          >
            <Table size={14} className="menu-icon" style={{ color: "#38bdf8" }} />
            <span className="menu-label">插入表格 (自定义行列)</span>
            <ChevronRight size={13} className="submenu-arrow" />
          </div>

          {/* Submenu: Insert Rich Blocks & Diagrams */}
          <div
            className={`context-menu-item has-submenu ${activeSubmenu === "insert" ? "active" : ""}`}
            onMouseEnter={(e) => handleOpenSubmenu("insert", e.currentTarget, 210, 200)}
            onMouseLeave={handleScheduleClose}
          >
            <Code size={14} className="menu-icon" />
            <span className="menu-label">插入内容与图表</span>
            <ChevronRight size={13} className="submenu-arrow" />
          </div>
        </div>

        <div className="menu-divider" />

        {/* Group 5: Workflow & System Actions */}
        <div className="menu-group" onMouseEnter={handleImmediateCloseSubmenu}>
          {onPrint && (
            <button type="button" className="context-menu-item" onClick={onPrint}>
              <Printer size={14} className="menu-icon" />
              <span className="menu-label">高保真 PDF 打印 / 导出</span>
              <span className="menu-shortcut">Ctrl+P</span>
            </button>
          )}
          {onToggleMindmap && (
            <button type="button" className="context-menu-item" onClick={onToggleMindmap}>
              <span className="menu-icon">🧠</span>
              <span className="menu-label">切换为思维导图</span>
              <span className="menu-shortcut">Ctrl+M</span>
            </button>
          )}
          {onRevealInToc && (
            <button type="button" className="context-menu-item" onClick={onRevealInToc}>
              <FileText size={14} className="menu-icon" />
              <span className="menu-label">在大纲中定位小节</span>
            </button>
          )}
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
              view.focus();
              onClose();
            }}
          >
            <span className="menu-icon">⬛</span>
            <span className="menu-label">全选</span>
            <span className="menu-shortcut">Ctrl+A</span>
          </button>
        </div>
      </div>

      {/* Pinned Footer: Guaranteed visible and never cut off */}
      <div className="context-menu-footer" onMouseEnter={handleImmediateCloseSubmenu}>
        {hasSelection ? (
          <span>
            已选 <strong>{selectedChars}</strong> 字符 · 全文 <strong>{totalWords}</strong> 词 (
            {totalChars} 字符)
          </span>
        ) : (
          <span>
            全文共 <strong>{totalWords}</strong> 词 · <strong>{totalChars}</strong> 字符
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
