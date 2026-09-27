import { useCallback, useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { ThemeMode } from "../../core/types";
import {
  computeOrganicGraphPositions,
  toCytoscapeElements,
  type GraphData,
} from "../../services/graphService";
import { graphCytoscapeStyle } from "./graphCytoscapeStyle";

/** The shape of the selected-node details card; written by the Cytoscape tap handlers. */
export type GraphSelectedNode = {
  id: string;
  label: string;
  path?: string;
  type: string;
  inDegree: number;
  outDegree: number;
  isCurrent: boolean;
  folderGroup?: string;
  crossFolderCount?: number;
};

/**
 * Resiliently resolves the active document node in Cytoscape using multiple fallbacks:
 * 1. Explicit `isCurrent` property marked on node
 * 2. Exact target ID match
 * 3. Normalized path / filename / title match
 */
export function findCurrentNode(cy: Core | null, targetId?: string | null) {
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

type UseCytoscapeGraphParams = {
  /** The filtered dataset; the ONLY data identity the init effect re-runs on. */
  filteredData: GraphData;
  /** Visual theme; feeds the stylesheet palette. Re-initing on it is intended. */
  theme: ThemeMode;
  /** Folder-cluster coloring; reaches the stylesheet's background mapper. */
  clusterByFolder: boolean;
  /** The active document, mirrored into `currentDocIdRef` for the deferred probes. */
  currentDocId?: string | null;
  /** Open-document callback, mirrored into `onSelectNodeRef` for the dbl-tap open. */
  onSelectNode: (docId: string) => void;
};

/**
 * The Cytoscape instance of the graph pane and everything that lives inside its
 * lifecycle: the container/instance refs, the init effect (creation, event
 * wiring, the setTimeout(0) fit, the ResizeObserver re-fit and the destroy
 * cleanup, AS ONE UNIT), the lightweight current-document highlight effect, the
 * Space-pan mode, and the zoom/focus handlers that reach into
 * `cyRef.current`.
 *
 * Extracted verbatim from GraphViewPane (decomposition of the pane). The init
 * effect deliberately stays whole: its closures write `selectedNode` and the
 * zoom pair, and splitting "init" from "the handlers that read cyRef" would
 * either duplicate those states or re-thread them through props for no gain.
 *
 * The init effect's dependency array is the ORIGINAL, unchanged:
 * `[filteredData, theme, clusterByFolder]`. Everything else its body touches is
 * a ref or a useState setter created inside this hook — identities the linter
 * knows are stable — so `currentDocId`/`onSelectNode` keep arriving through
 * ref mirrors (`currentDocIdRef`/`onSelectNodeRef`) exactly as before, and the
 * effect re-runs no more and no less often than it did in GraphViewPane.
 *
 * The Space-pan keydown effect moved here because it reads nothing but its own
 * `setIsSpacePanning`: it toggles the mode whose ref the init effect's
 * mouseout cursor reset consults, and whose state the canvas wrapper class
 * reads back.
 */
export function useCytoscapeGraph({
  filteredData,
  theme,
  clusterByFolder,
  currentDocId,
  onSelectNode,
}: UseCytoscapeGraphParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphSelectedNode | null>(null);

  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomInputValue, setZoomInputValue] = useState("100%");

  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  // Stable refs so Cytoscape callbacks always see latest values without re-init
  const currentDocIdRef = useRef(currentDocId);
  currentDocIdRef.current = currentDocId;
  const isSpacePanningRef = useRef(isSpacePanning);
  isSpacePanningRef.current = isSpacePanning;

  // Handle Spacebar panning mode inside graph pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) {
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

  // Cytoscape initialization & re-render
  useEffect(() => {
    if (!containerRef.current) return;

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
      style: graphCytoscapeStyle(theme, clusterByFolder),
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
          ? (liveTarget as any)
              .connectedEdges()
              .filter((e: any) => Boolean(e.data("isCrossFolder"))).length
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
  }, [filteredData, theme, clusterByFolder]);

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

  const handleApplyZoomInput = useCallback(() => {
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
  }, [zoomInputValue, zoomPercent]);

  const handleResetFit = useCallback(() => {
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
  }, []);

  const executeFocus = useCallback((targetNode: any) => {
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
    const targetCrossCount = targetEdges.filter((e: any) =>
      Boolean(e.data("isCrossFolder")),
    ).length;
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
  }, []);

  const handleZoomIn = useCallback(() => {
    if (cyRef.current) {
      const cy = cyRef.current;
      const targetZoom = Math.min(5.0, cy.zoom() * 1.3);
      cy.zoom({
        level: targetZoom,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cyRef.current) {
      const cy = cyRef.current;
      const targetZoom = Math.max(0.1, cy.zoom() * 0.77);
      cy.zoom({
        level: targetZoom,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
    }
  }, []);

  return {
    /** The canvas container; the pane renders it and the init effect mounts into it. */
    containerRef,
    /** The live Cytoscape instance; handleFocusActive in the pane probes it. */
    cyRef,
    selectedNode,
    setSelectedNode,
    isSpacePanning,
    zoomPercent,
    zoomInputValue,
    setZoomInputValue,
    /**
     * The onSelectNode mirror. Kept a ref (not a plain prop) so the inspector's
     * jump button and the canvas dbl-tap always call the LATEST callback even
     * between renders — the original late-binding contract.
     */
    onSelectNodeRef,
    handleApplyZoomInput,
    handleResetFit,
    executeFocus,
    handleZoomIn,
    handleZoomOut,
  };
}
