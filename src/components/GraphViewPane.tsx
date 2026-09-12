import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import {
  Columns,
  Crosshair,
  Filter,
  Maximize2,
  Minimize2,
  Network,
  RotateCcw,
  Rows,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  ExternalLink,
} from "lucide-react";
import type { ThemeMode } from "../core/types";
import {
  computeOrganicGraphPositions,
  filterGraphData,
  toCytoscapeElements,
  type GraphData,
} from "../services/graphService";

export type GraphViewPaneProps = {
  graphData: GraphData;
  currentDocId?: string | null;
  theme: ThemeMode;
  onSelectNode: (docId: string) => void;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  splitOrientation?: "row" | "column";
  onToggleOrientation?: () => void;
};

/**
 * Resiliently resolves the active document node in Cytoscape using multiple fallbacks:
 * 1. Explicit `isCurrent` property marked on node
 * 2. Exact target ID match
 * 3. Normalized path / filename / title match
 */
function findCurrentNode(cy: Core | null, targetId?: string | null) {
  if (!cy) return null;
  const curNodes = cy.nodes().filter((n) => Boolean(n.data("isCurrent")));
  if (curNodes.length > 0) return curNodes.first();

  if (targetId) {
    const byId = cy.getElementById(targetId);
    if (byId.length > 0) return byId.first();

    const norm = targetId.trim().toLowerCase();
    const matched = cy.nodes().filter((n) => {
      const nid = (n.data("id") || "").toLowerCase();
      const path = (n.data("path") || "").toLowerCase();
      const label = (n.data("label") || "").toLowerCase();
      const normTitle = (n.data("normTitle") || "").toLowerCase();
      return (
        nid === norm ||
        path === norm ||
        norm.endsWith(path) ||
        path.endsWith(norm) ||
        label === norm ||
        normTitle === norm ||
        norm.includes(label)
      );
    });
    if (matched.length > 0) return matched.first();
  }

  return null;
}

