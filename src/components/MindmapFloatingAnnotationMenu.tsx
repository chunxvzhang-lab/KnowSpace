import type { RefObject } from "react";
import { StickyNote, Trash2, X } from "lucide-react";
import {
  MindmapAnnotationSections,
  type MindmapAnnotationSectionsProps,
} from "./MindmapAnnotationSections";

/**
 * The panel a right click on a floating topic opens.
 *
 * Deliberately not the node style panel with half of it hidden: a floating topic
 * has no level, no parent, no branch and no shape to speak of, so the appearance
 * controls there would be describing something this topic is not. What it does
 * have is the same five annotations a topic in the outline has, which is why the
 * sections are shared and this is the header and the one action it needs.
 *
 * Its subject is a topic the outline does not own, but the panel does not act on
 * that: every control below writes by id into the companion file, and that is the
 * same file, the same sections, and the same ids.
 */
export function MindmapFloatingAnnotationMenu({
  open,
  position,
  menuRef,
  topicText,
  onDelete,
  onClose,
  ...annotations
}: MindmapAnnotationSectionsProps & {
  open: boolean;
  /** Where the panel sits, in the canvas container's coordinates. */
  position: { left: number; top: number };
  menuRef: RefObject<HTMLDivElement | null>;
  /** The topic's own text, for the header. */
  topicText: string;
  /** Takes the topic off the canvas, along with what was written on it. */
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="mindmap-context-menu"
      style={{ left: position.left, top: position.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mindmap-ctx-header">
        <span className="mindmap-ctx-title" title={topicText || "自由主题"}>
          <StickyNote size={13} className="text-cyan" />
          {topicText || "自由主题"}
        </span>
        <button
          type="button"
          className="mindmap-ctx-close"
          onClick={() => onClose()}
          title="关闭"
        >
          <X size={13} />
        </button>
      </div>

      <MindmapAnnotationSections {...annotations} />

      <div className="mindmap-ctx-divider" />

      <button
        type="button"
        className="mindmap-ctx-action-item is-delete"
        onClick={onDelete}
        title="删掉这个主题，以及写在它上面的标注"
      >
        <Trash2 size={13} />
        <span>删除自由主题</span>
      </button>
    </div>
  );
}
