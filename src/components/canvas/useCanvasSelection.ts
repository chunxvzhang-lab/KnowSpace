import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type {
  CanvasEdge,
  CanvasGroupNode,
  CanvasNode,
  CanvasViewport,
} from "../../types/canvasTypes";
import {
  computeEdgeMidpoint,
  getOptimalAnchorSides,
  getNodeAnchorPoint,
  isNodeInsideGroup,
} from "../../services/canvasService";
import { getEdgeRing } from "./canvasEdgeUtils";

/** The drag rectangle of an in-progress marquee, in canvas coordinates. */
export type CanvasSelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

/**
 * Calculates hit nodes intersecting with a marquee box.
 * If normal cards are hit inside a group container, returns only the cards,
 * preventing accidental selection of the background group container.
 */
export function computeBoxSelectionHits(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  nodes: CanvasNode[],
): Set<string> {
  const hitCardIds = new Set<string>();
  const hitGroupIds = new Set<string>();

  for (const node of nodes) {
    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    const intersects = node.x < maxX && nodeRight > minX && node.y < maxY && nodeBottom > minY;
    if (!intersects) continue;

    if (node.type === "group") {
      // For groups: only select if the box completely encloses the group or covers its title header
      const fullyEnclosed =
        minX <= node.x && maxX >= nodeRight && minY <= node.y && maxY >= nodeBottom;
      const headerIntersects =
        node.x < maxX && nodeRight > minX && node.y < maxY && node.y + 40 > minY;
      if (fullyEnclosed || headerIntersects) {
        hitGroupIds.add(node.id);
      }
    } else {
      hitCardIds.add(node.id);
    }
  }

  if (hitGroupIds.size > 0 && hitCardIds.size > 0) {
    const hitGroups = nodes.filter(
      (n): n is CanvasGroupNode => n.type === "group" && hitGroupIds.has(n.id),
    );
    const externalCardIds = new Set<string>();
    for (const cardId of hitCardIds) {
      const card = nodes.find((n) => n.id === cardId);
      if (card) {
        const isInsideHitGroup = hitGroups.some((g) => isNodeInsideGroup(card, g));
        if (!isInsideHitGroup) {
          externalCardIds.add(cardId);
        }
      }
    }
    // If there are cards outside the hit groups, select both the groups and external cards
    if (externalCardIds.size > 0) {
      return new Set<string>([...hitGroupIds, ...externalCardIds]);
    }
    // Otherwise all hit cards are inside the group: prefer selecting only the inner cards
    return hitCardIds;
  }

  if (hitCardIds.size > 0) {
    return hitCardIds;
  }
  return hitGroupIds;
}

/**
 * Calculates which edges are enclosed or intersected by the selection marquee box
 */
export function computeBoxSelectionEdgeHits(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  edges: CanvasEdge[],
  nodeMap: Map<string, CanvasNode>,
): Set<string> {
  const hitEdgeIds = new Set<string>();
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNode);
    const toNode = nodeMap.get(edge.toNode);
    if (!fromNode || !toNode) continue;
    const optSides = getOptimalAnchorSides(fromNode, toNode);
    const fromSide = edge.fromSide || optSides.fromSide;
    const toSide = edge.toSide || optSides.toSide;
    const p1 = getNodeAnchorPoint(fromNode, fromSide);
    const p2 = getNodeAnchorPoint(toNode, toSide);
    const mid = computeEdgeMidpoint(
      p1,
      fromSide,
      p2,
      toSide,
      edge.style,
      edge.stepOffset,
      getEdgeRing(edge),
    );
    if (mid.x >= minX && mid.x <= maxX && mid.y >= minY && mid.y <= maxY) {
      hitEdgeIds.add(edge.id);
    }
  }
  return hitEdgeIds;
}

