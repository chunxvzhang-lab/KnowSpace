import type { RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Heading1,
  Heading2,
  Heading3,
  CheckSquare,
  List,
  ListOrdered,
  Quote,
  Eraser,
  Code,
  Sigma,
  GitFork,
} from "lucide-react";
import type { SubmenuType } from "./useSubmenuController";
import { TablePickerPanel } from "./TablePickerPanel";

type SubmenuPortalsProps = {
  activeSubmenu: SubmenuType;
  submenuPos: { left: number; top: number } | null;
  submenuRef: RefObject<HTMLDivElement | null>;
  tablePickerRef: RefObject<HTMLDivElement | null>;
  handleCancelClose: () => void;
  handleScheduleClose: () => void;
  transformLinePrefix: (
    prefixPattern: RegExp,
    newPrefix: string | ((indent: string, ordinal: number) => string),
  ) => void;
  insertAtCursor: (text: string, cursorRelativeOffset?: number) => void;
  handleInsertTableDimensions: (r: number, c: number) => void;
};

/**
 * The four hover-opened submenu portals: headings, lists & blockquotes,
 * insert blocks/diagrams, and the table-picker panel.
 *
 * Extracted verbatim from EditorContextMenu (decomposition of the context
 * menu): the conditional portals below are the original fragment children,
 * prop-driven. Mutually exclusive by construction — the composition root's
 * `activeSubmenu` state only ever holds one value, so at most one portal
 * mounts here; `handleCancelClose`/`handleScheduleClose` implement the
 * hover-intent 220ms grace period owned by `useSubmenuController`.
 */
export function SubmenuPortals({
  activeSubmenu,
  submenuPos,
  submenuRef,
  tablePickerRef,
  handleCancelClose,
  handleScheduleClose,
  transformLinePrefix,
  insertAtCursor,
  handleInsertTableDimensions,
}: SubmenuPortalsProps) {
  return (
    <>
      {/* Submenu Portal 1: Headings */}
      {activeSubmenu === "headings" &&
        submenuPos &&
        typeof document !== "undefined" &&
        createPortal(
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
          document.body,
        )}

      {/* Submenu Portal: Lists & Blockquotes */}
      {activeSubmenu === "lists" &&
        submenuPos &&
        typeof document !== "undefined" &&
        createPortal(
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
                transformLinePrefix(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$1- [ ] ")
              }
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
              onClick={() =>
                transformLinePrefix(
                  /^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/,
                  (indent, n) => `${indent}${n}. `,
                )
              }
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
            {/* The cancel the family never had: strip every marker this
                submenu (and 转为标题) can put on a line. */}
            <button
              type="button"
              className="context-menu-item"
              onClick={() =>
                transformLinePrefix(
                  /^(\s*)(?:#{1,6}\s+|>\s+)?(?:[-*+]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?/,
                  "$1",
                )
              }
            >
              <Eraser size={14} className="menu-icon" />
              <span className="menu-label">转为普通文本</span>
              <span className="menu-shortcut">取消格式</span>
            </button>
          </div>,
          document.body,
        )}

      {/* Submenu Portal 2: Insert Content & Diagrams */}
      {activeSubmenu === "insert" &&
        submenuPos &&
        typeof document !== "undefined" &&
        createPortal(
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
              onClick={() => insertAtCursor("```typescript\n// 在此编写代码\n\n```\n", 14)}
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
                  27,
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
          document.body,
        )}

      {/* Submenu Portal 3: Table Picker Panel (Visual matrix + numeric steppers + presets) */}
      {activeSubmenu === "tablePicker" &&
        submenuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <TablePickerPanel
            containerRef={tablePickerRef}
            anchorPos={submenuPos}
            onInsert={handleInsertTableDimensions}
            onMouseEnter={handleCancelClose}
            onMouseLeave={handleScheduleClose}
          />,
          document.body,
        )}
    </>
  );
}
