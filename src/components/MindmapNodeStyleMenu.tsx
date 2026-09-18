import type { RefObject } from "react";
import {
  CornerDownRight,
  Edit3,
  PlusCircle,
  Trash2,
  Palette,
  Check,
  X,
  Bold,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  RotateCcw,
  Snowflake,
} from "lucide-react";
import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";

/**
 * The node style panel: what a right click on a node opens.
 *
 * Split out of MindmapView, which was 2540 lines with this and nothing else of
 * its size left in it. Nothing about it changed in the move: the markup, the
 * class names and the preset tables are the same, so the stylesheet and the
 * tests that look for them keep working.
 *
 * Holds no state. Every control writes through `onUpdateStyle` to the node the
 * caller names, and what the panel shows as active comes from that node's own
 * styles rather than from a copy kept here — a second copy is how the panel ends
 * up disagreeing with the map it is describing.
 */
export type MindmapNodeStyleMenuProps = {
  open: boolean;
  /** Where the panel sits, in the canvas container's coordinates. */
  position: { left: number; top: number };
  menuRef: RefObject<HTMLDivElement | null>;
  /** The node every control writes to. */
  nodeId: string;
  /** That node, whose own styles decide which swatch and pill read as active. */
  target: MindmapNode | null;
  /** True when several nodes are selected, which some labels and actions reflect. */
  isBatchMode: boolean;
  selectedCount: number;
  onUpdateStyle: (nodeId: string, styles: NodeStylePatch) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId?: string) => void;
  onAddSibling: (targetId?: string) => void;
  onStartRename: (nodeId: string) => void;
  /**
   * Writes the current theme's appearance into these nodes as their own styles.
   *
   * The confirmation lives in the caller rather than here, because the panel is
   * presentational and what is being confirmed is a decision about the map:
   * after it, those nodes stop following the theme.
   */
  onFreezeTheme: () => void;
  /**
   * The note hanging off the node, and where edited notes go.
   *
   * The text comes from the caller rather than from a copy kept here, for the
   * same reason the styles do: two copies of the same text is how a panel ends up
   * disagreeing with the thing it is describing. The caller also owns when it
   * reaches the disk — a note is written to the document's companion file, and
   * that timing is not the panel's business.
   */
  note: string;
  /** True when the last write did not land, so the panel can say so. */
  noteFailed: boolean;
  onNoteChange: (nodeId: string, text: string) => void;
  onClose: () => void;
};

/** The fields a node's style can be set to; mirrors the service's patch shape. */
type NodeStylePatch = {
  color?: string;
  shape?: MindmapNodeShape;
  lineColor?: string;
  lineStyle?: MindmapLineStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textColor?: string;
  borderColor?: string;
  textAlign?: MindmapTextAlign;
  customWidth?: number;
  customHeight?: number;
};

const PRESET_COLORS = [
  { label: "默认", value: "" },
  { label: "透明", value: "transparent" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "靛青", value: "#6366f1" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "暖日光", value: "#eab308" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "丁香紫", value: "#c084fc" },
  { label: "石墨灰", value: "#64748b" },
  { label: "曜石黑", value: "#334155" },
];

const PRESET_BORDER_COLORS = [
  { label: "默认", value: "" },
  { label: "无边框", value: "transparent" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "石墨灰", value: "#64748b" },
  { label: "曜石黑", value: "#334155" },
  { label: "纯白", value: "#ffffff" },
];

const PRESET_TEXT_COLORS = [
  { label: "默认", value: "" },
  { label: "纯黑", value: "#0f172a" },
  { label: "纯白", value: "#ffffff" },
  { label: "极客蓝", value: "#2563eb" },
  { label: "翡翠绿", value: "#059669" },
  { label: "珊瑚橙", value: "#ea580c" },
  { label: "朱砂红", value: "#dc2626" },
  { label: "玫瑰粉", value: "#e11d48" },
  { label: "兰花紫", value: "#9333ea" },
  { label: "琥珀黄", value: "#d97706" },
  { label: "石墨灰", value: "#64748b" },
];

