import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import {
  Crosshair,
  Filter,
  Layers,
  Network,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ThemeMode } from "../core/types";
import {
  computeOrganicGraphPositions,
  filterGraphData,
  toCytoscapeElements,
  type GraphData,
} from "../services/graphService";

type GlobalGraphDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  graphData: GraphData;
  currentDocId?: string | null;
  theme: ThemeMode;
  onSelectNode: (docId: string) => void;
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

export function GlobalGraphDialog({
  isOpen,
  onClose,
  graphData,
  currentDocId,
  theme,
  onSelectNode,
}: GlobalGraphDialogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [hideIsolates, setHideIsolates] = useState(true);
  const [clusterByFolder, setClusterByFolder] = useState(false);
  const [crossFolderOnly, setCrossFolderOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "chapter" | "space">("all");
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
        const cy = cyRef.current;
        cy.zoom({
          level: clamped / 100,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
        });
      }
      setZoomPercent(clamped);
      setZoomInputValue(`${clamped}%`);
    } else {
      setZoomInputValue(`${zoomPercent}%`);
    }
  };

  // Filtered graph elements
  const filteredData = useMemo(() => {
    return filterGraphData(graphData, {
      hideIsolates,
      query: searchQuery,
      typeFilter,
      clusterByFolder,
      crossFolderOnly,
    });
  }, [graphData, hideIsolates, searchQuery, typeFilter, clusterByFolder, crossFolderOnly]);

  // Handle ESC key and Spacebar panning mode
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
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
  }, [isOpen, onClose]);

  // Stable refs for callbacks and dynamic states so they don't trigger Cytoscape recreation
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isSpacePanningRef = useRef(isSpacePanning);
  isSpacePanningRef.current = isSpacePanning;
  const currentDocIdRef = useRef(currentDocId);
  currentDocIdRef.current = currentDocId;

  // Sync cursor mode without re-initializing Cytoscape
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = isSpacePanning ? "grab" : "default";
    }
  }, [isSpacePanning]);

  // Cytoscape initialization & re-render
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const isDark = theme === "twitter" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    const isEink = theme === "eink";

    const currentBg = isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7";
    const currentBorder = isEink ? "#000000" : isDark ? "#bae6fd" : "#7dd3fc";
    const normalBg = isEink ? "#444444" : isDark ? "#334155" : "#94a3b8";
    const normalBorder = isEink ? "#000000" : isDark ? "#64748b" : "#cbd5e1";
    const spaceBg = isEink ? "#777777" : "#f59e0b";
    const edgeColor = isEink ? "rgba(0, 0, 0, 0.45)" : isDark ? "rgba(148, 163, 184, 0.28)" : "rgba(100, 116, 139, 0.25)";
    const crossFolderEdgeColor = isEink ? "#000000" : isDark ? "#38bdf8" : "#0284c7";
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
            "font-size": "11px",
            "font-family": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            "font-weight": 600,
            color: nodeTextColor,
            "text-valign": "bottom",
            "text-margin-y": 6,
            "text-max-width": "125px",
            "text-wrap": "wrap",
            "text-outline-color": textOutlineColor,
            "text-outline-width": 2.5,
            "text-outline-opacity": 1,
            shape: "ellipse",
            width: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 22 : Math.min(22, Math.max(10, 10 + inDeg * 2.5));
            },
            height: (ele: any) => {
              const inDeg = ele.data("inDegree") || 0;
              return ele.data("isCurrent") ? 22 : Math.min(22, Math.max(10, 10 + inDeg * 2.5));
            },
            "background-color": (ele: any) => {
              if (ele.data("isCurrent")) return currentBg;
              if (clusterByFolder && ele.data("clusterColor")) {
                return isEink ? normalBg : ele.data("clusterColor");
              }
              if (ele.data("type") === "space") return spaceBg;
              return normalBg;
            },
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
            width: 1.4,
            "line-color": edgeColor,
            "target-arrow-color": edgeColor,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.7,
            "line-style": isEink ? "dashed" : "solid",
            "overlay-opacity": 0,
            "transition-property": "opacity, line-color, width, target-arrow-color",
            "transition-duration": "0.18s",
            "transition-timing-function": "ease-out",
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
            width: 2.2,
            opacity: 1,
            "z-index": 1000,
          },
        },
        {
          selector: "edge.highlighted",
          style: {
            "line-color": isEink ? "#000000" : "#818cf8",
            "target-arrow-color": isEink ? "#000000" : "#818cf8",
            width: 2.4,
            opacity: 1,
            "z-index": 999,
          },
        },
        {
          selector: "node.highlighted",
          style: {
            opacity: 1,
            "background-opacity": 1,
            "border-width": 0,
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
            width: 2.6,
            opacity: 1,
            "z-index": 999,
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

    // Node Cursor Feedback & Hover Headlight
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

    // Node tap & double tap logic
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
      onCloseRef.current();
    };

    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const nodeId = node.data("id");
      const currentTime = Date.now();

      // Double-click detection (350ms window)
      if (currentTime - lastTapTime < 350 && lastTapNodeId === nodeId) {
        openNodeDoc(nodeId);
        lastTapTime = 0;
        lastTapNodeId = "";
        return;
      }
      lastTapTime = currentTime;
      lastTapNodeId = nodeId;

      // Single-click toggle unselect if clicking the already selected node
      if (activeSelectedId === nodeId) {
        activeSelectedId = null;
        setSelectedNode(null);
        cy.batch(() => {
          cy.elements().removeClass("highlighted dimmed");
        });
        return;
      }

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

      // Highlight neighborhood
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

    // Throttled zoom event via requestAnimationFrame to avoid UI thread thrashing
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

    // Default to 100% zoom and center on active document or canvas center
    cy.zoom(1.0);
    const initialTarget = findCurrentNode(cy, currentDocIdRef.current);
    if (initialTarget && initialTarget.length > 0) {
      cy.center(initialTarget);
      const crossCount = initialTarget.isNode()
        ? (initialTarget as any).connectedEdges().filter((e: any) => Boolean(e.data("isCrossFolder"))).length
        : 0;
      setSelectedNode({
        id: initialTarget.data("id"),
        label: initialTarget.data("label"),
        path: initialTarget.data("path"),
        type: initialTarget.data("type"),
        inDegree: initialTarget.data("inDegree") || 0,
        outDegree: initialTarget.data("outDegree") || 0,
        isCurrent: Boolean(initialTarget.data("isCurrent")),
        folderGroup: initialTarget.data("folderGroup"),
        crossFolderCount: crossCount,
      });
      cy.batch(() => {
        cy.elements().removeClass("highlighted dimmed");
        const neighborhood = initialTarget.neighborhood().add(initialTarget);
        neighborhood.addClass("highlighted");
        cy.elements().difference(neighborhood).addClass("dimmed");
      });
    } else {
      cy.center();
    }
    setZoomPercent(100);
    setZoomInputValue("100%");

    // Initial resize after modal animation settles
    const initialResizeTimer = setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.resize();
        cyRef.current.zoom(1.0);
        const cur = findCurrentNode(cyRef.current, currentDocIdRef.current);
        if (cur && cur.length > 0) {
          cyRef.current.center(cur);
        } else {
          cyRef.current.center();
        }
        setZoomPercent(100);
        setZoomInputValue("100%");
      }
    }, 60);

    // Observe container size changes (e.g. window resize or display scaling)
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
      if (zoomRafId !== null) {
        window.cancelAnimationFrame(zoomRafId);
      }
      clearTimeout(initialResizeTimer);
      if (ro) {
        ro.disconnect();
      }
      // Free Canvas & GPU resources immediately
      cy.destroy();
      cyRef.current = null;
    };
  }, [isOpen, filteredData, theme]);

  if (!isOpen) return null;

  const handleResetFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 40);
    }
  };

  const executeFocus = (targetNode: any) => {
    if (!cyRef.current || !targetNode || targetNode.length === 0) return;
    const cy = cyRef.current;
    cy.stop();

    const currentZ = cy.zoom();
    const targetZ = Math.min(2.5, Math.max(currentZ, 1.05));

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

    const nodeEdges = targetNode.connectedEdges();
    const crossCount = nodeEdges.filter((e: any) => Boolean(e.data("isCrossFolder"))).length;
    setSelectedNode({
      id: targetNode.data("id"),
      label: targetNode.data("label"),
      path: targetNode.data("path"),
      type: targetNode.data("type"),
      inDegree: targetNode.data("inDegree") || 0,
      outDegree: targetNode.data("outDegree") || 0,
      isCurrent: Boolean(targetNode.data("isCurrent")),
      folderGroup: targetNode.data("folderGroup"),
      crossFolderCount: crossCount,
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

    // If node is currently filtered out (e.g. by hideIsolates or search), reset filter first
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
    <div className="global-graph-overlay" onClick={onClose}>
      <div
        className="global-graph-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="知识拓扑全景图谱"
      >
        {/* Modal Header */}
        <div className="global-graph-header">
          <div className="global-graph-title-group">
            <Network size={20} className="text-cyan" />
            <h2 className="global-graph-title">知识网络全景图谱</h2>
            <div className="global-graph-badges">
              <span className="graph-stat-badge">
                {filteredData.nodes.length} 节点
              </span>
              <span className="graph-stat-badge">
                {filteredData.edges.length} 条关联
              </span>
            </div>
          </div>

          <button
            type="button"
            className="global-graph-close-btn"
            onClick={onClose}
            aria-label="关闭图谱"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="global-graph-toolbar">
          <div className="graph-search-box">
            <Search size={14} className="graph-search-icon" />
            <input
              type="text"
              className="graph-search-input"
              placeholder="搜索节点名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

          <div className="graph-filters">
            <button
              type="button"
              className={`graph-toggle-btn ${clusterByFolder ? "is-active" : ""}`}
              onClick={() => setClusterByFolder((prev) => !prev)}
              title="按笔记所在文件夹进行色彩聚类染色"
            >
              <span>🎨 目录聚类</span>
            </button>

            <button
              type="button"
              className={`graph-toggle-btn ${crossFolderOnly ? "is-active" : ""}`}
              onClick={() => setCrossFolderOnly((prev) => !prev)}
              title="仅显示跨文件夹之间的引用连线"
            >
              <span>🌐 跨文件夹关系</span>
            </button>

            <button
              type="button"
              className={`graph-toggle-btn ${hideIsolates ? "is-active" : ""}`}
              onClick={() => setHideIsolates((prev) => !prev)}
              title="隐藏 0 入度与 0 出度的孤岛节点"
            >
              <Filter size={13} />
              <span>隐藏孤岛节点</span>
            </button>

            <div className="graph-type-selector">
              <Layers size={13} />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="graph-select"
                aria-label="筛选文档类型"
              >
                <option value="all">全部类型</option>
                <option value="chapter">仅正文章节</option>
                <option value="space">仅闪念 Space</option>
              </select>
            </div>
          </div>

          <div className="graph-toolbar-actions">
            {(Boolean(currentDocId) || graphData.nodes.some((n) => n.isCurrent)) && (
              <button
                type="button"
                className="graph-action-btn focus-btn"
                onClick={handleFocusActive}
                title="镜头平滑聚焦至当前文档"
              >
                <Crosshair size={13} />
                <span>聚焦当前</span>
              </button>
            )}
            <button
              type="button"
              className="graph-action-btn"
              onClick={handleZoomIn}
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <div className="graph-zoom-input-wrapper" title="可手动输入缩放比例 (10% - 500%)，回车或失焦生效">
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
                aria-label="图谱缩放百分比"
              />
            </div>
            <button
              type="button"
              className="graph-action-btn"
              onClick={handleZoomOut}
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className="graph-action-btn"
              onClick={handleResetFit}
              title="自适应居中全景"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Canvas Body */}
        <div className={`global-graph-canvas-wrapper ${isSpacePanning ? "space-panning" : ""}`}>
          <div className="global-graph-canvas" ref={containerRef} />

          {/* Selected Node Details Card (Bottom-Left) */}
          {selectedNode && (
            <div className="graph-node-inspector">
              {/* Top row: Badges on left, Close button on right */}
              <div className="inspector-meta-row">
                <div className="inspector-badges">
                  <span className={`node-type-badge type-${selectedNode.type}`}>
                    {selectedNode.type === "space" ? "⚡ 闪念" : "📄 文档"}
                  </span>
                  {selectedNode.folderGroup && (
                    <span
                      className="node-folder-badge"
                      title={`所属目录: ${selectedNode.folderGroup}`}
                    >
                      📁 {selectedNode.folderGroup}
                    </span>
                  )}
                  {selectedNode.isCurrent && (
                    <span className="node-current-badge">当前阅读</span>
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
                className="inspector-open-btn"
                onClick={() => {
                  onSelectNode(selectedNode.id);
                  onClose();
                }}
              >
                打开文档进行编辑 ➔
              </button>
            </div>
          )}

          {/* Help legend (Bottom-Right) */}
          <div className="graph-legend">
            <div className="legend-item">
              <span className="legend-dot dot-current" /> 当前文档
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-chapter" /> 文档章节
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-space" /> 闪念 Space
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ background: "#38bdf8", borderRadius: 2 }} /> 跨文件夹连线
            </div>
            <div className="legend-item hint-text">
              提示：双击节点直接打开
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
