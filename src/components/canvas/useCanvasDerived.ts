import { useCallback, useMemo, type RefObject } from "react";
import type {
  CanvasData,
  CanvasEdge,
  CanvasNode,
  CanvasObstacle,
  CanvasViewport,
} from "../../types/canvasTypes";
import { computeBoundingBox, computeSourceDisplayColorMap } from "../../services/canvasService";
import type { ConnectingState } from "./useCanvasConnect";

/**
 * The derived geometry of the canvas: the pure read-side memos computed from
 * the board, the camera and the interaction state — the minimap's bounding
 * box and scale, the frustum-culling bounds and tests, the node/edge
 * relationship maps, the multi-selection root card, and the batch
 * colour-picker seeds.
 *
 * Extracted from CanvasView (wave 6 of the CanvasView decomposition) rather
 * than folded into `useCanvasViewport`: these memos read the selection,
 * editing, hover and connect state, which the camera hook cannot see without
 * reordering CanvasView's whole initialisation sequence. They are plain
 * render-time derivations, so the interaction state arrives here as values —
 * the memos are recomputed whenever those change, exactly as when they lived
 * in CanvasView.
 */
type UseCanvasDerivedParams = {
  /** The board. */
  data: CanvasData;
  /** The camera transform — the frustum bounds are derived from it. */
  viewport: CanvasViewport;
  /** The scrollable canvas container — sized into the frustum bounds. */
  containerRef: RefObject<HTMLDivElement | null>;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  /** The node being edited and the edge whose label is being edited. */
  editingNodeId: string | null;
  editingEdgeId: string | null;
  hoveredNodeId: string | null;
  /** An in-flight anchor-press connection, whose source card skips culling. */
  connectingState: ConnectingState | null;
};