const PRESET_LINE_COLORS = [
  { label: "继承", value: "" },
  { label: "天蓝", value: "#38bdf8" },
  { label: "极客蓝", value: "#3b82f6" },
  { label: "青空", value: "#06b6d4" },
  { label: "翡翠绿", value: "#10b981" },
  { label: "薄荷绿", value: "#14b8a6" },
  { label: "鲜柠绿", value: "#84cc16" },
  { label: "琥珀黄", value: "#f59e0b" },
  { label: "珊瑚橙", value: "#f97316" },
  { label: "朱砂红", value: "#ef4444" },
  { label: "玫瑰粉", value: "#f43f5e" },
  { label: "兰花紫", value: "#a855f7" },
  { label: "石墨灰", value: "#94a3b8" },
  { label: "曜石黑", value: "#334155" },
];

const PRESET_FONT_SIZES = [
  { label: "12", value: 12 },
  { label: "14", value: 14 },
  { label: "16", value: 16 },
  { label: "18", value: 18 },
  { label: "20", value: 20 },
];

const PRESET_SHAPES: { label: string; value: MindmapNodeShape }[] = [
  { label: "胶囊", value: "capsule" },
  { label: "圆角", value: "rounded" },
  { label: "直角", value: "rect" },
  { label: "下划线", value: "underline" },
];

const PRESET_ALIGNMENTS: { label: string; value: MindmapTextAlign; icon: typeof AlignCenter }[] = [
  { label: "居中", value: "center", icon: AlignCenter },
  { label: "左对齐", value: "left", icon: AlignLeft },
  { label: "右对齐", value: "right", icon: AlignRight },
  { label: "双边对齐", value: "justify", icon: AlignJustify },
];

const PRESET_LINE_STYLES: { label: string; value: MindmapLineStyle }[] = [
  { label: "曲线", value: "bezier" },
  { label: "折线", value: "step" },
  { label: "直线", value: "straight" },
];

