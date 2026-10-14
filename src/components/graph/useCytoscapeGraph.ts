import { useCallback, useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { ThemeMode } from "../../core/types";
import {
  computeOrganicGraphPositions,
  toCytoscapeElements,
  type GraphData,
} from "../../services/graphService";
import { fitViewportToPositions } from "../../services/graphLayout";
import { graphCytoscapeStyle } from "./graphCytoscapeStyle";

/**
 * Above this many elements the viewport stops drawing edges while the user pans
 * or zooms.
 *
 * Below it the skip is a visible flicker with nothing to pay for it: a small
 * graph repaints well inside a frame, so the edges are not what is costing
 * anything. The threshold is on total elements (nodes + edges) because that is
 * what the per-frame draw loop walks.
 */
const HIDE_EDGES_ELEMENT_THRESHOLD = 900;

/**
 * Frames the graph by reading each node's stored position and computing the
 * viewport arithmetically.
 *
 * The alternative — `cy.fit()` — is the expensive call this file exists to
 * avoid: it walks every element and measures its rendered extent, label text
 * included, then does it again internally. Node positions, by contrast, are
 * already on the elements (`n.position()` returns a stored value, it does not
 * measure), so this is a walk plus a min/max.
 *
 * Returns true when it set a viewport. A graph with no nodes, or a container
 * that has not been laid out yet (zero width — the flex split pane reports that
 * on the first frame), yields false so the caller can leave the viewport alone.
 */
function fitToNodePositions(cy: Core, padding = 36): boolean {
  const positions: { x: number; y: number }[] = [];
  cy.nodes().forEach((node) => {
    const p = node.position();
    if (p) positions.push(p);
  });

  const fitted = fitViewportToPositions(positions, cy.width(), cy.height(), {
    padding,
    minZoom: cy.minZoom(),
    maxZoom: cy.maxZoom(),
  });
  if (!fitted) return false;
  cy.viewport(fitted);
  return true;
}

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
  /** The filtered dataset; drives the in-place element update. */
  filteredData: GraphData;
  /** Visual theme; feeds the stylesheet palette. */
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
 * lifecycle: the container/instance refs, the creation effect, the event
 * wiring, the deferred fit, the ResizeObserver re-fit, the destroy cleanup, the
 * current-document highlight effect, the Space-pan mode, and the zoom/focus
 * handlers.
 *
 * ── The instance is created once and updated in place (2026-10-14) ───────────
 *
 * This hook used to rebuild the whole Cytoscape instance on every change of
 * `filteredData`, which meant every filter click, every search keystroke and
 * every background-index chunk: destroy the canvas, re-create it, re-add every
 * element, re-run the layout. Measured in the real built app at ~1,100 nodes
 * (`e2e-attribution` / `e2e-rebuild-vs-update` probes, this machine):
 *
 *     filter click, end to end                      ~1,200 ms
 *       of which destroy + re-create instance         ~485 ms
 *       of which the whole pipeline (filter+layout
 *       +element building)                           ~150 ms
 *     same element swap on a surviving instance        ~16 ms
 *
 * The canvas-tag count confirmed the mechanism: each filter toggle produced
 * three brand-new canvas elements, i.e. a full teardown every time.
 *
 * So creation is now split from data updates. The instance is built once per
 * (container, theme, clusterByFolder) and the data effect calls `cy.json({
 * elements })` inside a batch — ~16 ms at 1,100 nodes instead of ~485 ms, and
 * no canvas churn. Positions are re-applied explicitly because `preset`
 * positions are a layout-time input, not part of the element payload.
 *
 * Two consequences worth stating:
 *   - `hideEdgesOnViewport` is read by Cytoscape only at construction, and the
 *     instance no longer gets rebuilt, so the viewport edge-skip is driven by
 *     the `pan`/`zoom` events instead (see below). Same effect, and it can
 *     react to the element count changing.
 *   - Anything that used to be "reset for free" by re-creation (highlight
 *     classes, the selected node, the zoom label) must be handled explicitly on
 *     a data swap, which the update effect does.
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

  /**
   * Whether the data currently on the canvas is large enough to justify
   * skipping edge draws while the viewport moves.
   *
   * A ref, not state: the pan/zoom handlers read it on every frame and must not
   * cause a render.
   */
  const skipEdgesOnViewportRef = useRef(false);

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

  /**
   * Creates the instance.
   *
   * Depends on nothing but the container: the theme and the cluster flag both
   * reach the graph through the stylesheet, and the stylesheet is applied by
   * the effect below — `cy.style(stylesheet)` is a supported runtime call, so a
   * theme switch is a style swap rather than a teardown. Creating the instance
   * with an empty element set is deliberate: it keeps "the canvas exists" and
   * "the canvas shows this data and this palette" as separate concerns, which
   * is what makes both the data path and the theme path cheap.
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
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

    /**
     * The viewport edge-skip, driven by events rather than by the constructor
     * option.
     *
     * Cytoscape reads `hideEdgesOnViewport` once, at construction, and this hook
     * no longer reconstructs the instance on data changes — so a constructor
     * option could never react to the graph growing past the threshold. Hiding
     * the edges for the duration of the gesture and restoring them at the end is
     * the same trade the option makes, expressed with public API: during a
     * gesture the edges are `display: none`, which removes them from the draw
     * loop, and they come back in one batch when it ends.
     *
     * The skip is gated on REAL user input, not on the `pan`/`zoom` events
     * alone. Those events fire for programmatic viewport changes too — this hook
     * itself calls `cy.fit()` and `cy.zoom()` on every data swap — so an
     * event-only trigger would hide and re-show every edge around each of those
     * calls: a full style batch over ~3,000 edges to produce no visible change,
     * on the very path the data swap is trying to keep cheap. The flag is set by
     * a wheel event or a pointer press on the canvas and cleared when the
     * gesture ends, which is exactly the "user is manipulating the viewport"
     * condition Cytoscape's own `vpManip` expresses internally.
     */
    let userGesture = false;
    let edgesHidden = false;

    const hideEdgesForGesture = () => {
      if (edgesHidden || !userGesture || !skipEdgesOnViewportRef.current) return;
      edgesHidden = true;
      cy.batch(() => {
        cy.edges().style("display", "none");
      });
    };
    const showEdgesAfterGesture = () => {
      if (!edgesHidden) return;
      edgesHidden = false;
      cy.batch(() => {
        cy.edges().removeStyle("display");
      });
    };

    const container = containerRef.current;
    const onWheel = () => {
      userGesture = true;
    };
    const onPointerDown = () => {
      userGesture = true;
    };
    const onGestureEnd = () => {
      userGesture = false;
      showEdgesAfterGesture();
    };

    // `passive` because these only set a flag — nothing here calls
    // preventDefault, and a non-passive wheel listener on the canvas would
    // force the browser to wait for it before scrolling.
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("pointerup", onGestureEnd, { passive: true });
    container.addEventListener("pointercancel", onGestureEnd, { passive: true });
    container.addEventListener("pointerleave", onGestureEnd, { passive: true });

    cy.on("pan", hideEdgesForGesture);
    cy.on("zoom", hideEdgesForGesture);
    cy.on("panend", showEdgesAfterGesture);
    cy.on("zoomend", showEdgesAfterGesture);

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
      fitToNodePositions(cyRef.current, 36);
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
          fitToNodePositions(cyRef.current, 36);
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
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onGestureEnd);
      container.removeEventListener("pointercancel", onGestureEnd);
      container.removeEventListener("pointerleave", onGestureEnd);
      clearTimeout(initTimerId);
      if (ro) {
        ro.disconnect();
      }
      cy.destroy();
      cyRef.current = null;
    };
    // Created once. The data, the palette and the edge-skip threshold are all
    // applied by the effects below — a filter change is a ~16ms element swap
    // instead of a ~485ms teardown, and a theme switch is a stylesheet swap
    // instead of a teardown. Intentionally no dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- instance lifetime is the container's, not the props'
  }, []);

  /**
   * Re-applies the stylesheet when the theme or the cluster flag changes.
   *
   * `cy.style()` is a documented runtime setter, so the palette can change
   * without re-creating the instance. This is what makes the theme path cheap;
   * before, a new theme meant a new instance and therefore a new canvas.
   *
   * The constructor already installed this exact stylesheet, so the effect skips
   * its first run. Re-applying an identical stylesheet is not free — it is a
   * full style recalculation over every element, which at ~4,400 elements is
   * tens of milliseconds spent on mount producing no visual change, and mount is
   * exactly when the layout and the element fill are also running.
   */
  const appliedStyleKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const key = `${theme}|${clusterByFolder}`;
    // The constructor applied this key; the first effect run has nothing to do.
    if (appliedStyleKeyRef.current === null) {
      appliedStyleKeyRef.current = key;
      return;
    }
    if (appliedStyleKeyRef.current === key) return;

    appliedStyleKeyRef.current = key;
    cy.style(graphCytoscapeStyle(theme, clusterByFolder) as any);
  }, [theme, clusterByFolder]);

  /**
   * Applies the dataset to the existing instance.
   *
   * This is the replacement for "destroy and re-create": one batched element
   * swap plus the positions. The reset of the derived view state (highlight
   * classes, the selected-node card, the zoom readout) is explicit here because
   * a rebuilt instance used to provide it for free.
   */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const positions = computeOrganicGraphPositions(filteredData);
    const elements = toCytoscapeElements(filteredData);

    // The edge-skip threshold tracks the current payload, which can change
    // without the instance being re-created.
    skipEdgesOnViewportRef.current = elements.length > HIDE_EDGES_ELEMENT_THRESHOLD;

    cy.batch(() => {
      cy.json({ elements });
      cy.nodes().forEach((node) => {
        const p = positions.get(node.data("id"));
        if (p) node.position(p);
      });
    });

    // A rebuilt instance used to drop the old selection and highlight classes.
    // The elements are gone either way, but `selectedNode` is React state and
    // would otherwise describe a node that no longer exists.
    setSelectedNode(null);

    // The current-document highlight has to be re-applied: the classes were on
    // elements that no longer exist.
    const target = findCurrentNode(cy, currentDocIdRef.current);
    if (target && target.length > 0) {
      cy.batch(() => {
        cy.elements().removeClass("highlighted dimmed");
        const neighborhood = target.neighborhood().add(target);
        neighborhood.addClass("highlighted");
        cy.elements().difference(neighborhood).addClass("dimmed");
      });
    }

    // Fit the new payload into the viewport.
    cy.resize();

    /**
     * The fit is computed from the positions this effect already has, not from
     * `cy.fit()`.
     *
     * `cy.fit()` was the single most expensive call in this path: instrumented
     * in the real app at ~1,100 nodes it cost ~620ms of a ~900ms long task, of
     * which `elements().boundingBox()` was ~180ms and the rest was fit's own
     * second bounding-box walk plus the redraw it triggers. The bounding box is
     * what is slow — it walks every element and measures each one's rendered
     * extent, including its label text.
     *
     * `fitViewportToPositions` does the same framing as pure arithmetic over
     * positions that are already in hand. See its doc comment.
     */
    const fitted = fitViewportToPositions(positions.values(), cy.width(), cy.height(), {
      padding: 36,
      minZoom: cy.minZoom(),
      maxZoom: cy.maxZoom(),
    });
    if (fitted) cy.viewport(fitted);

    if (cy.zoom() > 1.05) {
      cy.zoom(1.0);
      const live = findCurrentNode(cy, currentDocIdRef.current);
      if (live && live.length > 0) {
        cy.center(live);
      } else {
        cy.center();
      }
    }

    const z = Math.round(cy.zoom() * 100);
    setZoomPercent(z);
    setZoomInputValue(`${z}%`);
  }, [filteredData]);

  // Lightweight effect: update node highlight/data when active document changes
  // This runs WITHOUT touching the element set — no more vertical-line flicker on nav
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
      fitToNodePositions(cyRef.current, 36);
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
    /** The canvas container; the pane renders it and the creation effect mounts into it. */
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
