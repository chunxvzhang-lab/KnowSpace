import { memo } from "react";
import type { CSSProperties } from "react";
import { Link, Spline, ArrowLeftRight, Shuffle, Trash2, X } from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { CanvasEdgeLineStyle } from "../../types/canvasTypes";
import { CANVAS_COLOR_PALETTES } from "../../services/canvasService";

/**
 * Floating toolbar shown when two or more edges are selected.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * Every action is reported through a callback; this component mutates nothing,
 * which is what lets it live outside the gesture/state machinery of the parent.
 */
type CanvasEdgeBatchToolbarProps = {
  count: number;
  theme: ThemeMode;
  isDark: boolean;
  colors: { cardBorder: string; cardText: string };
  onSetStyle: (style: CanvasEdgeLineStyle) => void;
  onCycleStrokePattern: () => void;
  onToggleArrow: () => void;
  onReverse: () => void;
  onSetColor: (colorKey: string) => void;
  onDelete: () => void;
  onClear: () => void;
};

const LINE_STYLES: Array<{ value: CanvasEdgeLineStyle; label: string; title: string }> = [
  { value: "bezier", label: "曲线", title: "批量设为: 贝塞尔曲线" },
  { value: "step", label: "折线", title: "批量设为: 直角折线" },
  { value: "straight", label: "直线", title: "批量设为: 直线" },
];

export const CanvasEdgeBatchToolbar = memo(function CanvasEdgeBatchToolbar({
  count,
  theme,
  isDark,
  colors,
  onSetStyle,
  onCycleStrokePattern,
  onToggleArrow,
  onReverse,
  onSetColor,
  onDelete,
  onClear,
}: CanvasEdgeBatchToolbarProps) {
  // The six actions below all share one button treatment; it lived inline on
  // each of them before the split.
  const toolBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "3px 7px",
    borderRadius: 6,
    border: `1px solid ${colors.cardBorder}`,
    background: "transparent",
    color: colors.cardText,
    cursor: "pointer",
    fontSize: 11,
  };

  const divider = (
    <div style={{ width: 1, height: 16, background: colors.cardBorder, margin: "0 2px" }} />
  );

  return (
    <div
      className="canvas-edge-batch-toolbar"
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 24,
        background: theme === "eink" ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        pointerEvents: "all",
        whiteSpace: "nowrap",
        fontSize: 12,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontWeight: 600,
          color: "#f59e0b",
          paddingRight: 4,
        }}
      >
        <Link size={14} />
        <span>已选中 {count} 条连线</span>
      </div>

      {divider}

      {/* Line Style options */}
      <div style={{ display: "flex", gap: 3 }}>
        {LINE_STYLES.map((option) => (
          <button
            key={option.value}
            onClick={() => onSetStyle(option.value)}
            style={toolBtn}
            title={option.title}
          >
            <Spline size={11} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {divider}

      {/* Stroke pattern cycle */}
      <button onClick={onCycleStrokePattern} style={toolBtn} title="批量切换虚实 (实线 / 虚线 / 点线)">
        <span style={{ fontSize: 10, letterSpacing: 1 }}>- -</span>
        <span>虚实</span>
      </button>

      {/* Arrow toggle */}
      <button onClick={onToggleArrow} style={toolBtn} title="批量切换箭头 (无 / 单向 / 双向)">
        <ArrowLeftRight size={12} />
        <span>箭头</span>
      </button>

      {/* Reverse flow */}
      <button
        onClick={onReverse}
        style={{ ...toolBtn, color: "#0284c7" }}
        title="批量反转连线流向 (R)"
      >
        <Shuffle size={12} />
        <span>反向</span>
      </button>

      {divider}

      {/* Color dots — wraps onto a second row now that the palette carries
          twelve swatches. */}
      <div className="canvas-ctx-colors" style={{ gap: 4, maxWidth: 190 }}>
        {Object.entries(CANVAS_COLOR_PALETTES).map(([k, c]) => (
          <div
            key={k}
            onClick={() => onSetColor(k)}
            style={{
              width: 13,
              height: 13,
              borderRadius: "50%",
              backgroundColor: c.stroke,
              cursor: "pointer",
              border: "1px solid rgba(0,0,0,0.15)",
            }}
            title={`批量设为: ${c.label}`}
          />
        ))}
      </div>

      {divider}

      {/* Delete edges */}
      <button
        onClick={onDelete}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: "3px 7px",
          borderRadius: 6,
          border: "none",
          background: "none",
          color: "#ef4444",
          cursor: "pointer",
          fontSize: 11,
        }}
        title="批量删除所选连线 (Delete)"
      >
        <Trash2 size={13} />
        <span>删除</span>
      </button>

      {/* Dismiss / clear selection */}
      <button
        onClick={onClear}
        style={{
          background: "none",
          border: "none",
          padding: "2px",
          cursor: "pointer",
          color: colors.cardText,
          opacity: 0.6,
          display: "flex",
          alignItems: "center",
          marginLeft: 2,
        }}
        title="取消选择"
      >
        <X size={13} />
      </button>
    </div>
  );
});