export function MindmapNodeStyleMenu({
  open,
  position,
  menuRef,
  nodeId,
  target,
  isBatchMode,
  selectedCount,
  onUpdateStyle,
  onDelete,
  onAddChild,
  onAddSibling,
  onStartRename,
  onFreezeTheme,
  note,
  noteFailed,
  onNoteChange,
  onClose,
}: MindmapNodeStyleMenuProps) {
  if (!open) return null;

  return (

    <div
      ref={menuRef}
      className="mindmap-context-menu"
      style={{
        left: position.left,
        top: position.top,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mindmap-ctx-header">
        <span
          className="mindmap-ctx-title"
          title={
            isBatchMode
              ? `批量样式定制 (已选 ${selectedCount} 个节点)`
              : target?.text || "主题样式定制"
          }
        >
          <Palette size={13} className="text-cyan" />
          {isBatchMode
            ? `批量样式定制 (${selectedCount}节点)`
            : target?.text || "主题样式定制"}
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

      {/* Node Note — the one thing on this panel that is not in the document.
          It lives in the mind map's companion file, so it is offered here and
          nowhere in the editor: this panel is the map's own surface. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">节点备注</span>
          {noteFailed ? (
            <span className="mindmap-note-error" title="下一步改动会再试一次">
              未能保存
            </span>
          ) : null}
        </div>
        <textarea
          className="mindmap-note-input"
          value={note}
          rows={3}
          placeholder={isBatchMode ? "批量选择时只编辑一个节点的备注" : "写点什么，只留在导图里"}
          title="备注保存在文档旁边的伴生文件里，不改动文档本身"
          onChange={(e) => onNoteChange(nodeId, e.target.value)}
        />
      </div>

      {/* Node Background Color */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">节点背景颜色</span>
          <label className="mindmap-custom-color-trigger" title="拾取任意自定义背景颜色">
            <input
              type="color"
              className="mindmap-hidden-color-input"
              value={target?.color && target.color !== "transparent" ? target.color : "#38bdf8"}
              onChange={(e) => onUpdateStyle(nodeId, { color: e.target.value })}
            />
            <span className="mindmap-custom-color-badge">🎨 自定义</span>
          </label>
        </div>
        <div className="mindmap-ctx-palette">
          {PRESET_COLORS.map((c) => {
            const isActive = (target?.color || "") === c.value;
            const isTransparent = c.value === "transparent";
            return (
              <button
                key={c.label}
                type="button"
                className={`mindmap-color-swatch ${isTransparent ? "is-transparent-swatch" : ""} ${isActive ? "is-active" : ""}`}
                style={{ background: isTransparent ? undefined : (c.value || "var(--surface-2)") }}
                onClick={() => onUpdateStyle(nodeId, { color: c.value })}
                title={`背景: ${c.label}`}
              >
                {isActive && <Check size={11} color={c.value === "transparent" ? "#0f172a" : (c.value ? "#ffffff" : "var(--text)")} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Node Border Color */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">节点边框颜色</span>
          <label className="mindmap-custom-color-trigger" title="拾取任意边框颜色">
            <input
              type="color"
              className="mindmap-hidden-color-input"
              value={target?.borderColor && target.borderColor !== "transparent" ? target.borderColor : "#38bdf8"}
              onChange={(e) => onUpdateStyle(nodeId, { borderColor: e.target.value })}
            />
            <span className="mindmap-custom-color-badge">🎨 自定义</span>
          </label>
        </div>
        <div className="mindmap-ctx-palette">
          {PRESET_BORDER_COLORS.map((c) => {
            const isActive = (target?.borderColor || "") === c.value;
            const isTransparent = c.value === "transparent";
            return (
              <button
                key={c.label}
                type="button"
                className={`mindmap-color-swatch ${isTransparent ? "is-transparent-swatch" : ""} ${isActive ? "is-active" : ""}`}
                style={{ background: isTransparent ? undefined : (c.value || "var(--surface-2)") }}
                onClick={() => onUpdateStyle(nodeId, { borderColor: c.value })}
                title={`边框: ${c.label}`}
              >
                {isActive && <Check size={11} color={c.value === "transparent" ? "#0f172a" : (c.value ? "#ffffff" : "var(--text)")} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Node Shape */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label">节点形状</div>
        <div className="mindmap-ctx-pills">
          {PRESET_SHAPES.map((s) => {
            const currentShape = target?.shape || (target?.level === 0 ? "capsule" : "rounded");
            const isActive = currentShape === s.value;
            return (
              <button
                key={s.value}
                type="button"
                className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                onClick={() => onUpdateStyle(nodeId, { shape: s.value })}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Typography: Font Size & Bold Toggle */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">字号与加粗</span>
          <button
            type="button"
            className={`mindmap-bold-toggle-btn ${target?.fontWeight === "bold" ? "is-active" : ""}`}
            onClick={() => {
              const nextWeight = target?.fontWeight === "bold" ? "normal" : "bold";
              onUpdateStyle(nodeId, { fontWeight: nextWeight });
            }}
            title={target?.fontWeight === "bold" ? "取消加粗" : "文字加粗 (Bold)"}
          >
            <Bold size={11} strokeWidth={2.6} />
            <span>加粗</span>
          </button>
        </div>
        <div className="mindmap-ctx-pills">
          {PRESET_FONT_SIZES.map((fs) => {
            const currentSize = target?.fontSize || (target?.level === 0 ? 16 : 14);
            const isActive = currentSize === fs.value;
            return (
              <button
                key={fs.value}
                type="button"
                className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                onClick={() => onUpdateStyle(nodeId, { fontSize: fs.value })}
              >
                {fs.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Typography: Text Alignment (居中、左对齐、右对齐、双边对齐) */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label">文字对齐</div>
        <div className="mindmap-ctx-pills">
          {PRESET_ALIGNMENTS.map((al) => {
            const currentAlign = target?.textAlign || "center";
            const isActive = currentAlign === al.value;
            const IconComponent = al.icon;
            return (
              <button
                key={al.value}
                type="button"
                className={`mindmap-pill-btn mindmap-align-btn ${isActive ? "is-active" : ""}`}
                onClick={() => onUpdateStyle(nodeId, { textAlign: al.value })}
                title={al.label}
              >
                <IconComponent size={12} />
                <span>{al.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Typography: Font/Text Color */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">文字颜色</span>
          <label className="mindmap-custom-color-trigger" title="拾取任意文字颜色">
            <input
              type="color"
              className="mindmap-hidden-color-input"
              value={target?.textColor || "#0f172a"}
              onChange={(e) => onUpdateStyle(nodeId, { textColor: e.target.value })}
            />
            <span className="mindmap-custom-color-badge">🎨 自定义</span>
          </label>
        </div>
        <div className="mindmap-ctx-palette font-palette">
          {PRESET_TEXT_COLORS.map((tc) => {
            const isActive = (target?.textColor || "") === tc.value;
            return (
              <button
                key={tc.label}
                type="button"
                className={`mindmap-color-swatch text-color-swatch ${isActive ? "is-active" : ""}`}
                style={{ background: tc.value || "var(--surface-2)" }}
                onClick={() => onUpdateStyle(nodeId, { textColor: tc.value })}
                title={`文字: ${tc.label}`}
              >
                {isActive && <Check size={11} color={tc.value === "#ffffff" ? "#0f172a" : "#ffffff"} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Branch Connector Line Shape */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label">分支连线形状</div>
        <div className="mindmap-ctx-pills">
          {PRESET_LINE_STYLES.map((l) => {
            const currentStyle = target?.lineStyle || "bezier";
            const isActive = currentStyle === l.value;
            return (
              <button
                key={l.value}
                type="button"
                className={`mindmap-pill-btn ${isActive ? "is-active" : ""}`}
                onClick={() => onUpdateStyle(nodeId, { lineStyle: l.value })}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Branch Connector Line Color */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">连线颜色</span>
          <label className="mindmap-custom-color-trigger" title="拾取任意连线颜色">
            <input
              type="color"
              className="mindmap-hidden-color-input"
              value={target?.lineColor || "#38bdf8"}
              onChange={(e) => onUpdateStyle(nodeId, { lineColor: e.target.value })}
            />
            <span className="mindmap-custom-color-badge">🎨 自定义</span>
          </label>
        </div>
        <div className="mindmap-ctx-palette">
          {PRESET_LINE_COLORS.map((c) => {
            const isActive = (target?.lineColor || "") === c.value;
            return (
              <button
                key={c.label}
                type="button"
                className={`mindmap-color-swatch ${isActive ? "is-active" : ""}`}
                style={{ background: c.value || "var(--surface-2)" }}
                onClick={() => onUpdateStyle(nodeId, { lineColor: c.value })}
                title={`连线: ${c.label}`}
              >
                {isActive && <Check size={11} color={c.value ? "#ffffff" : "var(--text)"} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mindmap-ctx-divider" />

      {/* Actions */}
      <div className="mindmap-ctx-actions">
        {!isBatchMode && (
          <>
            <button
              type="button"
              className="mindmap-ctx-action-item"
              onClick={() => {
                const nid = nodeId;
                onClose();
                onAddChild(nid);
              }}
            >
              <CornerDownRight size={13} />
              <span>添加子主题 (Tab)</span>
            </button>
            <button
              type="button"
              className="mindmap-ctx-action-item"
              onClick={() => {
                const nid = nodeId;
                onClose();
                onAddSibling(nid);
              }}
            >
              <PlusCircle size={13} />
              <span>添加同级主题 (Enter)</span>
            </button>
            <button
              type="button"
              className="mindmap-ctx-action-item"
              onClick={() => {
                const nid = nodeId;
                onClose();
                onStartRename(nid);
              }}
            >
              <Edit3 size={13} />
              <span>重命名 (F2)</span>
            </button>
          </>
        )}
        {(target?.customWidth || target?.customHeight) && (
          <button
            type="button"
            className="mindmap-ctx-action-item"
            onClick={() => {
              onUpdateStyle(nodeId, {
                customWidth: undefined,
                customHeight: undefined,
              });
            }}
          >
            <RotateCcw size={13} />
            <span>恢复自适应大小</span>
          </button>
        )}
        {/* Offered in batch mode too, and the reason it sits next to delete is
            that both are decisions about the nodes rather than controls on them. */}
        <button
          type="button"
          className="mindmap-ctx-action-item"
          onClick={onFreezeTheme}
          title="把当前主题的颜色与形状写成这些节点自己的样式；此后换主题它们不再跟随。手工设置过的颜色与形状不受影响。"
        >
          <Snowflake size={13} />
          <span>{isBatchMode ? `固化当前主题 (${selectedCount})` : "固化当前主题"}</span>
        </button>
        <button
          type="button"
          className="mindmap-ctx-action-item is-delete"
          onClick={() => {
            const nid = nodeId;
            onClose();
            onDelete(nid);
          }}
        >
          <Trash2 size={13} />
          <span>{isBatchMode ? `删除选中的 ${selectedCount} 个主题 (Del)` : "删除主题 (Del)"}</span>
        </button>
      </div>
    </div>
  );
}