export function GraphViewPane({
  graphData,
  currentDocId,
  theme,
  onSelectNode,
  onClose,
  isMaximized = false,
  onToggleMaximize,
  splitOrientation = "row",
  onToggleOrientation,
}: GraphViewPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [hideIsolates, setHideIsolates] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "chapter" | "space">("all");
  const [hopDepth, setHopDepth] = useState<"all" | 1 | 2>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "hubs" | "orphans">("all");
  const [clusterByFolder, setClusterByFolder] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [crossFolderOnly, setCrossFolderOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    path?: string;
    type: string;
    inDegree: number;
    outDegree: number;
    isCurrent: boolean;
    folderGroup?: string;
    crossFolderCount?: number;
  } | null>(null);

  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomInputValue, setZoomInputValue] = useState("100%");

  const handleApplyZoomInput = () => {
    const raw = zoomInputValue.replace(/[^0-9.]/g, "");
    const val = parseFloat(raw);
    if (Number.isFinite(val) && val >= 10 && val <= 500) {
      const clamped = Math.round(val);
      if (cyRef.current) {
        cyRef.current.zoom({
          level: clamped / 100,
          renderedPosition: {
            x: cyRef.current.width() / 2,
            y: cyRef.current.height() / 2,
          },
        });
        setZoomPercent(clamped);
        setZoomInputValue(`${clamped}%`);
      }
    } else {
      setZoomInputValue(`${zoomPercent}%`);
    }
  };

  // Compute filtered dataset
  const filteredData = useMemo(() => {
    return filterGraphData(graphData, {
      hideIsolates,
      query: searchQuery,
      typeFilter,
      depth: hopDepth,
      currentDocId,
      viewFilter,
      clusterByFolder,
      crossFolderOnly,
    });
  }, [graphData, hideIsolates, searchQuery, typeFilter, hopDepth, currentDocId, viewFilter, clusterByFolder, crossFolderOnly]);

  // Handle Spacebar panning mode inside graph pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        setIsSpacePanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  // Stable refs so Cytoscape callbacks always see latest values without re-init
  const currentDocIdRef = useRef(currentDocId);
  currentDocIdRef.current = currentDocId;
  const isSpacePanningRef = useRef(isSpacePanning);
  isSpacePanningRef.current = isSpacePanning;

  // Cytoscape initialization & re-render
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "twitter" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    const isEink = theme === "eink";

    // Obsidian style colors: clean solid nodes without outer border circles
    const currentBg = isEink ? "#000000" : isDark ? "#8b5cf6" : "#7c3aed"; // Obsidian vivid purple for active node
    const normalBg = isEink ? "#444444" : isDark ? "#64748b" : "#94a3b8"; // Slate grey for regular notes
    const spaceBg = isEink ? "#777777" : "#f59e0b"; // Warm amber for space notes
    const edgeColor = isEink ? "rgba(0, 0, 0, 0.4)" : isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(100, 116, 139, 0.2)";
    const crossFolderEdgeColor = isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7"; // Cyan/sky blue for cross-folder links
    const nodeTextColor = isEink ? "#000000" : isDark ? "#f8fafc" : "#0f172a";
    const textOutlineColor = isEink ? "#ffffff" : isDark ? "#0b0f19" : "#ffffff";

    // 1. Compute 2D organic force-directed positions in < 3ms
    const positions = computeOrganicGraphPositions(filteredData);
    const elements = toCytoscapeElements(filteredData);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      wheelSensitivity: 3.5,
      minZoom: 0.15,
      maxZoom: 4.5,
      textureOnViewport: false,
      motionBlur: false,
      pixelRatio: "auto",
      // 完全禁用 Cytoscape 内建选中态（选中态会触发默认 :selected 样式与选中反馈绘制）
      boxSelectionEnabled: false,
      autounselectify: true,
      style: [
        {
          // 彻底关闭画布核心区（空白区域）在点击时的任何圆形阴影/点击反馈光圈
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
            "font-size": "11px",
            "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            "font-weight": 500,
            color: nodeTextColor,
            "text-valign": "bottom",
            "text-margin-y": 5,
            "text-max-width": "120px",
            "text-wrap": "wrap",
            "text-outline-color": textOutlineColor,
            "text-outline-width": 2,
            "text-outline-opacity": 0.9,
            // 节点必须为标准圆形（Ellipse），尺寸随引用权重适度缩放
            shape: "ellipse",
            width: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 18 : Math.min(18, Math.max(9, 9 + inDeg * 1.8));
            },
            height: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 18 : Math.min(18, Math.max(9, 9 + inDeg * 1.8));
            },
            "background-color": (ele: any) => {
              if (ele.data("isCurrent")) return currentBg;
              if (clusterByFolder && ele.data("clusterColor")) {
                return isEink ? normalBg : ele.data("clusterColor");
              }
              if (ele.data("type") === "space") return spaceBg;
              return normalBg;
            },
            // 极简风格与平滑过渡
            "border-width": 0,
            "border-opacity": 0,
            "border-style": "solid",
            "overlay-opacity": 0,
            "overlay-padding": 0,
            "active-bg-opacity": 0,
            "active-bg-size": 0,
            "transition-property": "opacity, border-width, border-color, background-color",
            "transition-duration": "0.18s",
            "transition-timing-function": "ease-out",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.2,
            "line-color": edgeColor,
            "target-arrow-color": edgeColor,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.65,
            "line-style": isEink ? "dashed" : "solid",
            "overlay-opacity": 0,
            "transition-property": "opacity, line-color, width, target-arrow-color",
            "transition-duration": "0.18s",
            "transition-timing-function": "ease-out",
          },
        },
        {
          // 跨文件夹引用关系：采用虚线与专属青蓝主色调强化跨边界感知
          selector: "edge[?isCrossFolder]",
          style: {
            "line-color": crossFolderEdgeColor,
            "target-arrow-color": crossFolderEdgeColor,
            "line-style": "dashed",
            "line-dash-pattern": [5, 4],
            width: 1.5,
            opacity: 0.9,
          },
        },
        {
          // 鼠标悬停探灯连线点亮效果
          selector: "node.hovered",
          style: {
            "z-index": 1000,
            opacity: 1,
            "border-width": 2,
            "border-color": isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7",
            "border-opacity": 0.85,
          },
        },
        {
          selector: "edge.hovered",
          style: {
            "line-color": isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7",
            "target-arrow-color": isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7",
            width: 2.0,
            opacity: 1,
            "z-index": 1000,
          },
        },
        {
          // 高亮规则必须只作用于边
          selector: "edge.highlighted",
          style: {
            "line-color": isEink ? "#000000" : "#818cf8",
            "target-arrow-color": isEink ? "#000000" : "#818cf8",
            width: 2.2,
            opacity: 1,
            "z-index": 999,
          },
        },
        {
          selector: "edge.highlighted[?isCrossFolder]",
          style: {
            "line-color": isEink ? "#000000" : "#06b6d4",
            "target-arrow-color": isEink ? "#000000" : "#06b6d4",
            "line-style": "dashed",
            "line-dash-pattern": [6, 3],
            width: 2.5,
            opacity: 1,
            "z-index": 999,
          },
        },
        {
          // 节点高亮置顶
          selector: "node.highlighted",
          style: {
            opacity: 1,
            "background-opacity": 1,
            "border-width": 0,
            "z-index": 999,
          },
        },
        {
          // 彻底关闭按下/激活态的一切附加绘制
          selector: ":active",
          style: {
            "overlay-opacity": 0,
            "overlay-padding": 0,
            "overlay-color": "transparent",
            "active-bg-opacity": 0,
            "active-bg-size": 0,
            "underlay-opacity": 0,
            "underlay-padding": 0,
          },
        },
        {
          selector: ":selected",
          style: {
            "overlay-opacity": 0,
            "overlay-padding": 0,
            "active-bg-opacity": 0,
            "active-bg-size": 0,
            "border-width": 0,
            "border-opacity": 0,
          },
        },
        {
          selector: ".dimmed",
          style: {
            opacity: 0.18,
          },
        },
      ] as any,
      layout: {
        name: "preset",
        positions: (node: any) => positions.get(node.data("id")),
      } as any,
    });

    cyRef.current = cy;

    // Node Cursor Feedback & Hover Headlight illumination
    let activeSelectedId: string | null = null;

    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      if (containerRef.current) {
        containerRef.current.style.cursor = "pointer";
      }
      if (!activeSelectedId) {
        node.addClass("hovered");
        node.connectedEdges().addClass("hovered");
      }
    });

    cy.on("mouseout", "node", (evt) => {
      const node = evt.target;
      if (containerRef.current) {
        containerRef.current.style.cursor = isSpacePanningRef.current ? "grab" : "default";
      }
      node.removeClass("hovered");
      node.connectedEdges().removeClass("hovered");
    });

    cy.on("grab", "node", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "grabbing";
      }
    });

    cy.on("free", "node", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "pointer";
      }
    });

    let lastTapTime = 0;
    let lastTapNodeId = "";
    let lastOpenTime = 0;
    let lastOpenNodeId = "";

    const openNodeDoc = (nodeId: string) => {
      const now = Date.now();
      if (now - lastOpenTime < 400 && lastOpenNodeId === nodeId) {
        return;
      }
      lastOpenTime = now;
      lastOpenNodeId = nodeId;
      onSelectNodeRef.current(nodeId);
    };

    // Node tap logic: single-click highlights node and connections; double-click opens document!
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const nodeId = node.data("id");
      const currentTime = Date.now();

      // Double-click / double-tap detection (350ms window)
      if (currentTime - lastTapTime < 350 && lastTapNodeId === nodeId) {
        openNodeDoc(nodeId);
        lastTapTime = 0;
        lastTapNodeId = "";
        return;
      }
      lastTapTime = currentTime;
      lastTapNodeId = nodeId;

      activeSelectedId = nodeId;
      const nodeEdges = node.connectedEdges();
      const crossCount = nodeEdges.filter((e: any) => Boolean(e.data("isCrossFolder"))).length;
      setSelectedNode({
        id: node.data("id"),
        label: node.data("label"),
        path: node.data("path"),
        type: node.data("type"),
        inDegree: node.data("inDegree") || 0,
        outDegree: node.data("outDegree") || 0,
        isCurrent: Boolean(node.data("isCurrent")),
        folderGroup: node.data("folderGroup"),
        crossFolderCount: crossCount,
      });

      // Highlight neighborhood cleanly
      cy.batch(() => {
        cy.elements().removeClass("highlighted dimmed");
        const neighborhood = node.neighborhood().add(node);
        neighborhood.addClass("highlighted");
        cy.elements().difference(neighborhood).addClass("dimmed");
      });
    });

    // Native dbltap event fallback
    cy.on("dbltap", "node", (evt) => {
      const node = evt.target;
      const nodeId = node.data("id");
      openNodeDoc(nodeId);
      lastTapTime = 0;
      lastTapNodeId = "";
    });

    // Click background: clear selection and highlights
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        lastTapTime = 0;
        lastTapNodeId = "";
        activeSelectedId = null;
        setSelectedNode(null);
        cy.batch(() => {
          cy.elements().removeClass("highlighted dimmed");
        });
      }
    });

    // Throttled zoom event via requestAnimationFrame
    let zoomRafId: number | null = null;
    cy.on("zoom", () => {
      if (zoomRafId !== null) return;
      zoomRafId = window.requestAnimationFrame(() => {
        zoomRafId = null;
        if (cyRef.current) {
          const z = Math.round(cyRef.current.zoom() * 100);
          setZoomPercent(z);
          setZoomInputValue(`${z}%`);
        }
      });
    });

    // Use setTimeout(0) instead of rAF: setTimeout fires AFTER layout+paint,
    // guaranteeing the flex split pane has its real width when we call cy.center/fit.
    // (rAF fires before paint and may still see 0-width container)
    const initTimerId = setTimeout(() => {
      if (!cyRef.current) return;
      cyRef.current.resize(); // Sync internal canvas dimensions with real container size
      const liveTarget = findCurrentNode(cyRef.current, currentDocIdRef.current);

      // 根据窗口自适应缩放图谱节点，使所有节点完整适配视口
      cyRef.current.fit(undefined, 36);
      if (cyRef.current.zoom() > 1.05) {
        cyRef.current.zoom(1.0);
        if (liveTarget && liveTarget.length > 0) {
          cyRef.current.center(liveTarget);
        } else {
          cyRef.current.center();
        }
      }

      if (liveTarget && liveTarget.length > 0) {
        const crossCount = liveTarget.isNode()
          ? (liveTarget as any).connectedEdges().filter((e: any) => Boolean(e.data("isCrossFolder"))).length
          : 0;
        setSelectedNode({
          id: liveTarget.data("id"),
          label: liveTarget.data("label"),
          path: liveTarget.data("path"),
          type: liveTarget.data("type"),
          inDegree: liveTarget.data("inDegree") || 0,
          outDegree: liveTarget.data("outDegree") || 0,
          isCurrent: Boolean(liveTarget.data("isCurrent")),
          folderGroup: liveTarget.data("folderGroup"),
          crossFolderCount: crossCount,
        });
        cyRef.current.batch(() => {
          cyRef.current!.elements().removeClass("highlighted dimmed");
          const neighborhood = liveTarget.neighborhood().add(liveTarget);
          neighborhood.addClass("highlighted");
          cyRef.current!.elements().difference(neighborhood).addClass("dimmed");
        });
      }

      const z = Math.round(cyRef.current.zoom() * 100);
      setZoomPercent(z);
      setZoomInputValue(`${z}%`);
    }, 0);

    // ResizeObserver: re-fit on first meaningful width to fix zero-width init
    let initialFitDone = false;
    let ro: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (!cyRef.current) return;
        cyRef.current.resize();
        // 首次获得有效宽度时，根据当前窗口比例自适应适配图谱
        if (!initialFitDone && cyRef.current.width() > 50) {
          initialFitDone = true;
          cyRef.current.fit(undefined, 36);
          if (cyRef.current.zoom() > 1.05) {
            cyRef.current.zoom(1.0);
            const target = findCurrentNode(cyRef.current, currentDocIdRef.current);
            if (target && target.length > 0) {
              cyRef.current.center(target);
            } else {
              cyRef.current.center();
            }
          }
          const z = Math.round(cyRef.current.zoom() * 100);
          setZoomPercent(z);
          setZoomInputValue(`${z}%`);
        }
      });
      ro.observe(containerRef.current);
    }

    return () => {
      if (zoomRafId !== null) {
        window.cancelAnimationFrame(zoomRafId);
      }
      clearTimeout(initTimerId);
      if (ro) {
        ro.disconnect();
      }
      cy.destroy();
      cyRef.current = null;
    };
  // Only re-init Cytoscape when graph data or visual theme changes — NOT on currentDocId/isSpacePanning
  }, [filteredData, theme]);

  // Lightweight effect: update node highlight/data when active document changes
  // This runs WITHOUT destroying Cytoscape — no more vertical-line flicker on nav
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const target = findCurrentNode(cy, currentDocId);
    if (target && target.length > 0) {
      cy.batch(() => {
        cy.elements().removeClass("highlighted dimmed");
        const neighborhood = target.neighborhood().add(target);
        neighborhood.addClass("highlighted");
        cy.elements().difference(neighborhood).addClass("dimmed");
      });
    }
  }, [currentDocId]);

  const handleResetFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 36);
      if (cyRef.current.zoom() > 1.05) {
        cyRef.current.zoom(1.0);
        cyRef.current.center();
      }
      const z = Math.round(cyRef.current.zoom() * 100);
      setZoomPercent(z);
      setZoomInputValue(`${z}%`);
    }
  };

  const executeFocus = (targetNode: any) => {
    if (!cyRef.current || !targetNode || targetNode.length === 0) return;
    const cy = cyRef.current;
    cy.stop();

    const currentZ = cy.zoom();
    const targetZ = Math.min(2.5, Math.max(currentZ, 1.0));

    cy.animate({
      center: { eles: targetNode },
      zoom: targetZ,
      duration: 350,
      easing: "ease-in-out-cubic",
      complete: () => {
        const z = Math.round(cy.zoom() * 100);
        setZoomPercent(z);
        setZoomInputValue(`${z}%`);
      },
    });

    const targetEdges = targetNode.connectedEdges();
    const targetCrossCount = targetEdges.filter((e: any) => Boolean(e.data("isCrossFolder"))).length;
    setSelectedNode({
      id: targetNode.data("id"),
      label: targetNode.data("label"),
      path: targetNode.data("path"),
      type: targetNode.data("type"),
      inDegree: targetNode.data("inDegree") || 0,
      outDegree: targetNode.data("outDegree") || 0,
      isCurrent: Boolean(targetNode.data("isCurrent")),
      folderGroup: targetNode.data("folderGroup"),
      crossFolderCount: targetCrossCount,
    });

    cy.batch(() => {
      cy.elements().removeClass("highlighted dimmed");
      const neighborhood = targetNode.neighborhood().add(targetNode);
      neighborhood.addClass("highlighted");
      cy.elements().difference(neighborhood).addClass("dimmed");
    });
  };

  const handleFocusActive = () => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    let targetNode = findCurrentNode(cy, currentDocId);

    if (!targetNode || targetNode.length === 0) {
      if (hideIsolates) setHideIsolates(false);
      if (searchQuery) setSearchQuery("");
      if (typeFilter !== "all") setTypeFilter("all");

      setTimeout(() => {
        if (!cyRef.current) return;
        const restored = findCurrentNode(cyRef.current, currentDocId);
        if (restored && restored.length > 0) {
          executeFocus(restored);
        }
      }, 60);
      return;
    }

    executeFocus(targetNode);
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      const cy = cyRef.current;
      const targetZoom = Math.min(5.0, cy.zoom() * 1.3);
      cy.zoom({
        level: targetZoom,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      const cy = cyRef.current;
      const targetZoom = Math.max(0.1, cy.zoom() * 0.77);
      cy.zoom({
        level: targetZoom,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
  };

  return (
    <div className="graph-view-pane" role="region" aria-label="知识网络图谱分栏">
      {/* Pane Header (Obsidian style) */}
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
            <button
              type="button"
              className="graph-action-btn"
              onClick={handleZoomIn}
              title="放大"
            >
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
            <button
              type="button"
              className="graph-action-btn"
              onClick={handleZoomOut}
              title="缩小"
            >
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
              title={splitOrientation === "row" ? "切换为上下分栏 (推荐思维导图/白板)" : "切换为左右并排分栏"}
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

      {/* Collapsible Filter Bar */}
      {showFilterDrawer && (
        <div className="graph-filter-drawer">
          <div className="graph-filter-search">
            <Search size={13} className="text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索图谱节点..."
              className="graph-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="graph-search-clear"
                onClick={() => setSearchQuery("")}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="graph-filter-options">
            <div className="graph-filter-group">
              <span className="graph-filter-label">视野:</span>
              <button
                type="button"
                className={`graph-filter-pill ${hopDepth === "all" ? "is-active" : ""}`}
                onClick={() => setHopDepth("all")}
                title="显示全局关系网络"
              >
                全局
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${hopDepth === 1 ? "is-active" : ""}`}
                onClick={() => setHopDepth(1)}
                title="仅聚焦当前文档直接引用的 1-Hop 节点"
              >
                1-Hop 邻近
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${hopDepth === 2 ? "is-active" : ""}`}
                onClick={() => setHopDepth(2)}
                title="聚焦当前文档 2-Hop 关联网络"
              >
                2-Hop 扩展
              </button>
            </div>

            <div className="graph-filter-group">
              <span className="graph-filter-label">视图:</span>
              <button
                type="button"
                className={`graph-filter-pill ${viewFilter === "all" ? "is-active" : ""}`}
                onClick={() => setViewFilter("all")}
              >
                全部节点
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${viewFilter === "hubs" ? "is-active" : ""}`}
                onClick={() => setViewFilter(viewFilter === "hubs" ? "all" : "hubs")}
                title="高连接度核心枢纽节点 (连接数 >= 3)"
              >
                核心枢纽 (MOC)
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${viewFilter === "orphans" ? "is-active" : ""}`}
                onClick={() => setViewFilter(viewFilter === "orphans" ? "all" : "orphans")}
                title="查找尚未建立双链的孤岛笔记 (连接数 = 0)"
              >
                未链接孤岛
              </button>
            </div>

            <div className="graph-filter-group">
              <span className="graph-filter-label">分类:</span>
              <button
                type="button"
                className={`graph-filter-pill ${typeFilter === "all" ? "is-active" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                全部
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${typeFilter === "chapter" ? "is-active" : ""}`}
                onClick={() => setTypeFilter("chapter")}
              >
                文档
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${typeFilter === "space" ? "is-active" : ""}`}
                onClick={() => setTypeFilter("space")}
              >
                闪念
              </button>
            </div>

            <div className="graph-filter-group">
              <button
                type="button"
                className={`graph-filter-pill ${clusterByFolder ? "is-active" : ""}`}
                onClick={() => setClusterByFolder(!clusterByFolder)}
                title="按笔记所在文件夹进行色彩聚类染色"
              >
                🎨 目录聚类
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${crossFolderOnly ? "is-active" : ""}`}
                onClick={() => setCrossFolderOnly(!crossFolderOnly)}
                title="仅显示连接不同文件夹的跨目录双链连线"
              >
                🌐 跨文件夹关系
              </button>
              <button
                type="button"
                className={`graph-filter-pill ${hideIsolates && viewFilter !== "orphans" ? "is-active" : ""}`}
                onClick={() => setHideIsolates(!hideIsolates)}
                disabled={viewFilter === "orphans"}
                title="隐藏没有双链关系的独立孤岛节点"
              >
                隐藏孤岛
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graph Canvas Container */}
      <div className={`graph-pane-canvas-wrapper ${isSpacePanning ? "space-panning" : ""}`}>
        <div className="graph-pane-canvas" ref={containerRef} />
      </div>

      {/* Selected Node Details Card — outside canvas-wrapper so overflow:hidden doesn't clip it */}
      {selectedNode && (
        <div className="graph-pane-inspector">
          {/* Top row: Badges on left, Close button on right */}
          <div className="inspector-meta-row">
            <div className="inspector-badges">
              <span className={`node-type-badge type-${selectedNode.type}`}>
                {selectedNode.type === "space" ? "⚡ 闪念" : "📄 文档"}
              </span>
              {selectedNode.folderGroup && (
                <span
                  className="node-folder-badge"
                  title={`所属文件夹: ${selectedNode.folderGroup}`}
                >
                  📁 {selectedNode.folderGroup}
                </span>
              )}
              {selectedNode.isCurrent && (
                <span className="node-current-badge">当前</span>
              )}
            </div>
            <button
              type="button"
              className="inspector-close-btn"
              onClick={() => setSelectedNode(null)}
              title="关闭详情卡片"
              aria-label="关闭详情卡片"
            >
              <X size={13} />
            </button>
          </div>

          {/* Dedicated Title Row */}
          <h4 className="inspector-card-title" title={selectedNode.label}>
            {selectedNode.label}
          </h4>

          {/* Optional Path Subtitle */}
          {selectedNode.path && (
            <div className="inspector-card-path" title={selectedNode.path}>
              {selectedNode.path}
            </div>
          )}

          {/* 3-Column Metrics Grid */}
          <div className="inspector-metrics-grid">
            <div className="inspector-stat-cell" title="反向双链引用数 (入度)">
              <span className="stat-num">{selectedNode.inDegree}</span>
              <span className="stat-label">被引用</span>
            </div>
            <div className="inspector-stat-cell" title="正向引出双链数 (出度)">
              <span className="stat-num">{selectedNode.outDegree}</span>
              <span className="stat-label">引出</span>
            </div>
            <div className="inspector-stat-cell" title="跨越不同文件夹的双链连线数">
              <span className="stat-num highlight-cyan">{selectedNode.crossFolderCount ?? 0}</span>
              <span className="stat-label">跨目录</span>
            </div>
          </div>

          {/* Open Document Action */}
          <button
            type="button"
            className="inspector-jump-btn"
            onClick={() => onSelectNodeRef.current(selectedNode.id)}
          >
            <ExternalLink size={13} />
            <span>在左侧打开文档</span>
          </button>
        </div>
      )}
    </div>
  );
}
