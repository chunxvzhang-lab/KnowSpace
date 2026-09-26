import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Boxes,
  Film,
  FileText,
  Image as ImageIcon,
  List,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  X,
} from "lucide-react";
import type { CanvasGroupNode, CanvasNode } from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { findContainerForNode } from "../../services/canvasService";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * The presentation-mode chrome: the slide-overview drawer and the floating
 * bottom control bar.
 *
 * Extracted from CanvasView (wave 4 of the CanvasView decomposition); the
 * markup moved verbatim from the IIFE that used to guard it. The parent still
 * owns the guard (`isPresentationMode && presentationSequence.length > 0`),
 * so the chrome only renders while a presentation is actually running.
 */
type CanvasPresentationChromeProps = {
  /** Board nodes — the drawer resolves each slide's parent group container. */
  nodes: CanvasNode[];
  nodeMap: Map<string, CanvasNode>;
  presentationSequence: string[];
  currentSlideIndex: number;
  isAutoPlaying: boolean;
  setIsAutoPlaying: Dispatch<SetStateAction<boolean>>;
  showSlideDrawer: boolean;
  setShowSlideDrawer: Dispatch<SetStateAction<boolean>>;
  /** Attached to the drawer so CanvasView's outside-click handler can close it. */
  slideDrawerRef: RefObject<HTMLDivElement | null>;
  isFullscreenActive: boolean;
  handleToggleFullscreen: () => void;
  handleTogglePresentation: () => void;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
  handleJumpToSlide: (index: number) => void;
  colors: CanvasThemeColors;
  isDark: boolean;
  isEink: boolean;
};

export function CanvasPresentationChrome({
  nodes,
  nodeMap,
  presentationSequence,
  currentSlideIndex,
  isAutoPlaying,
  setIsAutoPlaying,
  showSlideDrawer,
  setShowSlideDrawer,
  slideDrawerRef,
  isFullscreenActive,
  handleToggleFullscreen,
  handleTogglePresentation,
  handlePrevSlide,
  handleNextSlide,
  handleJumpToSlide,
  colors,
  isDark,
  isEink,
}: CanvasPresentationChromeProps) {
  const presentationAccent = isDark ? "#818cf8" : isEink ? "#1e293b" : "#6366f1";
  const presentationAccentBg = isDark
    ? "rgba(129, 140, 248, 0.22)"
    : isEink
      ? "rgba(30, 41, 59, 0.12)"
      : "rgba(99, 102, 241, 0.15)";
  return (
    <>
      {/* Slide Overview Drawer / Popover */}
      {showSlideDrawer && (
        <div
          ref={slideDrawerRef}
          className="canvas-slide-drawer"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="canvas-slide-drawer-header">
            <div className="canvas-slide-drawer-title">
              <Film size={14} color={presentationAccent} />
              <span>分镜大纲 (共 {presentationSequence.length} 幕)</span>
            </div>
            <button
              type="button"
              className="canvas-slide-drawer-close"
              onClick={() => setShowSlideDrawer(false)}
              title="关闭分镜大纲 (Esc / L)"
            >
              <X size={14} />
            </button>
          </div>
          <div className="canvas-slide-drawer-list">
            {presentationSequence.map((nodeId, idx) => {
              const n = nodeMap.get(nodeId);
              if (!n) return null;
              const isActive = idx === currentSlideIndex;
              const parentContainer = findContainerForNode(n, nodes);
              let icon = <FileText size={13} />;
              let title = "";
              if (n.type === "text") {
                icon = (
                  <FileText size={13} color={isActive ? presentationAccent : colors.cardText} />
                );
                title = n.text.trim().split("\n")[0] || "文本卡片";
              } else if (n.type === "file") {
                icon = <ImageIcon size={13} color="#0284c7" />;
                title = n.file ? n.file.split(/[/\\]/).pop() || n.file : "文件卡片";
              } else if (n.type === "link") {
                icon = <ExternalLink size={13} color="#10b981" />;
                title = n.url || "网页卡片";
              } else if (n.type === "group") {
                icon = <Boxes size={13} color="#f59e0b" />;
                title = (n as CanvasGroupNode).label || "独立分组帧";
              }

              return (
                <button
                  key={nodeId}
                  type="button"
                  className={`canvas-slide-drawer-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    handleJumpToSlide(idx);
                  }}
                >
                  <span className="canvas-slide-index">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="canvas-slide-icon">{icon}</span>
                  <span className="canvas-slide-name" title={title}>
                    {title}
                  </span>
                  {parentContainer && parentContainer.label && (
                    <span
                      className="canvas-slide-group-tag"
                      title={`所属分组: ${parentContainer.label}`}
                    >
                      {parentContainer.label}
                    </span>
                  )}
                  {isActive && <span className="canvas-slide-playing-badge">演播中</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="canvas-presentation-bar"
        style={{
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.12)"}`,
          color: colors.cardText,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: presentationAccent,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          🪐 演示模式
        </span>

        <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

        <button
          onClick={handlePrevSlide}
          title="上一张 (← / PageUp)"
          style={{
            background: "none",
            border: "none",
            color: colors.cardText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: 4,
            borderRadius: 6,
          }}
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          className={`canvas-presentation-counter-btn ${showSlideDrawer ? "active" : ""}`}
          onClick={() => setShowSlideDrawer((prev) => !prev)}
          title="点击展开分镜大纲抽屉 (快捷键 L)"
        >
          <List size={13} style={{ opacity: 0.8 }} />
          <span>
            {currentSlideIndex + 1} / {presentationSequence.length}
          </span>
        </button>

        <button
          onClick={handleNextSlide}
          title="下一张 (→ / 空格 / PageDown)"
          style={{
            background: "none",
            border: "none",
            color: colors.cardText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: 4,
            borderRadius: 6,
          }}
        >
          <ChevronRight size={18} />
        </button>

        <div style={{ width: 1, height: 18, background: colors.cardBorder }} />

        <button
          onClick={() => setIsAutoPlaying((prev) => !prev)}
          title={isAutoPlaying ? "暂停自动放映 (P)" : "自动放映 (每 3.5 秒切换, 快捷键 P)"}
          style={{
            background: isAutoPlaying ? presentationAccentBg : "none",
            border: "none",
            color: isAutoPlaying ? presentationAccent : colors.cardText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          {isAutoPlaying ? <Pause size={14} /> : <Play size={14} />}
          <span>{isAutoPlaying ? "暂停" : "自动"}</span>
        </button>

        <button
          onClick={handleToggleFullscreen}
          title={isFullscreenActive ? "退出全屏 (F / F11)" : "全屏沉浸演示 (F / F11)"}
          style={{
            background: "none",
            border: "none",
            color: isFullscreenActive ? presentationAccent : colors.cardText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: 4,
            borderRadius: 6,
          }}
        >
          {isFullscreenActive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        <button
          onClick={handleTogglePresentation}
          title="退出演示模式 (Esc)"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "none",
            color: "#ef4444",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 16,
            marginLeft: 4,
          }}
        >
          <X size={13} />
          <span>退出</span>
        </button>

        {isAutoPlaying && (
          <div className="canvas-presentation-progress-track">
            <div
              key={`${currentSlideIndex}-${isAutoPlaying}`}
              className="canvas-presentation-progress-bar"
            />
          </div>
        )}
      </div>
    </>
  );
}
