import { memo } from "react";
import { Share2, X } from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { modalContentStyle, modalOverlayStyle, toolBtnStyle } from "./canvasModalStyles";

export type SpawnDirection = "right" | "bottom";

/**
 * One-to-many branch spawn dialog.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * The parent holds count and direction, so the dialog reopens on the previous
 * values exactly as it did before the split.
 */
type SpawnBranchModalProps = {
  count: number;
  direction: SpawnDirection;
  onCountChange: (count: number) => void;
  onDirectionChange: (direction: SpawnDirection) => void;
  theme: ThemeMode;
  colors: ReturnType<typeof getCanvasThemeColors>;
  onConfirm: () => void;
  onClose: () => void;
};

const QUICK_COUNTS = [2, 3, 4, 5, 6];
const DIRECTIONS: Array<{ dir: SpawnDirection; label: string }> = [
  { dir: "right", label: "向右横向展开" },
  { dir: "bottom", label: "向下纵向展开" },
];

export const SpawnBranchModal = memo(function SpawnBranchModal({
  count,
  direction,
  onCountChange,
  onDirectionChange,
  theme,
  colors,
  onConfirm,
  onClose,
}: SpawnBranchModalProps) {
  return (
    <div style={modalOverlayStyle} onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div
        style={{ ...modalContentStyle(theme, colors), width: 440, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Share2 size={16} color="#8b5cf6" />
            <span style={{ fontSize: 15, fontWeight: 600 }}>批量派生分支 (一对多)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.cardText,
              opacity: 0.6,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Branch Count Input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            派生分支数量 (1 ~ 20)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onCountChange(isNaN(val) ? 1 : Math.max(1, Math.min(20, val)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirm();
                if (e.key === "Escape") onClose();
              }}
              autoFocus
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${colors.cardBorder}`,
                backgroundColor: colors.cardBg,
                color: colors.cardText,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {/* Quick count pills */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {QUICK_COUNTS.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onCountChange(num)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 14,
                  fontSize: 11.5,
                  fontWeight: count === num ? 600 : 400,
                  backgroundColor: count === num ? "rgba(139, 92, 246, 0.2)" : "transparent",
                  color: count === num ? "#8b5cf6" : colors.cardText,
                  border: count === num ? "1px solid #8b5cf6" : `1px solid ${colors.cardBorder}`,
                  cursor: "pointer",
                }}
              >
                {num} 个分支
              </button>
            ))}
          </div>
        </div>

        {/* Direction Selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            展开方向
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            {DIRECTIONS.map((d) => (
              <button
                key={d.dir}
                type="button"
                onClick={() => onDirectionChange(d.dir)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  border:
                    direction === d.dir ? "1.5px solid #8b5cf6" : `1px solid ${colors.cardBorder}`,
                  background: direction === d.dir ? "rgba(139, 92, 246, 0.12)" : "transparent",
                  color: direction === d.dir ? "#8b5cf6" : colors.cardText,
                  fontWeight: direction === d.dir ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...toolBtnStyle(theme, colors),
              padding: "7px 14px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "#8b5cf6",
              color: "#ffffff",
              padding: "7px 18px",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Share2 size={13} />
            <span>确认派生 ({count} 个)</span>
          </button>
        </div>
      </div>
    </div>
  );
});
