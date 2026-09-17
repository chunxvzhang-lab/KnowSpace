import type { RefObject } from "react";
import type { MindmapTextAlign } from "../core/types";

/**
 * The textarea that edits a node in place.
 *
 * Positioned by hand rather than by a CSS transform, because it is a sibling of
 * the canvas rather than a child of the SVG's viewport group: the offsets are
 * the canvas transform applied by hand, which is why every one of them is
 * multiplied by `scale`. Being outside the SVG is deliberate — a textarea is not
 * an SVG element, and putting it inside would mean foreignObject and the
 * inconsistent behaviour that comes with it.
 *
 * The keyboard handling is the reason this is worth reading before changing.
 * Enter commits and Shift+Enter inserts a newline, so the check is for Enter
 * *without* the modifier. Escape cancels, which has to beat the canvas handler's
 * own Escape — the canvas one is guarded by the same `editingNodeId` check that
 * keeps F2 and Delete from firing mid-edit.
 */
export type MindmapInlineEditorProps = {
  /** Canvas coordinates and the appearance to match the node being edited. */
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    /**
     * Typed as the model's own union rather than `string`: the callers hand over
     * a layout node, and a plain string here is what let a mismatch through —
     * the value is written straight into a CSS property whose type is narrower.
     */
    textAlign?: MindmapTextAlign;
  };
  /** The canvas pan and zoom, so the editor sits exactly over its node. */
  transform: { x: number; y: number; scale: number };
  value: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function MindmapInlineEditor({
  node,
  transform,
  value,
  inputRef,
  onChange,
  onCommit,
  onCancel,
}: MindmapInlineEditorProps) {
  return (
    <textarea
      ref={inputRef}
      className="mindmap-inline-edit-input"
      style={{
        position: "absolute",
        left: transform.x + node.x * transform.scale,
        top: transform.y + node.y * transform.scale,
        width: Math.max(120, node.width * transform.scale),
        height: Math.max(30, node.height * transform.scale),
        fontSize: `${Math.max(11, Math.round((node.fontSize || 13) * transform.scale))}px`,
        fontWeight: node.fontWeight === "bold" ? 700 : 500,
        // justify has no meaning in a textarea, so it falls back to left rather
        // than being handed to CSS to ignore.
        textAlign: (node.textAlign === "justify" ? "left" : node.textAlign) || "center",
        resize: "none",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