export function useCanvasDerived({
  data,
  viewport,
  containerRef,
  selectedNodeIds,
  selectedEdgeIds,
  editingNodeId,
  editingEdgeId,
  hoveredNodeId,
  connectingState,
}: UseCanvasDerivedParams) {
  // Node lookups & relationship maps (nodeMap lives in CanvasView next to the
  // presentation hook, which consumes it).
  const canvasObstacles = useMemo<CanvasObstacle[]>(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      })),
    [data.nodes],
  );

  // Minimap bounding calculations - padded to ensure all nodes (including standalone & groups) are fully visible
  const minimapBBox = useMemo(() => {
    const box = computeBoundingBox(data.nodes);
    const padX = Math.max(60, box.width * 0.08);
    const padY = Math.max(60, box.height * 0.08);
    return {
      minX: box.minX - padX,
      minY: box.minY - padY,
      maxX: box.maxX + padX,
      maxY: box.maxY + padY,
      width: box.width + padX * 2,
      height: box.height + padY * 2,
    };
  }, [data.nodes]);

  const { minimapScale, minimapOffsetX, minimapOffsetY } = useMemo(() => {
    const targetW = 180;
    const targetH = 130;
    const pad = 10;
    const availW = targetW - pad * 2;
    const availH = targetH - pad * 2;
    const scaleX = availW / Math.max(100, minimapBBox.width);
    const scaleY = availH / Math.max(100, minimapBBox.height);
    const scale = Math.min(scaleX, scaleY, 0.4);

    const contentW = minimapBBox.width * scale;
    const contentH = minimapBBox.height * scale;
    const offsetX = (targetW - contentW) / 2;
    const offsetY = (targetH - contentH) / 2;

    return { minimapScale: scale, minimapOffsetX: offsetX, minimapOffsetY: offsetY };
  }, [minimapBBox]);

  // Node lookups & relationship maps
  const nodeOutgoingMap = useMemo(() => {
    const map = new Map<string, { count: number; color?: string; targets: string[] }>();
    for (const e of data.edges) {
      if (e.fromNode) {
        const item = map.get(e.fromNode) || { count: 0, color: e.color, targets: [] };
        item.count++;
        if (e.color) item.color = e.color;
        item.targets.push(e.toNode);
        map.set(e.fromNode, item);
      }
    }
    return map;
  }, [data.edges]);

  // Dynamic source-aware color mapping (shared with the SVG/PNG export
  // pipeline so that on-screen and exported colors stay perfectly in sync).
  const sourceDisplayColorMap = useMemo(
    () => computeSourceDisplayColorMap(data.nodes, data.edges),
    [data.nodes, data.edges],
  );

  const currentMultiRootNode = useMemo(() => {
    if (selectedNodeIds.size < 2) return undefined;
    const selectedNodes = data.nodes.filter((n) => selectedNodeIds.has(n.id));
    const firstSelectedId = Array.from(selectedNodeIds)[0];
    return (
      selectedNodes.find((n) => n.id === firstSelectedId) ||
      [...selectedNodes].sort((a, b) => (Math.abs(a.x - b.x) > 30 ? a.x - b.x : a.y - b.y))[0]
    );
  }, [selectedNodeIds, data.nodes]);

  const currentMultiRootTitle = useMemo(() => {
    if (!currentMultiRootNode) return "首选卡片";
    if (currentMultiRootNode.type === "text") {
      return (
        currentMultiRootNode.text
          .split("\n")[0]
          .replace(/^[#\s*->]+/, "")
          .slice(0, 8) || "卡片"
      );
    }
    if (currentMultiRootNode.type === "group") {
      return currentMultiRootNode.label || "分组";
    }
    if (currentMultiRootNode.type === "file") {
      return currentMultiRootNode.file || "笔记";
    }
    if (currentMultiRootNode.type === "link") {
      return currentMultiRootNode.url || "链接";
    }
    return "卡片";
  }, [currentMultiRootNode]);

  // Viewport frustum bounds for culling off-screen elements with a generous 600px buffer
  const viewportBounds = useMemo(() => {
    const width =
      containerRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 1920);
    const height =
      containerRef.current?.clientHeight ||
      (typeof window !== "undefined" ? window.innerHeight : 1080);
    const zoom = viewport.zoom;
    const buffer = 600 / zoom;
    return {
      minX: -viewport.panX / zoom - buffer,
      minY: -viewport.panY / zoom - buffer,
      maxX: (width - viewport.panX) / zoom + buffer,
      maxY: (height - viewport.panY) / zoom + buffer,
    };
    // `containerRef` reads the container element imperatively, exactly as when
    // this memo lived in CanvasView; the camera values are the reactive inputs.
  }, [viewport.panX, viewport.panY, viewport.zoom, containerRef]);

  const isNodeInViewport = useCallback(
    (node: CanvasNode): boolean => {
      if (selectedNodeIds.has(node.id)) return true;
      if (editingNodeId === node.id) return true;
      if (hoveredNodeId === node.id) return true;
      if (connectingState && connectingState.fromNodeId === node.id) return true;
      const nw = node.width || 300;
      const nh = node.height || 200;
      return !(
        node.x + nw < viewportBounds.minX ||
        node.x > viewportBounds.maxX ||
        node.y + nh < viewportBounds.minY ||
        node.y > viewportBounds.maxY
      );
    },
    [selectedNodeIds, editingNodeId, hoveredNodeId, connectingState, viewportBounds],
  );

  const isEdgeInViewport = useCallback(
    (edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): boolean => {
      if (selectedEdgeIds.has(edge.id)) return true;
      if (selectedNodeIds.has(edge.fromNode) || selectedNodeIds.has(edge.toNode)) return true;
      if (editingEdgeId === edge.id) return true;
      const minX = Math.min(fromNode.x, toNode.x);
      const maxX = Math.max(fromNode.x + (fromNode.width || 300), toNode.x + (toNode.width || 300));
      const minY = Math.min(fromNode.y, toNode.y);
      const maxY = Math.max(
        fromNode.y + (fromNode.height || 200),
        toNode.y + (toNode.height || 200),
      );
      return !(
        maxX < viewportBounds.minX ||
        minX > viewportBounds.maxX ||
        maxY < viewportBounds.minY ||
        minY > viewportBounds.maxY
      );
    },
    [selectedEdgeIds, selectedNodeIds, editingEdgeId, viewportBounds],
  );

  // Seed for the batch custom-colour picker: reuse a custom colour already set
  // on one of the selected cards, otherwise start from a neutral blue.
  const batchCustomColor = useMemo(() => {
    const withHex = data.nodes.find(
      (n) => selectedNodeIds.has(n.id) && typeof n.color === "string" && n.color.startsWith("#"),
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.nodes, selectedNodeIds]);

  // Same idea for the selection of edges.
  const batchEdgeCustomColor = useMemo(() => {
    const withHex = data.edges.find(
      (e) => selectedEdgeIds.has(e.id) && typeof e.color === "string" && e.color.startsWith("#"),
    );
    return (withHex?.color as string | undefined) ?? "#3b82f6";
  }, [data.edges, selectedEdgeIds]);

  return {
    canvasObstacles,
    minimapBBox,
    minimapScale,
    minimapOffsetX,
    minimapOffsetY,
    nodeOutgoingMap,
    sourceDisplayColorMap,
    currentMultiRootNode,
    currentMultiRootTitle,
    viewportBounds,
    isNodeInViewport,
    isEdgeInViewport,
    batchCustomColor,
    batchEdgeCustomColor,
  };
}
