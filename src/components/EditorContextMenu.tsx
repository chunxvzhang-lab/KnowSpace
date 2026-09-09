import { memo, useEffect, useRef, useState, useCallback } from "react";
import { EditorView } from "@codemirror/view";
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
  Heading2,
  Heading3,
  CheckSquare,
  List,
  ListOrdered,
  Quote,
  Table,
  Sigma,
  GitFork,
  Printer,
  FileText,
  ChevronRight,
} from "lucide-react";

export interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  view: EditorView;
  currentFilePath?: string;
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  onSendToFlash?: (text: string) => void;
  onPrint?: () => void;
  onToggleMindmap?: () => void;
  onRevealInToc?: () => void;
}

export const EditorContextMenu = memo(function EditorContextMenu({
  x,
  y,
  onClose,
  view,
  currentFilePath,
  onExtractToNote,
  onSendToFlash,
  onPrint,
  onToggleMindmap,
  onRevealInToc,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [adjustedPos, setAdjustedPos] = useState({ left: x, top: y });

  const selection = view.state.selection.main;
  const hasSelection = !selection.empty;
  const selectedText = hasSelection ? view.state.sliceDoc(selection.from, selection.to) : "";
  const docText = view.state.doc.toString();

  // Calculate word and character statistics
  const totalChars = docText.length;
  const totalWords = (docText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_-]+/g) || []).length;
  const selectedChars = selectedText.length;

  // Viewport-safe positioning
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 12;
    let nextLeft = x;
    let nextTop = y;

    if (x + rect.width > window.innerWidth - pad) {
      nextLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (y + rect.height > window.innerHeight - pad) {
      nextTop = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setAdjustedPos({ left: nextLeft, top: nextTop });
  }, [x, y]);

  // Click outside and Esc listener
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Helper: Toggle wrapping — wraps with prefix/suffix if not already wrapped, or removes markers if already present.
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix, defaultContent = "文字") => {
      const from = selection.from;
      const to = selection.to;
      const doc = view.state.doc;

      if (hasSelection) {
        // Case 1: selection itself already has the markers at its edges → unwrap
        if (
          selectedText.startsWith(prefix) &&
          selectedText.endsWith(suffix) &&
          selectedText.length >= prefix.length + suffix.length
        ) {
          const inner = selectedText.slice(prefix.length, selectedText.length - suffix.length);
          view.dispatch({
            changes: { from, to, insert: inner },
            selection: { anchor: from, head: from + inner.length },
          });
          view.focus();
          onClose();
          return;
        }
        // Case 2: markers sit just outside the selection in the document → unwrap those
        const preFrom = Math.max(0, from - prefix.length);
        const postTo = Math.min(doc.length, to + suffix.length);
        const textBefore = doc.sliceString(preFrom, from);
        const textAfter = doc.sliceString(to, postTo);
        if (textBefore === prefix && textAfter === suffix) {
          view.dispatch({
            changes: [
              { from: preFrom, to: from, insert: "" },
              { from: to, to: postTo, insert: "" },
            ],
            selection: { anchor: preFrom, head: preFrom + selectedText.length },
          });
          view.focus();
          onClose();
          return;
        }
        // Case 3: not yet wrapped → wrap
        const replacement = `${prefix}${selectedText}${suffix}`;
        view.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: from + prefix.length, head: from + prefix.length + selectedText.length },
        });
      } else {
        // No selection: detect whether cursor is currently inside markers on this line
        const line = doc.lineAt(from);
        const lineText = line.text;
        const colOffset = from - line.from;
        const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const markerRe = new RegExp(`${escapeRe(prefix)}([\\s\\S]*?)${escapeRe(suffix)}`, "g");
        let match: RegExpExecArray | null;
        let foundMatch: RegExpExecArray | null = null;
        while ((match = markerRe.exec(lineText)) !== null) {
          const matchStart = match.index;
          const matchEnd = match.index + match[0].length;
          if (colOffset >= matchStart && colOffset <= matchEnd) {
            foundMatch = match;
            break;
          }
        }
        if (foundMatch) {
          // Cursor inside existing markers → remove them
          const absStart = line.from + foundMatch.index;
          const absEnd = line.from + foundMatch.index + foundMatch[0].length;
          const inner = foundMatch[1];
          view.dispatch({
            changes: { from: absStart, to: absEnd, insert: inner },
            selection: { anchor: absStart, head: absStart + inner.length },
          });
        } else {
          // Not inside markers → insert placeholder with markers and select placeholder
          const replacement = `${prefix}${defaultContent}${suffix}`;
          view.dispatch({
            changes: { from, to, insert: replacement },
            selection: { anchor: from + prefix.length, head: from + prefix.length + defaultContent.length },
          });
        }
      }
      view.focus();
      onClose();
    },
    [hasSelection, onClose, selectedText, selection.from, selection.to, view]
  );

  // Helper: Transform line prefix (Heading, list, todo, quote)
  const transformLinePrefix = useCallback(
    (prefixPattern: RegExp, newPrefix: string) => {
      const doc = view.state.doc;
      const startLine = doc.lineAt(selection.from);
      const endLine = doc.lineAt(selection.to);
      const changes: { from: number; to: number; insert: string }[] = [];

      for (let l = startLine.number; l <= endLine.number; l++) {
        const line = doc.line(l);
        const lineContent = line.text;
        const cleaned = lineContent.replace(prefixPattern, "");
        changes.push({
          from: line.from,
          to: line.to,
          insert: `${newPrefix}${cleaned}`,
        });
      }

      view.dispatch({ changes });
      view.focus();
      onClose();
    },
    [onClose, selection.from, selection.to, view]
  );

  // Helper: Insert text at current cursor
  const insertAtCursor = useCallback(
    (text: string, cursorRelativeOffset?: number) => {
      const from = selection.from;
      const to = selection.to;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: {
          anchor: from + (cursorRelativeOffset ?? text.length),
        },
      });
      view.focus();
      onClose();
    },
    [onClose, selection.from, selection.to, view]
  );

  // Action: Clipboard Cut
  const handleCut = useCallback(() => {
    if (hasSelection) {
      navigator.clipboard.writeText(selectedText);
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: "" },
      });
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, selectedText, selection.from, selection.to, view]);

  // Action: Clipboard Copy
  const handleCopy = useCallback(() => {
    if (hasSelection) {
      navigator.clipboard.writeText(selectedText);
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, selectedText, view]);

  // Action: Clipboard Paste
  const handlePaste = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: clip },
          selection: { anchor: selection.from + clip.length },
        });
      }
    } catch {
      // ignore clipboard permission error
    }
    view.focus();
    onClose();
  }, [onClose, selection.from, selection.to, view]);

  // Action: Extract selection to new note (Obsidian flagship)
  const handleExtractToNote = useCallback(() => {
    const defaultTitle = selectedText
      ? selectedText.split(/\r?\n/)[0].replace(/[#*`_\[\]]/g, "").trim().slice(0, 30)
      : "新笔记";
    if (onExtractToNote) {
      onExtractToNote(selectedText, defaultTitle || "未命名笔记");
    } else {
      // Fallback in-editor: wrap as wikilink
      wrapSelection("[[", "]]", defaultTitle || "新笔记");
    }
    onClose();
  }, [onClose, onExtractToNote, selectedText, wrapSelection]);

  // Action: Create Block Reference (Obsidian style ^block)
  const handleCreateBlockRef = useCallback(() => {
    const doc = view.state.doc;
    const line = doc.lineAt(selection.from);
    const lineText = line.text;
    const match = lineText.match(/\s\^([a-zA-Z0-9_-]+)$/);
    let blockId = "";

    if (match) {
      blockId = match[1];
    } else {
      blockId = "block-" + Math.random().toString(36).slice(2, 8);
      const insertPos = line.to;
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: ` ^${blockId}` },
      });
    }

    const docName = (currentFilePath?.split(/[\\/]/).pop() || "文档").replace(/\.md$/i, "");
    const refLink = `[[${docName}#^${blockId}]]`;
    navigator.clipboard.writeText(refLink);
    view.focus();
    onClose();
  }, [currentFilePath, onClose, selection.from, view]);

  // Action: Send to Flash Capsule
  const handleSendToFlash = useCallback(() => {
    const content = hasSelection ? selectedText : view.state.doc.lineAt(selection.from).text;
    if (content.trim()) {
      if (onSendToFlash) {
        onSendToFlash(content.trim());
      } else {
        navigator.clipboard.writeText(content.trim());
      }
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, onSendToFlash, selectedText, selection.from, view]);

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={{ left: adjustedPos.left, top: adjustedPos.top }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {/* Group 1: Knowledge Operations (Obsidian Powered) */}
      <div className="menu-group">
        <button
          type="button"
          className="context-menu-item"
          onClick={() => wrapSelection("[[", "]]", "文档名称")}
          title="将选中文本包装为双向链接"
        >
          <span className="menu-icon">🔗</span>
          <span className="menu-label">{hasSelection ? "包装为双链 [[选区]]" : "插入双向链接"}</span>
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
      <div className="menu-group">
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

      {/* Group 3: Formatting (Enhanced if selected) */}
      <div className="menu-group">
        <button type="button" className="context-menu-item" onClick={() => wrapSelection("**")}>
          <Bold size={14} className="menu-icon" />
          <span className="menu-label">加粗</span>
          <span className="menu-shortcut">Ctrl+B</span>
        </button>
        <button type="button" className="context-menu-item" onClick={() => wrapSelection("*")}>
          <Italic size={14} className="menu-icon" />
          <span className="menu-label">斜体</span>
          <span className="menu-shortcut">Ctrl+I</span>
        </button>
        <button type="button" className="context-menu-item" onClick={() => wrapSelection("~~")}>
          <Strikethrough size={14} className="menu-icon" />
          <span className="menu-label">删除线</span>
          <span className="menu-shortcut">~~</span>
        </button>
        <button type="button" className="context-menu-item" onClick={() => wrapSelection("`")}>
          <Code size={14} className="menu-icon" />
          <span className="menu-label">行内代码</span>
          <span className="menu-shortcut">`</span>
        </button>
        <button type="button" className="context-menu-item" onClick={() => wrapSelection("==")}>
          <Highlighter size={14} className="menu-icon" />
          <span className="menu-label">文本高亮</span>
          <span className="menu-shortcut">==</span>
        </button>
        <button
          type="button"
          className="context-menu-item"
          onClick={() => wrapSelection("[", "](https://)", "链接文字")}
        >
          <Link size={14} className="menu-icon" />
          <span className="menu-label">插入超链接</span>
          <span className="menu-shortcut">Ctrl+K</span>
        </button>
      </div>

      <div className="menu-divider" />

      {/* Group 4: Line Transform & Insert Submenus */}
      <div className="menu-group">
        {/* Submenu: Paragraph Headings */}
        <div
          className="context-menu-item has-submenu"
          onMouseEnter={() => setActiveSubmenu("headings")}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <Heading1 size={14} className="menu-icon" />
          <span className="menu-label">转为标题</span>
          <ChevronRight size={13} className="submenu-arrow" />
          {activeSubmenu === "headings" && (
            <div className="context-submenu">
              <button
                type="button"
                className="context-menu-item"
                onClick={() => transformLinePrefix(/^(\s*)(#{1,6}\s+)?/, "$1# ")}
              >
                <Heading1 size={14} className="menu-icon" />
                <span className="menu-label">一级标题 H1</span>
                <span className="menu-shortcut">#</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => transformLinePrefix(/^(\s*)(#{1,6}\s+)?/, "$1## ")}
              >
                <Heading2 size={14} className="menu-icon" />
                <span className="menu-label">二级标题 H2</span>
                <span className="menu-shortcut">##</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => transformLinePrefix(/^(\s*)(#{1,6}\s+)?/, "$1### ")}
              >
                <Heading3 size={14} className="menu-icon" />
                <span className="menu-label">三级标题 H3</span>
                <span className="menu-shortcut">###</span>
              </button>
            </div>
          )}
        </div>

        {/* List transformations */}
        <button
          type="button"
          className="context-menu-item"
          onClick={() => transformLinePrefix(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$1- [ ] ")}
        >
          <CheckSquare size={14} className="menu-icon" />
          <span className="menu-label">转为待办清单</span>
          <span className="menu-shortcut">- [ ]</span>
        </button>

        <button
          type="button"
          className="context-menu-item"
          onClick={() => transformLinePrefix(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$1- ")}
        >
          <List size={14} className="menu-icon" />
          <span className="menu-label">转为无序列表</span>
          <span className="menu-shortcut">-</span>
        </button>

        <button
          type="button"
          className="context-menu-item"
          onClick={() => transformLinePrefix(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$11. ")}
        >
          <ListOrdered size={14} className="menu-icon" />
          <span className="menu-label">转为有序列表</span>
          <span className="menu-shortcut">1.</span>
        </button>

        <button
          type="button"
          className="context-menu-item"
          onClick={() => transformLinePrefix(/^(\s*)(>\s*)?/, "$1> ")}
        >
          <Quote size={14} className="menu-icon" />
          <span className="menu-label">转为引用块</span>
          <span className="menu-shortcut">&gt;</span>
        </button>

        {/* Submenu: Insert Rich Blocks */}
        <div
          className="context-menu-item has-submenu"
          onMouseEnter={() => setActiveSubmenu("insert")}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <Table size={14} className="menu-icon" />
          <span className="menu-label">插入内容与图表</span>
          <ChevronRight size={13} className="submenu-arrow" />
          {activeSubmenu === "insert" && (
            <div className="context-submenu">
              <button
                type="button"
                className="context-menu-item"
                onClick={() =>
                  insertAtCursor(
                    "| 标题 1 | 标题 2 | 标题 3 |\n| :--- | :--- | :--- |\n| 内容 1 | 内容 2 | 内容 3 |\n| 内容 4 | 内容 5 | 内容 6 |\n\n",
                    2
                  )
                }
              >
                <Table size={14} className="menu-icon" />
                <span className="menu-label">标准表格 (3×3)</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() =>
                  insertAtCursor("```typescript\n// 在此编写代码\n\n```\n", 14)
                }
              >
                <Code size={14} className="menu-icon" />
                <span className="menu-label">代码块</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => insertAtCursor("\\[\nE = mc^2\n\\]\n\n", 3)}
              >
                <Sigma size={14} className="menu-icon" />
                <span className="menu-label">LaTeX 数学公式</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() =>
                  insertAtCursor(
                    "```mermaid\nflowchart TD\n    A[开始] --> B[处理]\n    B --> C[结束]\n```\n",
                    27
                  )
                }
              >
                <GitFork size={14} className="menu-icon" />
                <span className="menu-label">Mermaid 架构图</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  const d = new Date();
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} `;
                  insertAtCursor(ts);
                }}
              >
                <span className="menu-icon">🕒</span>
                <span className="menu-label">当前时间戳</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="menu-divider" />

      {/* Group 5: Workflow & System Actions */}
      <div className="menu-group">
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

      {/* Footer: Word count and statistics badge */}
      <div className="context-menu-footer">
        {hasSelection ? (
          <span>已选 <strong>{selectedChars}</strong> 字符 · 全文 <strong>{totalWords}</strong> 词 ({totalChars} 字符)</span>
        ) : (
          <span>全文共 <strong>{totalWords}</strong> 词 · <strong>{totalChars}</strong> 字符</span>
        )}
      </div>
    </div>
  );
});
