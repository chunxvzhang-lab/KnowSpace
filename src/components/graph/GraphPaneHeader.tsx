import {
  Columns,
  Crosshair,
  Filter,
  Maximize2,
  Minimize2,
  Network,
  RotateCcw,
  Rows,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { GraphData } from "../../services/graphService";

type GraphPaneHeaderProps = {
  /** The filtered dataset; only its node/edge counts are shown as badges. */
  filteredData: GraphData;
  showFilterDrawer: boolean;
  setShowFilterDrawer: Dispatch<SetStateAction<boolean>>;
  /** Refocus the active document (GraphViewPane owns the filter-rollback flow). */
  handleFocusActive: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetFit: () => void;
  zoomInputValue: string;
  setZoomInputValue: Dispatch<SetStateAction<string>>;
  zoomPercent: number;
  handleApplyZoomInput: () => void;
  isMaximized: boolean;
  onToggleMaximize?: () => void;
  splitOrientation: "row" | "column";
  onToggleOrientation?: () => void;
  onClose?: () => void;
};

/**
 * The pane header of the graph view: title + node/edge badges, the filter
 * toggle, focus, the zoom group, and the split/maximize/close actions.
 *
 * Extracted verbatim from GraphViewPane's header JSX (decomposition of the
 * pane): the DOM, class names and event semantics are the contract. Everything
 * it reads arrives as props from the pane, which still owns the state and the
 * Cytoscape instance. No memo, here or at the call site.
 */
export function GraphPaneHeader({
  filteredData,
  showFilterDrawer,
  setShowFilterDrawer,
  handleFocusActive,
  handleZoomIn,
  handleZoomOut,
  handleResetFit,
  zoomInputValue,
  setZoomInputValue,
  zoomPercent,
  handleApplyZoomInput,
  isMaximized,
  onToggleMaximize,
  splitOrientation,
  onToggleOrientation,
  onClose,
}: GraphPaneHeaderProps) {
  // Pane Header (Obsidian style)
  return (
    <div className="graph-pane-header">
      <div className="graph-pane-title-group">
        <Network size={15} className="graph-pane-icon text-cyan" />
        <span className="graph-pane-title">Graph view · 知识网络</span>
        <span className="graph-stat-badge">{filteredData.nodes.length} 节点</span>
        <span className="graph-stat-badge">{filteredData.edges.length} 关联</span>
      </div>

      {/* Action Controls */}
      <div className="graph-pane-actions">
        {/* Filter toggle */}
        <button
          type="button"
          className={`graph-action-btn ${showFilterDrawer ? "is-active" : ""}`}
          onClick={() => setShowFilterDrawer(!showFilterDrawer)}
          title="过滤与筛选"
        >
          <Filter size={13} />
        </button>

        {/* Focus current node */}
        <button
          type="button"
          className="graph-action-btn"
          onClick={handleFocusActive}
          title="聚焦当前文档"
        >
          <Crosshair size={13} />
        </button>

        {/* Zoom controls */}
        <div className="graph-zoom-group">
          <button type="button" className="graph-action-btn" onClick={handleZoomIn} title="放大">
            <ZoomIn size={13} />
          </button>
          <input
            type="text"
            className="graph-zoom-input"
            value={zoomInputValue}
            onChange={(e) => setZoomInputValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={handleApplyZoomInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApplyZoomInput();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setZoomInputValue(`${zoomPercent}%`);
                (e.target as HTMLInputElement).blur();
              }
            }}
            title="输入百分比缩放 (10%~500%)"
            aria-label="图谱缩放百分比"
          />
          <button type="button" className="graph-action-btn" onClick={handleZoomOut} title="缩小">
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="graph-action-btn"
            onClick={handleResetFit}
            title="自适应全景居中"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        {/* Split Orientation Toggle */}
        {onToggleOrientation && !isMaximized && (
          <button
            type="button"
            className="graph-action-btn"
            onClick={onToggleOrientation}
            title={
              splitOrientation === "row"
                ? "切换为上下分栏 (推荐思维导图/白板)"
                : "切换为左右并排分栏"
            }
          >
            {splitOrientation === "row" ? <Rows size={13} /> : <Columns size={13} />}
          </button>
        )}

        {/* Maximize / Restore Toggle */}
        {onToggleMaximize && (
          <button
            type="button"
            className="graph-action-btn"
            onClick={onToggleMaximize}
            title={isMaximized ? "还原分栏对照" : "最大化图谱"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}

        {/* Close pane */}
        {onClose && (
          <>
            <div className="graph-pane-divider" />
            <button
              type="button"
              className="graph-pane-close-btn"
              onClick={onClose}
              title="收起图谱分栏"
              aria-label="收起图谱分栏"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
