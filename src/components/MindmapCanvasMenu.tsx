import type { RefObject } from "react";
import { Braces, CornerDownRight, FoldVertical, Link, ListTree, Maximize2, PlusCircle, SquareDashed, StickyNote, Trash2, Type, UnfoldVertical, X } from "lucide-react";
import { MINDMAP_MARK_COLORS } from "../core/mindmapPalette";
import { MINDMAP_RELATION_ARROWS, MINDMAP_RELATION_STYLES } from "../core/mindmapRelations";

/**
 * The swatches for a mark's colour, shared by the boundary's box and a relation's
 * line. One row for both because it is one palette: a reader picks a colour the
 * same way whatever the shape is, and the two rows would otherwise drift apart.
 */
function MarkColorSwatches({
  activeId,
  labelPrefix,
  onPick,
}: {
  activeId: string;
  labelPrefix: string;
  onPick: (colorId: string) => void;
}) {
  return (
    <>
      {MINDMAP_MARK_COLORS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`mindmap-boundary-color ${activeId === entry.id ? "is-active" : ""}`}
          style={{ background: entry.color }}
          onClick={() => onPick(entry.id)}
          title={entry.label}
          aria-label={`${labelPrefix} ${entry.label}`}
        />
      ))}
    </>
  );
}

/**
 * A direction the reader can read, from a direction only the file can.
 *
 * `forward` and `backward` are relative to the stored pair, whose order is an
 * accident of how the two ids are spelled — so the button says which topics it
 * means rather than which way round the pair happens to be.
 */
