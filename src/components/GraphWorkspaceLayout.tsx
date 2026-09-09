import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ThemeMode } from "../core/types";
import type { GraphData } from "../services/graphService";
import { GraphViewPane } from "./GraphViewPane";

const getOrientationKey = (mode?: string) => {
  if (mode === "mindmap" || mode === "canvas") {
    return `knowspace.layout.graphSplitOrientation.${mode}`;
  }
  return "knowspace.layout.graphSplitOrientation.doc";
};

const getDefaultOrientation = (mode?: string): "row" | "column" => {
  if (mode === "mindmap" || mode === "canvas") {
    return "column";
  }
  return "row";
};

const getStoredOrientation = (mode?: string): "row" | "column" => {
  try {
    const key = getOrientationKey(mode);
    const saved = localStorage.getItem(key);
    if (saved === "row" || saved === "column") return saved;
  } catch {
    // fallback
  }
  return getDefaultOrientation(mode);
};

const getRatioKey = (ori: "row" | "column") => `knowspace.layout.graphSplitRatio.${ori}`;
const getDefaultRatio = (ori: "row" | "column") => (ori === "column" ? 0.62 : 0.55);

const getStoredRatio = (ori: "row" | "column"): number => {
  try {
    const saved = localStorage.getItem(getRatioKey(ori));
    if (saved) {
      const val = parseFloat(saved);
      if (!Number.isNaN(val) && val >= 0.25 && val <= 0.75) return val;
    }
  } catch {
    // fallback
  }
  return getDefaultRatio(ori);
};

type GraphWorkspaceLayoutProps = {
  children: ReactNode;
  graphData: GraphData;
  currentDocId?: string | null;
  theme: ThemeMode;
  onSelectNode: (docId: string) => void;
  onCloseGraph: () => void;
  viewMode?: string;
};

