import { useCallback, useState } from "react";
import type { ThemeMode } from "../../core/types";
import type { CanvasData } from "../../types/canvasTypes";
import {
  copyCanvasImageToClipboard,
  downloadCanvasAsImage,
  extractCanvasToMarkdown,
} from "../../services/canvasService";

/**
 * The export/extract domain of the canvas: the extract-to-longform modal's
 * state and actions (copy, save as note) and the image-export modal's state
 * and actions (download as PNG/SVG, copy to clipboard).
 *
 * Extracted from CanvasView (wave 6 of the CanvasView decomposition). The
 * file-picker state and the toast stay in CanvasView: `showFilePicker` is
 * written by the node-ops domain (add-file-card) and the toolbar, and
 * `showToast` is consumed by six other hooks — both are threaded in here as
 * params instead of being owned.
 */
type UseCanvasExportExtractParams = {
  /** The board, rasterised / serialised by the handlers below. */
  data: CanvasData;
  /** The board title — the extract note's name and the export's fallback title. */
  title: string;
  /** The canvas theme; the exporter renders with the same palette the screen uses. */
  theme: ThemeMode;
  /** Surface cancellations and export failures (toast owned by CanvasView). */
  showToast: (msg: string) => void;
  /** The parent's save-extract-as-note action. */
  onExtractToNote?: (title: string, content: string) => void;
};

export function useCanvasExportExtract({
  data,
  title,
  theme,
  showToast,
  onExtractToNote,
}: UseCanvasExportExtractParams) {
  // Modals & Panels
  // (The file picker's search draft moved into CanvasOverlayMenus in wave 4 —
  // only its wiring read or wrote it.)
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractedMarkdown, setExtractedMarkdown] = useState("");
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "svg">("png");
  const [exportBg, setExportBg] = useState<"theme" | "white" | "transparent">("theme");
  const [isExporting, setIsExporting] = useState(false);
  const [exportCopyFeedback, setExportCopyFeedback] = useState(false);

  // Extract article
  const handleOpenExtractModal = useCallback(() => {
    const markdown = extractCanvasToMarkdown(data, title || "空间白板萃取长文");
    setExtractedMarkdown(markdown);
    setShowExtractModal(true);
  }, [data, title]);

  const handleCopyExtracted = useCallback(() => {
    navigator.clipboard.writeText(extractedMarkdown);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  }, [extractedMarkdown]);

  const handleSaveAsNote = useCallback(() => {
    if (onExtractToNote) {
      onExtractToNote(`${title}-萃取长文`, extractedMarkdown);
      setShowExtractModal(false);
    }
  }, [extractedMarkdown, onExtractToNote, title]);

  // Export canvas image
  const handleDownloadExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await downloadCanvasAsImage(data, title || "KnowSpace白板", exportFormat, {
        theme,
        background: exportBg,
        scale: 2,
      });
      if (result === "canceled") {
        showToast("已取消导出");
        return;
      }
      setShowExportModal(false);
      if (result === "svg" && exportFormat !== "svg") {
        // The rasteriser was vetoed by the browser's security model and the
        // vector file was saved instead — say so, rather than silently
        // handing the user a different format than they asked for.
        showToast("浏览器安全限制无法生成 PNG，已改为导出矢量 SVG");
      } else if (result === "svg") {
        showToast("已导出矢量 SVG");
      } else {
        showToast("白板图片已导出");
      }
    } catch (err) {
      console.error("导出白板图片失败:", err);
      // Surface the failure instead of dying silently — a previous hard crash
      // here left the user staring at a closed window with no explanation.
      showToast(`导出失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsExporting(false);
    }
  }, [data, exportBg, exportFormat, isExporting, showToast, theme, title]);

  const handleCopyExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const ok = await copyCanvasImageToClipboard(data, {
        theme,
        background: exportBg,
        scale: 2,
      });
      if (ok) {
        setExportCopyFeedback(true);
        setTimeout(() => setExportCopyFeedback(false), 2200);
      } else {
        showToast("复制失败：当前环境不支持剪贴板图片写入");
      }
    } catch (err) {
      console.error("复制白板图片失败:", err);
      showToast(`复制失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setIsExporting(false);
    }
  }, [data, exportBg, isExporting, showToast, theme]);

  return {
    showExtractModal,
    setShowExtractModal,
    extractedMarkdown,
    copiedNotification,
    showExportModal,
    setShowExportModal,
    exportFormat,
    setExportFormat,
    exportBg,
    setExportBg,
    isExporting,
    exportCopyFeedback,
    handleOpenExtractModal,
    handleCopyExtracted,
    handleSaveAsNote,
    handleDownloadExport,
    handleCopyExport,
  };
}
