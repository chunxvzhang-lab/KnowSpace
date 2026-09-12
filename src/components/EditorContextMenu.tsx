import React, { memo, useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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
import {
  generateMarkdownTable,
  clampMenuPosition,
  calculateSubmenuPosition,
} from "../services/tableGenerator";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

interface TablePickerPanelProps {
  onInsert: (rows: number, cols: number) => void;
  anchorPos: { left: number; top: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function TablePickerPanel({
  onInsert,
  anchorPos,
  containerRef,
  onMouseEnter,
  onMouseLeave,
}: TablePickerPanelProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const [pos, setPos] = useState(anchorPos);

  useIsomorphicLayoutEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    let nextTop = anchorPos.top;
    let nextLeft = anchorPos.left;

    if (rect.bottom > vh - 12) {
      const overflow = rect.bottom - (vh - 12);
      nextTop = Math.max(12, anchorPos.top - overflow);
    }
    if (rect.right > vw - 12) {
      const overflow = rect.right - (vw - 12);
      nextLeft = Math.max(12, anchorPos.left - overflow);
    }
    if (nextTop !== pos.top || nextLeft !== pos.left) {
      setPos({ left: nextLeft, top: nextTop });
    }
  }, [anchorPos.top, anchorPos.left, containerRef]);

  const effectiveRows = hoveredRow !== null ? hoveredRow : rows;
  const effectiveCols = hoveredCol !== null ? hoveredCol : cols;

  const handleCellClick = (r: number, c: number) => {
    onInsert(r, c);
  };

  const handleApply = () => {
    onInsert(rows, cols);
  };

  const presets = [
    { label: "2×2", r: 2, c: 2 },
    { label: "3×3", r: 3, c: 3 },
    { label: "4×5", r: 4, c: 5 },
    { label: "5×5", r: 5, c: 5 },
    { label: "8×4", r: 4, c: 8 },
  ];

  return (
    <div
      ref={containerRef}
      className="editor-context-menu portal-submenu table-picker-panel"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      aria-label="自定义表格行列选择器"
    >
      <div className="table-picker-header">
        <div className="table-picker-title">
          <Table size={15} style={{ color: "#38bdf8" }} />
          <span>自定义表格</span>
        </div>
        <span className="table-picker-badge">
          {effectiveRows} 行 × {effectiveCols} 列
        </span>
      </div>

      <div className="table-picker-desc">
        {effectiveRows > 1 ? `1 行表头 + ${effectiveRows - 1} 行数据` : "1 行表头"}
      </div>

      {/* 8 cols x 6 rows visual matrix */}
      <div
        className="table-grid-matrix"
        onMouseLeave={() => {
          setHoveredRow(null);
          setHoveredCol(null);
        }}
      >
        {Array.from({ length: 6 }, (_, rIndex) => {
          const r = rIndex + 1;
          return Array.from({ length: 8 }, (_, cIndex) => {
            const c = cIndex + 1;
            const isHighlighted = r <= effectiveRows && c <= effectiveCols;
            return (
              <div
                key={`${r}-${c}`}
                className={`table-grid-cell ${isHighlighted ? "highlighted" : ""}`}
                onMouseEnter={() => {
                  setHoveredRow(r);
                  setHoveredCol(c);
                }}
                onClick={() => handleCellClick(r, c)}
                title={`${r} 行 × ${c} 列 表格 (点击插入)`}
              />
            );
          });
        })}
      </div>

      {/* Steppers for rows and columns */}
      <div className="table-picker-controls">
        <div className="table-dimension-stepper">
          <span className="table-dim-label">行数:</span>
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setRows((prev) => Math.max(1, prev - 1))}
            title="减少行数"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            max={50}
            className="table-num-input"
            value={rows}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) setRows(Math.max(1, Math.min(50, val)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
          />
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setRows((prev) => Math.min(50, prev + 1))}
            title="增加行数"
          >
            +
          </button>
        </div>

        <div className="table-dimension-stepper">
          <span className="table-dim-label">列数:</span>
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setCols((prev) => Math.max(1, prev - 1))}
            title="减少列数"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            max={20}
            className="table-num-input"
            value={cols}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) setCols(Math.max(1, Math.min(20, val)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
          />
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setCols((prev) => Math.min(20, prev + 1))}
            title="增加列数"
          >
            +
          </button>
        </div>
      </div>

      {/* Preset pills */}
      <div className="table-presets-row">
        <span style={{ fontSize: "11px", opacity: 0.65 }}>常用:</span>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="table-preset-chip"
            onClick={() => {
              setRows(p.r);
              setCols(p.c);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Primary Confirm Button */}
      <button
        type="button"
        className="table-insert-btn"
        onClick={handleApply}
      >
        <Table size={13} />
        <span>确认插入表格 (Enter)</span>
      </button>
    </div>
  );
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
  const submenuRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  type SubmenuType = "headings" | "lists" | "insert" | "tablePicker" | null;

  // Submenu states: single mutually-exclusive active submenu
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>(null);
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);

  // Initial estimate safe positioning (compact height ~340px prevents clipping)
  const [adjustedPos, setAdjustedPos] = useState(() => {
    const defaultViewport = {
      width: typeof window !== "undefined" ? window.innerWidth : 1280,
      height: typeof window !== "undefined" ? window.innerHeight : 800,
    };
    return clampMenuPosition(x, y, 260, 340, defaultViewport, 12);
  });

  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selection = view.state.selection.main;
  const hasSelection = !selection.empty;
  const selectedText = hasSelection ? view.state.sliceDoc(selection.from, selection.to) : "";
  const docText = view.state.doc.toString();

  // Calculate word and character statistics
  const totalChars = docText.length;
  const totalWords = (docText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_-]+/g) || []).length;
  const selectedChars = selectedText.length;

  // Viewport-safe positioning with useLayoutEffect for flicker-free clamping
  useIsomorphicLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const clamped = clampMenuPosition(x, y, rect.width, rect.height, viewport, 12);
    setAdjustedPos(clamped);
  }, [x, y]);

  // Submenu dynamic viewport boundary clamping
  useIsomorphicLayoutEffect(() => {
    if (!submenuRef.current || !submenuPos) return;
    const rect = submenuRef.current.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    let nextTop = submenuPos.top;
    let nextLeft = submenuPos.left;
    let changed = false;

    if (rect.bottom > vh - 12) {
      const overflow = rect.bottom - (vh - 12);
      nextTop = Math.max(12, submenuPos.top - overflow);
      changed = true;
    }
    if (rect.right > vw - 12) {
      const overflow = rect.right - (vw - 12);
      nextLeft = Math.max(12, submenuPos.left - overflow);
      changed = true;
    }
    if (changed) {
      setSubmenuPos({ left: nextLeft, top: nextTop });
    }
  }, [activeSubmenu]);

  // Click outside and Esc listener
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !submenuRef.current?.contains(target) &&
        !tablePickerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeSubmenu) {
          setActiveSubmenu(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      if (submenuCloseTimer.current) {
        clearTimeout(submenuCloseTimer.current);
      }
    };
  }, [activeSubmenu, onClose]);

  // Helper: Open Submenu with smooth viewport coordinate calculation
  const handleOpenSubmenu = useCallback(
    (name: SubmenuType, anchorEl: HTMLElement, width = 190, height = 200) => {
      if (submenuCloseTimer.current) {
        clearTimeout(submenuCloseTimer.current);
        submenuCloseTimer.current = null;
      }
      const anchorRect = anchorEl.getBoundingClientRect();
      const pos = calculateSubmenuPosition(anchorRect, width, height, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setSubmenuPos(pos);
      setActiveSubmenu(name);
    },
    []
  );

  // Helper: Open Table Picker Panel
  const handleOpenTablePicker = useCallback(
    (anchorEl: HTMLElement) => {
      handleOpenSubmenu("tablePicker", anchorEl, 264, 310);
    },
    [handleOpenSubmenu]
  );

  const handleScheduleClose = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
    }
    submenuCloseTimer.current = setTimeout(() => {
      setActiveSubmenu(null);
      submenuCloseTimer.current = null;
    }, 220);
  }, []);

  const handleCancelClose = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  }, []);

  const handleImmediateCloseSubmenu = useCallback(() => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
    setActiveSubmenu(null);
  }, []);

  // Helper: Toggle wrapping
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
          const absStart = line.from + foundMatch.index;
          const absEnd = line.from + foundMatch.index + foundMatch[0].length;
          const inner = foundMatch[1];
          view.dispatch({
            changes: { from: absStart, to: absEnd, insert: inner },
            selection: { anchor: absStart, head: absStart + inner.length },
          });
        } else {
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

  // Action: Insert Custom Table
  const handleInsertTableDimensions = useCallback(
    (r: number, c: number) => {
      const { markdown, cursorOffset } = generateMarkdownTable(r, c);
      insertAtCursor(markdown, cursorOffset);
    },
    [insertAtCursor]
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
    <>
      {typeof document !== "undefined" && createPortal(
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
            <div className="format-ribbon" role="toolbar" aria-label="文字格式工具栏" onMouseEnter={handleImmediateCloseSubmenu}>
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
              <span>已选 <strong>{selectedChars}</strong> 字符 · 全文 <strong>{totalWords}</strong> 词 ({totalChars} 字符)</span>
            ) : (
              <span>全文共 <strong>{totalWords}</strong> 词 · <strong>{totalChars}</strong> 字符</span>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Submenu Portal 1: Headings */}
      {activeSubmenu === "headings" && submenuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={submenuRef}
          className="editor-context-menu portal-submenu"
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onMouseEnter={handleCancelClose}
          onMouseLeave={handleScheduleClose}
          role="menu"
        >
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
        </div>,
        document.body
      )}

      {/* Submenu Portal: Lists & Blockquotes */}
      {activeSubmenu === "lists" && submenuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={submenuRef}
          className="editor-context-menu portal-submenu"
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onMouseEnter={handleCancelClose}
          onMouseLeave={handleScheduleClose}
          role="menu"
        >
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
        </div>,
        document.body
      )}

      {/* Submenu Portal 2: Insert Content & Diagrams */}
      {activeSubmenu === "insert" && submenuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={submenuRef}
          className="editor-context-menu portal-submenu"
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onMouseEnter={handleCancelClose}
          onMouseLeave={handleScheduleClose}
          role="menu"
        >
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
        </div>,
        document.body
      )}

      {/* Submenu Portal 3: Table Picker Panel (Visual matrix + numeric steppers + presets) */}
      {activeSubmenu === "tablePicker" && submenuPos && typeof document !== "undefined" && createPortal(
        <TablePickerPanel
          containerRef={tablePickerRef}
          anchorPos={submenuPos}
          onInsert={handleInsertTableDimensions}
          onMouseEnter={handleCancelClose}
          onMouseLeave={handleScheduleClose}
        />,
        document.body
      )}
    </>
  );
});
