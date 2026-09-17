import { memo } from "react";
import { FileText, X } from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { modalContentStyle, modalOverlayStyle } from "./canvasModalStyles";

/**
 * Picker for pulling a vault note onto the board as a file card.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * Filtering is local to the search box; the parent keeps ownership of the
 * keyword so the modal reopens with the previous query intact.
 */
type FilePickerModalProps = {
  chapters: Array<{ id: string; title: string; src: string; absolutePath?: string }>;
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  theme: ThemeMode;
  colors: ReturnType<typeof getCanvasThemeColors>;
  onPick: (chapter: { id: string; title: string; src: string; absolutePath?: string }) => void;
  onClose: () => void;
};

export const FilePickerModal = memo(function FilePickerModal({
  chapters,
  searchKeyword,
  onSearchChange,
  theme,
  colors,
  onPick,
  onClose,
}: FilePickerModalProps) {
  const keyword = searchKeyword.toLowerCase();
  const filtered = chapters.filter(
    (c) =>
      !searchKeyword ||
      c.title.toLowerCase().includes(keyword) ||
      c.src.toLowerCase().includes(keyword)
  );

  return (
    <div
      style={modalOverlayStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        style={modalContentStyle(theme, colors)}
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
            <FileText size={18} color="#10b981" /> 引入知识库笔记至白板
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索笔记标题或路径..."
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              background: theme === "light" ? "#ffffff" : "rgba(0,0,0,0.2)",
              color: colors.cardText,
              outline: "none",
              fontSize: 13,
            }}
          />
        </div>

        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {filtered.map((ch) => (
            <div
              key={ch.src}
              onClick={() => onPick(ch)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                cursor: "pointer",
                backgroundColor: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{ch.title}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{ch.src}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