/**
 * The selection domain of the canvas: multi-card / multi-edge selection state,
 * the marquee box-selection gesture state, and the marquee hit tests above.
 *
 * Extracted from CanvasView (wave 2 of the CanvasView decomposition); the
 * document domain lives in `useCanvasDocument`, the camera in
 * `useCanvasViewport`, and the pointer gestures in `useCanvasPointer` /
 * `useCanvasNodeDrag` / `useCanvasConnect`.
 */
type UseCanvasSelectionParams = {
  /**
   * The scrollable canvas container — the marquee starter converts the press
   * point from client space to canvas space through it.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The camera transform the marquee starter reads. */
  viewportRef: RefObject<CanvasViewport>;
  /** Board edges, read by the `connectedInternalEdges` memo. */
  edges: CanvasEdge[];
};

export function useCanvasSelection({ containerRef, viewportRef, edges }: UseCanvasSelectionParams) {
  // Multi-node selection & interaction state
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const selectedNodeId = useMemo(() => {
    const arr = Array.from(selectedNodeIds);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [selectedNodeIds]);
  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const selectedEdgeId = useMemo(() => {
    const arr = Array.from(selectedEdgeIds);
    return arr.length === 1 ? arr[0] : null;
  }, [selectedEdgeIds]);
  const setSelectedEdgeId = useCallback((id: string | null) => {
    setSelectedEdgeIds(id ? new Set([id]) : new Set());
  }, []);

  const connectedInternalEdges = useMemo(() => {
    if (selectedNodeIds.size < 2) return [];
    return edges.filter((e) => selectedNodeIds.has(e.fromNode) && selectedNodeIds.has(e.toNode));
  }, [edges, selectedNodeIds]);

  // Mouse marquee box selection
  const [isBoxSelectMode, setIsBoxSelectMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<CanvasSelectionBox | null>(null);
  const selectionBoxRef = useRef<CanvasSelectionBox | null>(null);
  const hasDraggedRef = useRef(false);
  const baseSelectionBeforeBoxRef = useRef<Set<string>>(new Set());
  const baseEdgeSelectionBeforeBoxRef = useRef<Set<string>>(new Set());

  // Marquee box selection starter
  const handleStartBoxSelection = useCallback(
    (e: React.MouseEvent | MouseEvent, isModifier: boolean) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentZoom = viewportRef.current.zoom;
      const currentPanX = viewportRef.current.panX;
      const currentPanY = viewportRef.current.panY;
      const mouseCanvasX = (e.clientX - rect.left - currentPanX) / currentZoom;
      const mouseCanvasY = (e.clientY - rect.top - currentPanY) / currentZoom;
      const newBox = {
        startX: mouseCanvasX,
        startY: mouseCanvasY,
        currentX: mouseCanvasX,
        currentY: mouseCanvasY,
      };
      selectionBoxRef.current = newBox;
      setSelectionBox(newBox);
      baseSelectionBeforeBoxRef.current = isModifier ? new Set(selectedNodeIds) : new Set();
      baseEdgeSelectionBeforeBoxRef.current = isModifier ? new Set(selectedEdgeIds) : new Set();
      if (!isModifier) {
        setSelectedNodeIds(new Set());
        setSelectedEdgeIds(new Set());
      }
    },
    [containerRef, viewportRef, selectedNodeIds, selectedEdgeIds],
  );

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeIds,
    setSelectedEdgeIds,
    selectedEdgeId,
    setSelectedEdgeId,
    /** Edges whose two endpoints are both inside the current node selection. */
    connectedInternalEdges,
    isBoxSelectMode,
    setIsBoxSelectMode,
    selectionBox,
    setSelectionBox,
    /** Render-current mirror of `selectionBox` for the global listeners. */
    selectionBoxRef,
    /** Set once a press actually moves, so the click handler can ignore the click. */
    hasDraggedRef,
    baseSelectionBeforeBoxRef,
    baseEdgeSelectionBeforeBoxRef,
    handleStartBoxSelection,
  };
}
