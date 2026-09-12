import { useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { ThemeMode } from "../core/types";
import {
  extractLocalSubgraph,
  toCytoscapeElements,
  type GraphData,
} from "../services/graphService";

type LocalGraphViewProps = {
  graphData: GraphData;
  currentDocId: string;
  theme: ThemeMode;
  onSelectNode: (docId: string) => void;
  onOpenGlobalGraph?: () => void;
};

export function LocalGraphView({
  graphData,
  currentDocId,
  theme,
  onSelectNode,
  onOpenGlobalGraph,
}: LocalGraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [hoverNode, setHoverNode] = useState<{
    label: string;
    inDegree: number;
    outDegree: number;
    isCurrent: boolean;
    folderGroup?: string;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Extract 1-hop local subgraph around currentDocId
    const localSubgraph = extractLocalSubgraph(graphData, currentDocId, 1);
    const elements = toCytoscapeElements(localSubgraph);

    // 2. Resolve colors based on theme
    const isDark = theme === "twitter" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    const isEink = theme === "eink";

    const currentBg = isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7";
    const currentBorder = isEink ? "#000000" : isDark ? "#bae6fd" : "#38bdf8";
    const normalBg = isEink ? "#555555" : isDark ? "#475569" : "#94a3b8";
    const normalBorder = isEink ? "#000000" : isDark ? "#64748b" : "#cbd5e1";
    const spaceBg = isEink ? "#777777" : "#f59e0b";
    const edgeColor = isEink ? "rgba(0, 0, 0, 0.45)" : isDark ? "rgba(148, 163, 184, 0.3)" : "rgba(100, 116, 139, 0.3)";
    const crossFolderEdgeColor = isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7";
    const textColor = isEink ? "#000000" : isDark ? "#cbd5e1" : "#334155";

    // 3. Initialize Cytoscape with low-overhead flags
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      wheelSensitivity: 4.5,
      minZoom: 0.1,
      maxZoom: 5.0,
      textureOnViewport: false,
      motionBlur: false,
      pixelRatio: "auto",
      boxSelectionEnabled: false,
      autounselectify: true,
      style: [
        {
          selector: "core",
          style: {
            "active-bg-opacity": 0,
            "active-bg-size": 0,
            "selection-box-opacity": 0,
            "outside-texture-bg-opacity": 0,
          },
        },
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": "10px",
            "font-family": "system-ui, -apple-system, sans-serif",
            color: textColor,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-max-width": "90px",
            width: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 22 : Math.min(20, Math.max(12, 12 + inDeg * 2));
            },
            height: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 22 : Math.min(20, Math.max(12, 12 + inDeg * 2));
            },
            "background-color": (ele: any) => {
              if (ele.data("isCurrent")) return currentBg;
              if (ele.data("type") === "space") return spaceBg;
              return normalBg;
            },
            "border-width": 0,
            "border-opacity": 0,
            "border-style": "solid",
            shape: "ellipse",
            "overlay-opacity": 0,
            "overlay-padding": 0,
            "active-bg-opacity": 0,
            "active-bg-size": 0,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": edgeColor,
            "target-arrow-color": edgeColor,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.7,
            "line-style": isEink ? "dashed" : "solid",
          },
        },
        {
          selector: "edge[?isCrossFolder]",
          style: {
            "line-color": crossFolderEdgeColor,
            "target-arrow-color": crossFolderEdgeColor,
            "line-style": "dashed",
            "line-dash-pattern": [5, 4],
            width: 1.6,
            opacity: 0.9,
          },
        },
      ] as any,
      layout: {
        name: "concentric",
        concentric: (node: any) => (node.data("isCurrent") ? 2 : 1),
        levelWidth: () => 1,
        minNodeSpacing: 35,
        padding: 24,
        animate: false, // Instant calculation, 0 CPU loop
      } as any,
    });

    cyRef.current = cy;

    // Tap to jump
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const targetId = node.data("id");
      if (targetId) {
        onSelectNode(targetId);
      }
    });

    // Hover tooltip
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      setHoverNode({
        label: node.data("label"),
        inDegree: node.data("inDegree") || 0,
        outDegree: node.data("outDegree") || 0,
        isCurrent: Boolean(node.data("isCurrent")),
        folderGroup: node.data("folderGroup"),
      });
      containerRef.current?.style.setProperty("cursor", "pointer");
    });

    cy.on("mouseout", "node", () => {
      setHoverNode(null);
      containerRef.current?.style.setProperty("cursor", "default");
    });

    // Center and fit
    cy.fit(undefined, 20);

    // Observe container size changes (e.g. sidebar drag resizing)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => {
        if (cyRef.current) {
          cyRef.current.resize();
        }
      });
      ro.observe(containerRef.current);
    }

    return () => {
      if (ro) {
        ro.disconnect();
      }
      // Immediate destruction to free GPU canvas & memory
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData, currentDocId, theme, onSelectNode]);

  const handleResetFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 20);
    }
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  return (
    <div className="local-graph-container" role="region" aria-label="局部知识拓扑图谱">
      <div className="local-graph-header">
        <span className="local-graph-title">局部关系脉络 (1度关联)</span>
        <div className="local-graph-actions">
          <button
            type="button"
            className="local-graph-btn"
            onClick={handleZoomIn}
            title="放大"
            aria-label="放大局部图谱"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            className="local-graph-btn"
            onClick={handleZoomOut}
            title="缩小"
            aria-label="缩小局部图谱"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="local-graph-btn"
            onClick={handleResetFit}
            title="重置居中"
            aria-label="重置居中"
          >
            <RotateCcw size={13} />
          </button>
          {onOpenGlobalGraph && (
            <button
              type="button"
              className="local-graph-btn highlight-btn"
              onClick={onOpenGlobalGraph}
              title="打开全景图谱看板"
              aria-label="全屏全景图谱"
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="local-graph-canvas" ref={containerRef} />

      {hoverNode && (
        <div className="local-graph-node-hint">
          <strong>{hoverNode.label}</strong>
          {hoverNode.isCurrent && <span className="current-tag">当前</span>}
          {hoverNode.folderGroup && (
            <span style={{ fontSize: 10, color: "#38bdf8", marginLeft: 4 }}>
              [{hoverNode.folderGroup}]
            </span>
          )}
          <div className="hint-meta">
            入度: {hoverNode.inDegree} · 出度: {hoverNode.outDegree}
          </div>
        </div>
      )}
    </div>
  );
}
