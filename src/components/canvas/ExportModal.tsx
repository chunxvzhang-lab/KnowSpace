import { memo } from "react";
import { Check, Copy, Image as ImageIcon, Save, X } from "lucide-react";
import type { ThemeMode } from "../../core/types";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { modalContentStyle, modalOverlayStyle, toolBtnStyle } from "./canvasModalStyles";

export type CanvasExportFormat = "png" | "svg";
export type CanvasExportBackground = "theme" | "white" | "transparent";

/**
 * Export-as-image dialog.
 *
 * Extracted from CanvasView (R2 batch B2) — see docs/CANVAS_SPLIT_DESIGN.md.
 * The parent keeps the selected format/background so the dialog remembers the
 * previous choice, and performs the export; this only renders and reports.
 */
type ExportModalProps = {
  nodeCount: number;
  edgeCount: number;
  format: CanvasExportFormat;
  onFormatChange: (format: CanvasExportFormat) => void;
  background: CanvasExportBackground;
  onBackgroundChange: (background: CanvasExportBackground) => void;
  isExporting: boolean;
  copyFeedback: boolean;
  theme: ThemeMode;
  colors: ReturnType<typeof getCanvasThemeColors>;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
};

const BACKGROUNDS: Array<{ id: CanvasExportBackground; label: string }> = [
  { id: "theme", label: "跟随当前主题底色" },
  { id: "white", label: "纯白底色" },
  { id: "transparent", label: "透明背景" },
];

export const ExportModal = memo(function ExportModal({
  nodeCount,
  edgeCount,
  format,
  onFormatChange,
  background,
  onBackgroundChange,
  isExporting,
  copyFeedback,
  theme,
  colors,
  onCopy,
  onDownload,
  onClose,
}: ExportModalProps) {
  return (
    <div
      style={modalOverlayStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        style={{ ...modalContentStyle(theme, colors), width: 520, maxWidth: "92vw" }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <ImageIcon size={18} color="#0284c7" /> 导出白板为图片
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: colors.cardText, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Whiteboard overview info */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            backgroundColor: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)",
            fontSize: 12.5,
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          <div>
            📊 <b>画板统计：</b>共 <b>{nodeCount}</b> 个节点卡片，<b>{edgeCount}</b> 条逻辑关联线
          </div>
          <div style={{ opacity: 0.7, fontSize: 11.5, marginTop: 2 }}>
            💡 导出引擎将依据画板所有元素的包围盒自动生成高清全景图，背景与连线穿心对齐无缝呈现。
          </div>
        </div>

        {/* Format selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            导出格式
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => onFormatChange("png")}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: format === "png" ? "2px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                background: format === "png" ? "rgba(2,132,199,0.12)" : "transparent",
                color: colors.cardText,
                fontWeight: format === "png" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                📸 PNG 高清位图 (2x Retina)
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>
                适合社交分享、插入文档报告
              </div>
            </button>

            <button
              type="button"
              onClick={() => onFormatChange("svg")}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: format === "svg" ? "2px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                background: format === "svg" ? "rgba(2,132,199,0.12)" : "transparent",
                color: colors.cardText,
                fontWeight: format === "svg" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                📐 SVG 矢量图形
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>
                无限放大不失真、设计工具二次编辑
              </div>
            </button>
          </div>
        </div>

        {/* Background options */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            背景底色
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onBackgroundChange(b.id)}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  border:
                    background === b.id ? "1.5px solid #0284c7" : `1px solid ${colors.cardBorder}`,
                  background: background === b.id ? "rgba(2,132,199,0.1)" : "transparent",
                  color: background === b.id ? "#0284c7" : colors.cardText,
                  fontWeight: background === b.id ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          {format === "png" && (
            <button
              type="button"
              onClick={onCopy}
              disabled={isExporting}
              style={{
                ...toolBtnStyle(theme, colors),
                padding: "7px 14px",
                borderRadius: 6,
                border: `1px solid ${colors.cardBorder}`,
                cursor: isExporting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {copyFeedback ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copyFeedback ? "已复制到剪贴板！" : "复制图片到剪贴板"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDownload}
            disabled={isExporting}
            style={{
              ...toolBtnStyle(theme, colors),
              backgroundColor: "#0284c7",
              color: "#ffffff",
              padding: "7px 16px",
              borderRadius: 6,
              fontWeight: 600,
              cursor: isExporting ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Save size={14} />
            <span>{isExporting ? "正在导出..." : `下载 ${format.toUpperCase()} 文件`}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