export function GraphWorkspaceLayout({
  children,
  graphData,
  currentDocId,
  theme,
  onSelectNode,
  onCloseGraph,
  viewMode,
}: GraphWorkspaceLayoutProps) {
  // Determine orientation: restore user choice or smart default by viewMode
  const [orientation, setOrientation] = useState<"row" | "column">(() =>
    getStoredOrientation(viewMode)
  );

  const [splitRatio, setSplitRatio] = useState<number>(() =>
    getStoredRatio(getStoredOrientation(viewMode))
  );

  // Sync orientation & ratio automatically when viewMode changes
  useEffect(() => {
    const targetOri = getStoredOrientation(viewMode);
    setOrientation(targetOri);
    setSplitRatio(getStoredRatio(targetOri));
  }, [viewMode]);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleToggleOrientation = useCallback(() => {
    setOrientation((prev) => {
      const next = prev === "row" ? "column" : "row";
      try {
        localStorage.setItem(getOrientationKey(viewMode), next);
      } catch {
        // ignore
      }
      setSplitRatio(getStoredRatio(next));
      return next;
    });
  }, [viewMode]);

  const handleSetRatio = useCallback(
    (ratio: number) => {
      const clamped = Math.max(0.25, Math.min(0.75, ratio));
      setSplitRatio(clamped);
      try {
        localStorage.setItem(getRatioKey(orientation), clamped.toFixed(3));
      } catch {
        // ignore
      }
    },
    [orientation]
  );

  useEffect(() => {
    if (!isDragging) return;

    const currentRatioRef = { current: splitRatio };

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (orientation === "column") {
        const totalHeight = rect.height;
        if (totalHeight <= 0) return;
        const newTopHeight = e.clientY - rect.top;
        let ratio = newTopHeight / totalHeight;
        ratio = Math.max(0.25, Math.min(0.75, ratio));
        currentRatioRef.current = ratio;
        setSplitRatio(ratio);
      } else {
        const totalWidth = rect.width;
        if (totalWidth <= 0) return;
        const newLeftWidth = e.clientX - rect.left;
        let ratio = newLeftWidth / totalWidth;
        ratio = Math.max(0.25, Math.min(0.75, ratio));
        currentRatioRef.current = ratio;
        setSplitRatio(ratio);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem(getRatioKey(orientation), currentRatioRef.current.toFixed(3));
      } catch {
        // ignore
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, orientation, splitRatio]);

  const isCol = orientation === "column";

  return (
    <div
      className={`graph-workspace-layout ${isCol ? "is-column" : ""} ${isDragging ? "is-resizing" : ""} ${isMaximized ? "is-graph-maximized" : ""}`}
      ref={containerRef}
    >
      {/* Primary Pane: Document Workspace (Editor / Reader / Mindmap / Canvas) */}
      {!isMaximized && (
        <div
          className="graph-workspace-left-pane"
          style={
            isCol
              ? { flex: `0 0 ${splitRatio * 100}%`, height: `${splitRatio * 100}%`, width: "100%" }
              : { flex: `0 0 ${splitRatio * 100}%`, width: `${splitRatio * 100}%`, height: "100%" }
          }
        >
          {children}
        </div>
      )}

      {/* Resizer Splitter with Quick Switcher & Ratio Chips */}
      {!isMaximized && (
        <div
          className={`graph-workspace-splitter ${isCol ? "is-column" : ""}`}
          onMouseDown={handleMouseDown}
          onDoubleClick={() => handleSetRatio(getDefaultRatio(orientation))}
          role="separator"
          aria-orientation={isCol ? "horizontal" : "vertical"}
          title={isCol ? "拖拽调整上下高度（双击重置默认高度）" : "拖拽调整左右分栏（双击重置默认比例）"}
        >
          <div className="splitter-handle" />
          <div
            className="splitter-quick-bar"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="splitter-btn-orientation"
              onClick={handleToggleOrientation}
              title={isCol ? "切换为左右并排分栏" : "切换为上下分栏 (推荐思维导图/白板)"}
            >
              {isCol ? "◫ 左右并排" : "⬒ 上下分栏"}
            </button>
            <button
              type="button"
              className={`splitter-ratio-chip ${Math.abs(splitRatio - 0.7) < 0.04 ? "is-active" : ""}`}
              onClick={() => handleSetRatio(0.7)}
              title="7:3 分栏比例 (主区 70%, 图谱 30%)"
            >
              7:3
            </button>
            <button
              type="button"
              className={`splitter-ratio-chip ${Math.abs(splitRatio - (isCol ? 0.62 : 0.5)) < 0.04 ? "is-active" : ""}`}
              onClick={() => handleSetRatio(isCol ? 0.62 : 0.5)}
              title={isCol ? "6:4 黄金分栏 (主区 62%, 图谱 38%)" : "5:5 均等分栏"}
            >
              {isCol ? "6:4" : "5:5"}
            </button>
            <button
              type="button"
              className={`splitter-ratio-chip ${Math.abs(splitRatio - (isCol ? 0.5 : 0.3)) < 0.04 ? "is-active" : ""}`}
              onClick={() => handleSetRatio(isCol ? 0.5 : 0.3)}
              title={isCol ? "5:5 均等分栏" : "3:7 分栏比例 (主区 30%, 图谱 70%)"}
            >
              {isCol ? "5:5" : "3:7"}
            </button>
          </div>
        </div>
      )}

      {/* Secondary Pane: Embedded Knowledge Graph View */}
      <div
        className="graph-workspace-right-pane"
        style={
          isCol
            ? {
                flex: isMaximized ? "1 1 100%" : `0 0 ${(1 - splitRatio) * 100}%`,
                height: isMaximized ? "100%" : `${(1 - splitRatio) * 100}%`,
                width: "100%",
              }
            : {
                flex: isMaximized ? "1 1 100%" : `0 0 ${(1 - splitRatio) * 100}%`,
                width: isMaximized ? "100%" : `${(1 - splitRatio) * 100}%`,
                height: "100%",
              }
        }
      >
        <GraphViewPane
          graphData={graphData}
          currentDocId={currentDocId}
          theme={theme}
          onSelectNode={onSelectNode}
          onClose={onCloseGraph}
          isMaximized={isMaximized}
          onToggleMaximize={() => setIsMaximized(!isMaximized)}
          splitOrientation={orientation}
          onToggleOrientation={handleToggleOrientation}
        />
      </div>
    </div>
  );
}

