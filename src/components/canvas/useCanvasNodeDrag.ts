import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CanvasData, CanvasGroupNode, CanvasNode } from "../../types/canvasTypes";
import {
  computeGridLayout,
  computeRingSpacingLayout,
  isNodeInsideGroup,
} from "../../services/canvasService";

/**
 * Everything a node drag needs to remember between the mousedown that starts it
 * and the global mousemove/mouseup listeners that carry it out.
 */
export type NodeDragState = {
  nodeId: string;
  startNodeX: number;
  startNodeY: number;
  mouseStartX: number;
  mouseStartY: number;
  containedNodes?: Array<{ id: string; startX: number; startY: number }>;
  /**
   * Same data as `containedNodes`, pre-indexed once at drag start. Rebuilding
   * this Map on every mousemove (which can fire several hundred times per
   * second) allocated constantly for no benefit.
   */
  containedMap?: Map<string, { id: string; startX: number; startY: number }>;
  /**
   * When the selection forms a rectangular grid, dragging one of its cards
   * becomes an interactive spacing adjustment instead of a plain move.
   */
  gridSpacing?: {
    layout: ReturnType<typeof computeGridLayout> & object;
    baseGapX: number;
    baseGapY: number;
    startPositions: Array<{ id: string; startX: number; startY: number }>;
    /** Pre-indexed `startPositions`, built once per drag. */
    startById: Map<string, { id: string; startX: number; startY: number }>;
  };
  /**
   * When the selection already sits on a circle, dragging one of its cards
   * resizes the ring — and therefore the spacing between cards — instead of
   * translating it.
   */
  ringSpacing?: {
    layout: NonNullable<ReturnType<typeof computeRingSpacingLayout>>;
  };
};

/** What a resize handle drag remembers between mousedown and mouseup. */
export type ResizeDragState = {
  nodeId: string;
  startW: number;
  startH: number;
  mouseStartX: number;
  mouseStartY: number;
};

/**
 * The node-gesture starts of the canvas: what a mousedown on a card means
 * (plain drag, collaborative multi-drag, grid/ring re-flow, group scoop,
 * resize), written into the drag-state refs the global pointer listeners
 * (`useCanvasPointer`) consume.
 *
 * Extracted from CanvasView (wave 2 of the CanvasView decomposition). This
 * cluster lives apart from the pointer effect only because the effect plus
 * this cluster exceed the 999-line file cap together; the refs it owns are
 * returned and handed to `useCanvasPointer` unchanged.
 */
type UseCanvasNodeDragParams = {
  isPresentationMode: boolean;
  /** Render-current mirror of the board; drag start always reads live data. */
  latestDataRef: RefObject<CanvasData>;
  /** Any active card editor is committed before the drag moves a card. */
  editingNodeIdRef: RefObject<string | null>;
  handleSaveNodeEdit: () => void;
  setContextMenu: (menu: null) => void;
  /** While box-select mode is on, a card press starts a marquee instead. */
  isBoxSelectMode: boolean;
  handleStartBoxSelection: (e: React.MouseEvent | MouseEvent, isModifier: boolean) => void;
  /** Set once a press actually moves, so the click handler can ignore the click. */
  hasDraggedRef: RefObject<boolean>;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEdgeId: (id: string | null) => void;
};