function relationArrowLabel(
  id: string,
  relation: { fromText: string; toText: string }
): string {
  if (id === "forward") return `${relation.fromText} → ${relation.toText}`;
  if (id === "backward") return `${relation.toText} → ${relation.fromText}`;
  if (id === "both") return "双向";
  return "无";
}

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
  /** The floating topic under the cursor, if the reader has picked one. */
  selectedFloatingText: string | null;
  /** Whether the selection is a group a summary could bracket. */
  canSummarise: boolean;
  /** Whether anything is selected at all — one topic is enough for a boundary. */
  canBound: boolean;
  /** The boundary the reader has picked, if any. */
  selectedBoundary: { id: string; text: string; colorId?: string } | null;
  onBoundaryColorChange: (colorId: string) => void;
  onRemoveBoundary: () => void;
  onAddBoundary: () => void;
  /**
   * The line the reader has picked, if any, with what it joins.
   *
   * The two topics' names come along because the arrow's directions are stored
   * relative to the pair's canonical order, and "forward" is not something a
   * reader can be asked to translate — the menu says "甲 → 乙" instead.
   */
  selectedRelation: {
    label: string;
    arrow: string;
    style: string;
    color: string;
    fromText: string;
    toText: string;
  } | null;
  onEditRelationLabel: () => void;
  onRelationChange: (field: "arrow" | "style" | "color", value: string) => void;
  onRemoveRelation: () => void;
  /** The summary the reader has picked, if any, and its label. */
  selectedSummaryText: string | null;
  onClose: () => void;
  onNewTopic: () => void;
  onNewFloatingTopic: () => void;
  onRemoveFloatingTopic: () => void;
  onPaste: () => void;
  onToggleRelation: () => void;
  onAddSummary: () => void;
  onRemoveSummary: () => void;
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
  selectedFloatingText,
  canSummarise,
  canBound,
  selectedBoundary,
  onBoundaryColorChange,
  onRemoveBoundary,
  onAddBoundary,
  selectedRelation,
  onEditRelationLabel,
  onRelationChange,
  onRemoveRelation,
  selectedSummaryText,
  onClose,
  onNewTopic,
  onNewFloatingTopic,
  onRemoveFloatingTopic,
  onPaste,
  onToggleRelation,
  onAddSummary,
  onRemoveSummary,
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

      {/* Free topics. Created where the reader right-clicked, which is the one
          place in this menu whose position means something — so the menu's own
          coordinates are handed over rather than a default spot. */}
      <button type="button" className="mindmap-ctx-item" onClick={onNewFloatingTopic}>
        <StickyNote size={13} />
        <span>新建自由主题</span>
      </button>

      {selectedFloatingText ? (
        <button
          type="button"
          className="mindmap-ctx-item"
          onClick={onRemoveFloatingTopic}
          title={`删除自由主题「${selectedFloatingText}」`}
        >
          <Trash2 size={13} />
          <span>删除自由主题</span>
        </button>
      ) : null}

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
        {/* 名字里写明贴的是什么：这一行贴的是整个主题（含它的子主题），
            不是剪贴板里的文字 —— 要贴文字请在编辑框里按 Ctrl+V。 */}
        <span>粘贴分支</span>
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

      {/* A summary is about a group the reader picked, so the same selection
          serves again: two or more topics become a bracket and a sentence. */}
      <button
        type="button"
        className="mindmap-ctx-item"
        onClick={onAddSummary}
        disabled={!canSummarise}
        title={canSummarise ? "为选中的几个主题加一个概要括号" : "先选中两个或更多主题"}
      >
        <Braces size={13} />
        <span>为本组加概要</span>
      </button>

      {selectedSummaryText !== null ? (
        <button
          type="button"
          className="mindmap-ctx-item"
          onClick={onRemoveSummary}
          title={`删除概要「${selectedSummaryText || "（无标签）"}」`}
        >
          <Trash2 size={13} />
          <span>删除概要</span>
        </button>
      ) : null}

      {/* A boundary takes one topic as readily as ten: a box around a single
          topic says "this one is its own thing", which a bracket cannot say. */}
      <button
        type="button"
        className="mindmap-ctx-item"
        onClick={onAddBoundary}
        disabled={!canBound}
        title={canBound ? "把选中的主题框起来" : "先选中一个或更多主题"}
      >
        <SquareDashed size={13} />
        <span>为本组加边界</span>
      </button>

      {/* The colour row appears only once there is a boundary to colour, since it
          is a row of swatches with nothing to explain it otherwise. */}
      {selectedBoundary ? (
        <div className="mindmap-boundary-colors" title="边界颜色">
          <MarkColorSwatches
            activeId={selectedBoundary.colorId ?? ""}
            labelPrefix="边界颜色"
            onPick={onBoundaryColorChange}
          />
          <button
            type="button"
            className="mindmap-ctx-item mindmap-ctx-item-inline"
            onClick={onRemoveBoundary}
            title={`删除边界「${selectedBoundary.text || "（无标题）"}」`}
          >
            <Trash2 size={12} />
            <span>删除边界</span>
          </button>
        </div>
      ) : null}

      {/* A picked line, and everything that can be said about it. Its label is
          offered as a row as well as by double-clicking the line: the row is how
          the feature is found, and the double click is how it is used. */}
      {selectedRelation ? (
        <div className="mindmap-relation-panel">
          <button
            type="button"
            className="mindmap-ctx-item"
            onClick={onEditRelationLabel}
            title="双击那条线也一样"
          >
            <Type size={13} />
            <span>{selectedRelation.label ? `改标签「${selectedRelation.label}」` : "为这条线写字"}</span>
          </button>

          <div className="mindmap-ctx-label-row">
            <span className="mindmap-ctx-label">箭头</span>
          </div>
          <div className="mindmap-mark-row">
            {MINDMAP_RELATION_ARROWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`mindmap-relation-btn ${
                  (selectedRelation.arrow || "none") === entry.id ? "is-active" : ""
                }`}
                onClick={() => onRelationChange("arrow", entry.id === "none" ? "" : entry.id)}
                title={
                  entry.id === "forward"
                    ? `从「${selectedRelation.fromText}」指向「${selectedRelation.toText}」`
                    : entry.id === "backward"
                      ? `从「${selectedRelation.toText}」指向「${selectedRelation.fromText}」`
                      : entry.label
                }
                aria-label={relationArrowLabel(entry.id, selectedRelation)}
              >
                {relationArrowLabel(entry.id, selectedRelation)}
              </button>
            ))}
          </div>

          <div className="mindmap-ctx-label-row">
            <span className="mindmap-ctx-label">线条</span>
          </div>
          <div className="mindmap-mark-row">
            {MINDMAP_RELATION_STYLES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`mindmap-relation-btn ${
                  (selectedRelation.style || "dashed") === entry.id ? "is-active" : ""
                }`}
                onClick={() => onRelationChange("style", entry.id === "dashed" ? "" : entry.id)}
                title={entry.label}
                aria-label={`线条 ${entry.label}`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mindmap-ctx-label-row">
            <span className="mindmap-ctx-label">颜色</span>
            <span className="mindmap-ctx-hint">
              {selectedRelation.color ? "" : "跟随主题"}
            </span>
          </div>
          <div className="mindmap-boundary-colors">
            <MarkColorSwatches
              activeId={selectedRelation.color}
              labelPrefix="线条颜色"
              onPick={(colorId) => onRelationChange("color", colorId)}
            />
            <button
              type="button"
              className="mindmap-ctx-item mindmap-ctx-item-inline"
              onClick={onRemoveRelation}
              title="断开这条线（线与它的标签一起消失）"
            >
              <Trash2 size={12} />
              <span>断开</span>
            </button>
          </div>
        </div>
      ) : null}

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
