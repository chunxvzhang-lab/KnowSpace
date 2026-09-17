import type { RefObject } from "react";
import { CornerDownRight, FoldVertical, ListTree, Maximize2, PlusCircle, UnfoldVertical, X } from "lucide-react";

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
  onClose: () => void;
  onNewTopic: () => void;
  onPaste: () => void;
  onExpandAll: () => void;
  onCollapseToLevel2: () => void;
  onFitToScreen: () => void;
};

export function MindmapCanvasMenu({
  left,
  top,
  menuRef,
  canPaste,
  onClose,
  onNewTopic,
  onPaste,
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
