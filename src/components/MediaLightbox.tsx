import { memo, useCallback, useEffect, useRef, useState } from "react";
import { downloadSvgAsPng, rasterizeRenderedSvgToPng, triggerDownload } from "../services/svgExport";

// Moved to core/types so the UI store can reference it without importing from
// components/. Re-exported here so existing import sites are unaffected.
import type { LightboxMedia } from "../core/types";
export type { LightboxMedia };

type MediaLightboxProps = {
  media: LightboxMedia | null;
  onClose: () => void;
};

export const MediaLightbox = memo(function MediaLightbox({
  media,
  onClose,
}: MediaLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Reset transform whenever a new media is opened
  useEffect(() => {
    if (media) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [media]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale((prev) => Math.min(Math.max(prev * zoomFactor, 0.2), 6));
  }, []);

  // Pan with drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left mouse button
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  // Download media (Mermaid exports as PNG)
  const handleDownload = useCallback(async () => {
    if (!media || isExporting) return;
    if (media.type === "image" && media.src) {
      const a = document.createElement("a");
      a.href = media.src;
      a.download = media.alt || "image.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (media.type === "mermaid") {
      try {
        setIsExporting(true);
        const svgElem = contentRef.current?.querySelector<SVGSVGElement>("svg");
        const theme = document.documentElement.getAttribute("data-theme") || "twitter";
        const filename = media.title || "mermaid-diagram";

        if (svgElem) {
          try {
            // 1. Direct high-DPI rasterization from the live rendered SVG in the active DOM
            const pngDataUrl = await rasterizeRenderedSvgToPng(svgElem, theme, 3);
            if (window.bookMDDesktop?.savePngData) {
              const res = await window.bookMDDesktop.savePngData({
                dataUrl: pngDataUrl,
                filename,
              });
              if (res?.success || res?.canceled) {
                return;
              }
            } else {
              triggerDownload(pngDataUrl, filename, ".png");
              return;
            }
          } catch (directErr) {
            console.warn("Direct rendered SVG rasterization failed, falling back:", directErr);
          }
        }

        // 2. Fallback to offscreen capture if direct rasterization is not available
        if (media.svgHtml && window.bookMDDesktop?.exportSvgAsPng) {
          const res = await window.bookMDDesktop.exportSvgAsPng({
            svgHtml: media.svgHtml,
            theme,
            filename,
          });
          if (res?.success || res?.canceled) {
            return;
          }
        }

        if (media.svgHtml) {
          await downloadSvgAsPng(media.svgHtml, filename, svgElem, 3);
        }
      } catch (err) {
        console.error("Export error:", err);
      } finally {
        setIsExporting(false);
      }
    }
  }, [media, isExporting]);

  if (!media) return null;

  return (
    <div
      className="media-lightbox-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      role="dialog"
      aria-modal="true"
      aria-label="媒体大图预览灯箱"
    >
      <div className="lightbox-top-bar">
        <span className="lightbox-title">
          {media.title || media.alt || (media.type === "mermaid" ? "Mermaid 架构图预览" : "图片预览")}
        </span>
        <div className="lightbox-controls">
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => setScale((s) => Math.min(s * 1.25, 6))}
            title="放大 (+)"
          >
            🔍+
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => setScale((s) => Math.max(s / 1.25, 0.2))}
            title="缩小 (-)"
          >
            🔍-
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => {
              setScale(1);
              setPosition({ x: 0, y: 0 });
            }}
            title="重置自适应 (0)"
          >
            ↺ {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={handleDownload}
            disabled={isExporting}
            title={media.type === "mermaid" ? "导出为 PNG 高清图片" : "下载图片"}
          >
            {isExporting ? "⏳ 导出中..." : media.type === "mermaid" ? "⬇ 导出 PNG" : "⬇ 下载"}
          </button>
          <button
            type="button"
            className="lightbox-btn close-btn"
            onClick={onClose}
            title="关闭 (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className={`lightbox-viewport ${isDragging ? "is-dragging" : ""}`}
        ref={contentRef}
        onMouseDown={handleMouseDown}
      >
        <div
          className="lightbox-content"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
        >
          {media.type === "image" && media.src ? (
            <img src={media.src} alt={media.alt || ""} draggable={false} className="lightbox-img" />
          ) : null}
          {media.type === "video" && media.src ? (
            <video
              src={media.src}
              controls
              autoPlay
              draggable={false}
              style={{ maxWidth: "92vw", maxHeight: "82vh", borderRadius: 8, boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }}
            />
          ) : null}
          {media.type === "audio" && media.src ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                padding: "40px 60px",
                borderRadius: 12,
                background: "rgba(15, 20, 25, 0.92)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <div style={{ fontSize: 44 }}>🎵</div>
              <div style={{ color: "#f7f9f9", fontSize: 14, fontWeight: 600 }}>
                {media.title || media.alt || "音频播放"}
              </div>
              <audio src={media.src} controls autoPlay style={{ width: 360 }} />
            </div>
          ) : null}
          {media.type === "mermaid" && media.svgHtml ? (
            <div
              className="lightbox-svg-container"
              dangerouslySetInnerHTML={{ __html: media.svgHtml }}
            />
          ) : null}
        </div>
      </div>

      <div className="lightbox-hint">
        <span>滚轮缩放 · 鼠标拖拽平移 · 双击重置 · Esc 退出</span>
      </div>
    </div>
  );
});
