import { memo } from "react";
import { BookOpen, Check, Copy, X } from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { modalContentStyle, modalOverlayStyle, toolBtnStyle } from "./canvasModalStyles";

/**
 * "Extract the board into a long-form note" dialog.
 *
 * Extracted from CanvasView (R2 batch B2).
 * The caller owns the extracted text and the copy/save actions; this renders
 * the preview and reports clicks.
 */
type ExtractModalProps = {
  markdown: string;
  theme: ThemeMode;
  colors: ReturnType<typeof getCanvasThemeColors>;
  copied: boolean;
  /** Whether "save as a new note" is available (needs a host callback). */
  canSaveAsNote: boolean;
  onCopy: () => void;
  onSaveAsNote: () => void;
  onClose: () => void;
};

export const ExtractModal = memo(function ExtractModal({
  markdown,
  theme,
  colors,
  copied,
  canSaveAsNote,
  onCopy,
  onSaveAsNote,
  onClose,
}: ExtractModalProps) {
  return (
    <div
      style={modalOverlayStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        style={{ ...modalContentStyle(theme, colors), width: 620, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={18} color="#10b981" /> 白板结构化萃取专著
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        <textarea
          readOnly
          value={markdown}
          onWheel={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: 320,
            backgroundColor: theme === "light" ? "#ffffff" : "rgba(0,0,0,0.3)",
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 8,
            padding: 12,
            color: colors.cardText,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 13,
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onCopy}
            style={{
              ...toolBtnStyle(theme, colors),
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
            }}
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            {copied ? "已复制到剪贴板！" : "复制全文"}
          </button>
          {canSaveAsNote && (
            <button
              onClick={onSaveAsNote}
              style={{
                ...toolBtnStyle(theme, colors),
                backgroundColor: "#10b981",
                color: "#ffffff",
                padding: "6px 14px",
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              另存为新笔记
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
