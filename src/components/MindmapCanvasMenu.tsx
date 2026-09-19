import type { RefObject } from "react";
import { CornerDownRight, FoldVertical, Link, ListTree, Maximize2, PlusCircle, UnfoldVertical, X } from "lucide-react";

/**
 * The menu that opens on empty mind map canvas.
 *
 * Separate from the node menu rather than a branch of it. The node menu styles
 * and deletes one branch and is built around colour swatches; these rows act on
 * the whole map and share none of that. Merging them would mean one component
 * carrying both its own concerns and a large conditional it never needs.
 *
 * Extracted as the first slice of breaking up MindmapView, which is the
 * prerequisite for the theme work: it is self-contained, its contents were
 * written recently enough to still be familiar, and it takes callbacks rather
 * than state, so nothing has to move with it.
 */
export type MindmapCanvasMenuProps = {
  /** Position within the canvas container, already measured by the caller. */
  left: number;
  top: number;
  /** Shared with the node menu, so the outside-click handler sees this one too. */
  menuRef: RefObject<HTMLDivElement | null>;
  /** Whether anything has been copied; the paste row is disabled until then. */
  canPaste: boolean;
  /** How many topics are selected. A relation needs exactly two. */
  selectedCount: number;
  /** Whether those two are already connected, which turns the row into a removal. */
  selectionRelated: boolean;
  onClose: () => void;
  onNewTopic: () => void;
  onPaste: () => void;
  onToggleRelation: () => void;
  onExpandAll: () => void;
  onCollapseToLevel2: () => void;
  onFitToScreen: () => void;
};

export function MindmapCanvasMenu({
  left,
  top,
  menuRef,
  canPaste,
  selectedCount,
  selectionRelated,
  onClose,
  onNewTopic,
  onPaste,
  onToggleRelation,
  onExpandAll,
  onCollapseToLevel2,
  onFitToScreen,
}: MindmapCanvasMenuProps) {
  return (
    <div
      ref={menuRef}
      className="mindmap-context-menu mindmap-canvas-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mindmap-ctx-header">
        <span className="mindmap-ctx-title">
          <ListTree size={13} className="text-cyan" />
          画布
        </span>
        <button type="button" className="mindmap-ctx-close" onClick={onClose} title="关闭">
          <X size={13} />
        </button>
      </div>

      <button type="button" className="mindmap-ctx-item" onClick={onNewTopic}>
        <PlusCircle size={13} />
        <span>新建主题</span>
      </button>

      <button
        type="button"
        className="mindmap-ctx-item"
        onClick={onPaste}
        disabled={!canPaste}
        // Disabled rather than hidden, and titled: a row that says why beats a
        // row that is simply absent, which reads as a missing feature.
        title={canPaste ? "粘贴已复制的分支" : "先复制一个分支"}
      >
        <CornerDownRight size={13} />
        <span>粘贴</span>
      </button>

      {/* A relation needs two topics, and two topics are what a Ctrl-click
          selection already is — so the gesture is the selection the reader
          already knows rather than a new mode to learn. Disabled with the reason
          when the selection is not two, like the paste row above. */}
      <button
        type="button"
        className="mindmap-ctx-item"
        onClick={onToggleRelation}
        disabled={selectedCount !== 2}
        title={
          selectedCount === 2
            ? selectionRelated
              ? "取消这两个主题之间的关系线"
              : "在两个主题之间画一条关系线（只存在导图里，不进文档）"
            : "先选中两个主题（Ctrl 点第二个）"
        }
      >
        <Link size={13} />
        <span>{selectionRelated ? "取消关系线" : "连接这两个主题"}</span>
      </button>

      <div className="mindmap-ctx-divider" />

      <button type="button" className="mindmap-ctx-item" onClick={onExpandAll}>
        <UnfoldVertical size={13} />
        <span>全部展开</span>
      </button>

      <button type="button" className="mindmap-ctx-item" onClick={onCollapseToLevel2}>
        <FoldVertical size={13} />
        <span>折叠至 2 级</span>
      </button>

      <button type="button" className="mindmap-ctx-item" onClick={onFitToScreen}>
        <Maximize2 size={13} />
        <span>适应画布</span>
      </button>
    </div>
  );
}