export function useCanvasNodeDrag({
  isPresentationMode,
  latestDataRef,
  editingNodeIdRef,
  handleSaveNodeEdit,
  setContextMenu,
  isBoxSelectMode,
  handleStartBoxSelection,
  hasDraggedRef,
  selectedNodeIds,
  setSelectedNodeIds,
  setSelectedEdgeId,
}: UseCanvasNodeDragParams) {
  const nodeDragRef = useRef<NodeDragState | null>(null);

  const resizeDragRef = useRef<ResizeDragState | null>(null);

  // Track freshly created group IDs: these groups should NOT auto-scoop
  // existing cards on their first drag (user must deliberately move cards in)
  const freshGroupIdsRef = useRef<Set<string>>(new Set());

  // Node Dragging: when dragging nodes, move all selected nodes together
  const handleNodeDragStart = (e: React.MouseEvent, node: CanvasNode) => {
    if (isPresentationMode || e.button !== 0) return;

    // Do not initiate drag if user is clicking on interactive controls inside the card
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "BUTTON" ||
        target.tagName === "SELECT" ||
        target.tagName === "A" ||
        Boolean(target.closest("button")) ||
        Boolean(target.closest("input")) ||
        Boolean(target.closest("textarea")) ||
        Boolean(target.closest("select")) ||
        Boolean(target.closest("a")) ||
        Boolean(target.closest(".canvas-resize-handle")))
    ) {
      // The press belongs to the control, not to the canvas — and saying so is
      // what makes the control work. Without this stop the canvas root's own
      // mousedown handler would arm a pan, and the mouseup that follows would
      // clear the selection: a state update, which re-renders the card, which
      // rewrites the card's markdown, and a rewritten markdown is a brand-new
      // checkbox. The click that should have toggled it never lands, because
      // the element it was pressed on is no longer in the document.
      // The press belongs to the control, not to the canvas — and saying so is
      // what makes the control work. Without this stop the canvas root's own
      // mousedown handler would arm a pan, and the mouseup that follows would
      // clear the selection: a state update, which re-renders the card, which
      // rewrites the card's markdown, and a rewritten markdown is a brand-new
      // checkbox. The click that should have toggled it never lands, because
      // the element it was pressed on is no longer in the document.
      e.stopPropagation();
      return;
    }

    // Prevent default to disable native browser text selection and HTML5 drag ghost
    // which otherwise interrupts or completely suppresses window mousemove events
    e.preventDefault();
    e.stopPropagation();

    // Commit any active edits before moving so the card moves smoothly and text is persisted
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }
    setContextMenu(null);

    // Always fetch latest live node data from latestDataRef to prevent stale closures
    const liveNode = latestDataRef.current.nodes.find((n) => n.id === node.id) || node;

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const isGroupBodyClick = liveNode.type === "group" && !target?.closest(".canvas-group-header");

    // If in box select mode, or holding modifier over group background body, start box selection
    if (isBoxSelectMode || (isModifier && isGroupBodyClick)) {
      handleStartBoxSelection(e, isModifier);
      return;
    }

    hasDraggedRef.current = false;

    // If modifier key is held on a card or group header, toggle node into/out of selection
    if (isModifier) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(liveNode.id)) next.delete(liveNode.id);
        else next.add(liveNode.id);
        return next;
      });
      return;
    }

    // If clicking a node that is not in current selection, select it
    let currentSelected = selectedNodeIds;
    if (!selectedNodeIds.has(liveNode.id)) {
      currentSelected = new Set([liveNode.id]);
      setSelectedNodeIds(currentSelected);
    }
    setSelectedEdgeId(null);

    // If multiple nodes are selected, drag all of them collaboratively
    if (currentSelected.size > 1) {
      // Grid spacing mode: when the selection forms a complete rectangular
      // grid, dragging a card re-flows the whole grid and adjusts the gutters
      // live, instead of translating every card by the same offset.
      if (liveNode.type !== "group") {
        const selectedCards = latestDataRef.current.nodes.filter(
          (n) => currentSelected.has(n.id) && n.type !== "group",
        );
        const gridLayout = computeGridLayout(selectedCards);
        if (gridLayout) {
          const gridStartById = new Map(
            gridLayout.orderedIds.map((id) => {
              const n = latestDataRef.current.nodes.find((x) => x.id === id)!;
              return [id, { id, startX: n.x, startY: n.y }];
            }),
          );
          nodeDragRef.current = {
            nodeId: liveNode.id,
            startNodeX: liveNode.x,
            startNodeY: liveNode.y,
            mouseStartX: e.clientX,
            mouseStartY: e.clientY,
            containedNodes: [],
            containedMap: new Map(),
            gridSpacing: {
              layout: gridLayout,
              baseGapX: Math.max(4, gridLayout.gapX),
              baseGapY: Math.max(4, gridLayout.gapY),
              startPositions: [...gridStartById.values()],
              startById: gridStartById,
            },
          };
          return;
        }

        // Ring spacing mode: the cards already sit on a circle, so dragging one
        // of them resizes the ring — and with it the spacing between cards.
        // Checked after the grid on purpose: a rectangular arrangement also
        // satisfies the circle test (its corners are equidistant from the
        // centre), and the rectangular reading is the more specific one.
        const ringLayout = computeRingSpacingLayout(selectedCards);
        if (ringLayout) {
          nodeDragRef.current = {
            nodeId: liveNode.id,
            startNodeX: liveNode.x,
            startNodeY: liveNode.y,
            mouseStartX: e.clientX,
            mouseStartY: e.clientY,
            containedNodes: [],
            containedMap: new Map(),
            ringSpacing: { layout: ringLayout },
          };
          return;
        }
      }

      const selectedOthers = latestDataRef.current.nodes.filter(
        (n) => currentSelected.has(n.id) && n.id !== liveNode.id,
      );

      let containedCards: CanvasNode[] = [];
      if (liveNode.type === "group") {
        containedCards = latestDataRef.current.nodes.filter(
          (n) =>
            n.id !== liveNode.id &&
            !currentSelected.has(n.id) &&
            isNodeInsideGroup(n, liveNode as CanvasGroupNode),
        );
      }

      const allContained = [...selectedOthers, ...containedCards].map((c) => ({
        id: c.id,
        startX: c.x,
        startY: c.y,
      }));

      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: allContained,
        containedMap: new Map(allContained.map((c) => [c.id, c])),
      };
      return;
    }

    if (liveNode.type === "group") {
      const isFresh = freshGroupIdsRef.current.has(liveNode.id);
      const isAltOnly = e.altKey;
      const allGroups = latestDataRef.current.nodes.filter(
        (n): n is CanvasGroupNode => n.type === "group",
      );
      const thisIdx = latestDataRef.current.nodes.findIndex((x) => x.id === liveNode.id);

      // Cards inside this group that do NOT belong to an older existing container
      const contained =
        isFresh || isAltOnly
          ? []
          : latestDataRef.current.nodes.filter((n) => {
              if (n.id === liveNode.id || n.type === "group") return false;
              if (!isNodeInsideGroup(n, liveNode as CanvasGroupNode)) return false;

              // If card also lies inside another group, check if that group was established earlier
              const otherContainingGroups = allGroups.filter(
                (og) => og.id !== liveNode.id && isNodeInsideGroup(n, og),
              );
              if (otherContainingGroups.length > 0) {
                for (const og of otherContainingGroups) {
                  const otherIdx = latestDataRef.current.nodes.findIndex((x) => x.id === og.id);
                  if (otherIdx !== -1 && otherIdx < thisIdx) {
                    return false; // older container owns this card, don't drag it
                  }
                }
              }
              return true;
            });

      if (isFresh) freshGroupIdsRef.current.delete(liveNode.id);
      const groupContained = contained.map((c) => ({
        id: c.id,
        startX: c.x,
        startY: c.y,
      }));
      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: groupContained,
        containedMap: new Map(groupContained.map((c) => [c.id, c])),
      };
    } else {
      nodeDragRef.current = {
        nodeId: liveNode.id,
        startNodeX: liveNode.x,
        startNodeY: liveNode.y,
        mouseStartX: e.clientX,
        mouseStartY: e.clientY,
        containedNodes: [],
        containedMap: new Map(),
      };
    }
  };

  // Node Resizing
  const handleNodeResizeStart = (e: React.MouseEvent, node: CanvasNode) => {
    if (isPresentationMode || e.button !== 0) return;
    e.stopPropagation();
    resizeDragRef.current = {
      nodeId: node.id,
      startW: node.width,
      startH: node.height,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
  };

  return {
    nodeDragRef,
    resizeDragRef,
    /** Group IDs that must not auto-scoop cards on their first drag. */
    freshGroupIdsRef,
    handleNodeDragStart,
    handleNodeResizeStart,
  };
}
