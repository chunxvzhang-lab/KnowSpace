import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CanvasData, CanvasNode, CanvasViewport } from "../../types/canvasTypes";
import {
  computeGridLayout,
  computeRingSpacingLayout,
  isPointInsideNodeHull,
  resizeGridSpacing,
  resizeRingSpacing,
  syncLoopEdgeGeometry,
} from "../../services/canvasService";
import {
  computeBoxSelectionEdgeHits,
  computeBoxSelectionHits,
  type CanvasSelectionBox,
} from "./useCanvasSelection";
import type { NodeDragState, ResizeDragState } from "./useCanvasNodeDrag";
import type { ConnectingState, StepBendDragState } from "./useCanvasConnect";
import type { CanvasContextMenuState } from "./CanvasOverlayMenus";

/**
 * Shared empty Map so the drag hot path never allocates a throwaway one when
 * nothing else moves alongside the dragged card.
 */
const EMPTY_DRAG_MAP = new Map<string, { id: string; startX: number; startY: number }>();

/**
 * The pointer system of the canvas: the single pair of global mousemove /
 * mouseup listeners that multiplexes every drag gesture — step-bend, group
 * drag, marquee, pan, node drag (grid/ring re-flow), resize, connect — with
 * rAF-throttled position refs for each, plus the card-body activation handler.
 *
 * Extracted from CanvasView (wave 2 of the CanvasView decomposition). The
 * gesture *starts* live in `useCanvasNodeDrag` and `useCanvasConnect` (the
 * pointer effect plus the drag-start cluster exceed the 999-line file cap
 * together); their state mirrors and rAF refs arrive here as params. The
 * marquee branch reads and writes the selection domain's refs and setters
 * from `useCanvasSelection`. The background-mousedown handler (pan /
 * box-select / hollow-middle group grab / presentation tap) moved here too
 * (final trim wave) — it arms exactly the drag refs this hook owns.
 */
type UseCanvasPointerParams = {
  /** The scrollable canvas container — every coordinate space below is relative to it. */
  containerRef: RefObject<HTMLDivElement | null>;
  // ── document ──────────────────────────────────────────────────────────────
  latestDataRef: RefObject<CanvasData>;
  setData: Dispatch<SetStateAction<CanvasData>>;
  pushHistory: (newData: CanvasData) => void;
  emitChange: (newData: CanvasData) => void;
  // ── viewport ──────────────────────────────────────────────────────────────
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;
  viewportRef: RefObject<CanvasViewport>;
  /** The wheel rAF id — cancelled on unmount alongside this hook's own rAFs. */
  rafWheelIdRef: RefObject<number | null>;
  // ── selection ─────────────────────────────────────────────────────────────
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEdgeIds: Dispatch<SetStateAction<Set<string>>>;
  hasDraggedRef: RefObject<boolean>;
  selectionBoxRef: RefObject<CanvasSelectionBox | null>;
  setSelectionBox: Dispatch<SetStateAction<CanvasSelectionBox | null>>;
  baseSelectionBeforeBoxRef: RefObject<Set<string>>;
  baseEdgeSelectionBeforeBoxRef: RefObject<Set<string>>;
  // ── node gestures (useCanvasNodeDrag) ─────────────────────────────────────
  nodeDragRef: RefObject<NodeDragState | null>;
  resizeDragRef: RefObject<ResizeDragState | null>;
  // ── connect / step-bend (useCanvasConnect) ────────────────────────────────
  connectingStateRef: RefObject<ConnectingState | null>;
  setConnectingState: Dispatch<SetStateAction<ConnectingState | null>>;
  rafConnectIdRef: RefObject<number | null>;
  latestConnectPosRef: RefObject<{ clientX: number; clientY: number } | null>;
  stepBendDragRef: RefObject<StepBendDragState | null>;
  // ── background mousedown (the handler moved here from CanvasView, final
  //    trim wave) ────────────────────────────────────────────────────────────
  /** Render-current viewport — seeds the pan / slide-drag start coordinates. */
  viewport: CanvasViewport;
  /** The press closes the context menu before anything else. */
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  /** A background press commits an open card edit first. */
  editingNodeIdRef: RefObject<string | null>;
  handleSaveNodeEdit: () => void;
  /** Presentation mode: the press also closes the slide drawer. */
  showSlideDrawer: boolean;
  setShowSlideDrawer: Dispatch<SetStateAction<boolean>>;
  /** Box-select mode (or a Shift/Ctrl/Cmd modifier) starts a marquee, not a pan. */
  isBoxSelectMode: boolean;
  handleStartBoxSelection: (e: React.MouseEvent | MouseEvent, isModifier: boolean) => void;
  /** The hollow-middle grab needs the live multi-selection. */
  selectedNodeIds: Set<string>;
  // ── misc ──────────────────────────────────────────────────────────────────
  /**
   * The big effect's mouseup reads `isPresentationMode` only through
   * `isPresentationModeAtMountRef` below, which is initialised once and never
   * refreshed — replicating the original contract exactly (the effect's
   * dependency list never re-subscribed, so its closure kept the first-render
   * value forever; see that ref for why). The returned background-mousedown
   * handler reads the live render value instead: it is a fresh per-render
   * closure, exactly like the inline CanvasView handler it moved from.
   */
  isPresentationMode: boolean;
};

export function useCanvasPointer({
  containerRef,
  latestDataRef,
  setData,
  pushHistory,
  emitChange,
  setViewport,
  viewportRef,
  rafWheelIdRef,
  setSelectedNodeIds,
  setSelectedEdgeIds,
  hasDraggedRef,
  selectionBoxRef,
  setSelectionBox,
  baseSelectionBeforeBoxRef,
  baseEdgeSelectionBeforeBoxRef,
  nodeDragRef,
  resizeDragRef,
  connectingStateRef,
  setConnectingState,
  rafConnectIdRef,
  latestConnectPosRef,
  stepBendDragRef,
  viewport,
  setContextMenu,
  editingNodeIdRef,
  handleSaveNodeEdit,
  showSlideDrawer,
  setShowSlideDrawer,
  isBoxSelectMode,
  handleStartBoxSelection,
  selectedNodeIds,
  isPresentationMode,
}: UseCanvasPointerParams) {
  // Dragging card or canvas refs
  const isDraggingCanvasRef = useRef(false);
  const canvasDragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    hasMoved?: boolean;
  }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
    hasMoved: false,
  });

  /**
   * Dragging the hollow middle of a multi-selection (the empty centre of a
   * ring or a grid) moves every selected card together, keeping their relative
   * spacing intact — the cards neither scatter nor drag the canvas behind them.
   */
  const groupDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startById: Map<string, { id: string; startX: number; startY: number }>;
  } | null>(null);
  const rafGroupDragIdRef = useRef<number | null>(null);
  const latestGroupDragPosRef = useRef<{ dx: number; dy: number } | null>(null);

  const rafDragIdRef = useRef<number | null>(null);
  const rafResizeIdRef = useRef<number | null>(null);
  const latestDragPosRef = useRef<{
    dx: number;
    dy: number;
    updatedId: string;
    startX: number;
    startY: number;
    containedMap: Map<string, { id: string; startX: number; startY: number }>;
    gridSpacing?: {
      layout: ReturnType<typeof computeGridLayout> & object;
      baseGapX: number;
      baseGapY: number;
      startById: Map<string, { id: string; startX: number; startY: number }>;
    };
    ringSpacing?: {
      layout: NonNullable<ReturnType<typeof computeRingSpacingLayout>>;
    };
  } | null>(null);
  const latestResizePosRef = useRef<{
    dw: number;
    dh: number;
    updatedId: string;
    startW: number;
    startH: number;
  } | null>(null);
  // High-frequency event rAF throttling & batching refs to achieve native high refresh rates (120Hz/144Hz+) with minimal CPU load
  const rafPanIdRef = useRef<number | null>(null);
  const latestPanPosRef = useRef<{ dx: number; dy: number } | null>(null);
  const rafBoxSelectIdRef = useRef<number | null>(null);
  const latestBoxSelectPosRef = useRef<{
    clientX: number;
    clientY: number;
    isModifier: boolean;
  } | null>(null);
  const rafStepBendIdRef = useRef<number | null>(null);
  const latestStepBendPosRef = useRef<{ edgeId: string; newOffset: number } | null>(null);

  /**
   * The big effect's mouseup reads `isPresentationMode` through this ref, which
   * is initialised once and never refreshed. That replicates the original
   * contract exactly: the effect's dependency list never re-subscribed, so its
   * closure kept the first-render value of the flag forever. Reading the live
   * flag instead would change WHEN the background mouseup clears the selection
   * during a presentation.
   */
  const isPresentationModeAtMountRef = useRef(isPresentationMode);

  // Background drag to pan or start box selection — moved verbatim from
  // CanvasView (final trim wave). A plain per-render function, exactly like
  // the inline handler it was: the root div rebinds it on every render, so it
  // always closes over the live viewport / selection / presentation values.
  const handleMouseDownBackground = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    setContextMenu(null);

    // If a card or group was being edited, commit edits
    if (editingNodeIdRef.current) {
      handleSaveNodeEdit();
    }

    if (isPresentationMode) {
      if (showSlideDrawer) setShowSlideDrawer(false);
      if (e.button === 0 || e.button === 1) {
        isDraggingCanvasRef.current = true;
        canvasDragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: viewport.panX,
          panY: viewport.panY,
          hasMoved: false,
        };
      }
      return;
    }

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    // If in box select mode or holding Shift/Ctrl/Cmd, start marquee box selection
    if (isBoxSelectMode || isModifier) {
      handleStartBoxSelection(e, isModifier);
      return;
    }

    // Clicking the hollow middle of a multi-selection — the empty centre of a
    // ring or a grid — grabs the whole group and moves it. Without this the
    // press would fall through to the pan below, dragging the canvas instead,
    // which is never what the user means right after arranging and selecting
    // those cards.
    if (e.button === 0 && selectedNodeIds.size >= 3 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const zoom = viewportRef.current.zoom;
      const canvasX = (e.clientX - rect.left - viewportRef.current.panX) / zoom;
      const canvasY = (e.clientY - rect.top - viewportRef.current.panY) / zoom;
      const selected = latestDataRef.current.nodes.filter(
        (n) => selectedNodeIds.has(n.id) && n.type !== "group",
      );

      if (isPointInsideNodeHull({ x: canvasX, y: canvasY }, selected)) {
        groupDragRef.current = {
          startClientX: e.clientX,
          startClientY: e.clientY,
          startById: new Map(selected.map((n) => [n.id, { id: n.id, startX: n.x, startY: n.y }])),
        };
        hasDraggedRef.current = false;
        e.preventDefault();
        return;
      }
    }

    // Normal pan: do not clear selection immediately; clear only on mouseup if canvas did not move
    isDraggingCanvasRef.current = true;
    canvasDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
      hasMoved: false,
    };
  };

  // Global mouse move and up listeners
  useEffect(() => {
    // Stable local binding for the wheel rAF ref: the object never changes, so
    // the cleanup below reading the alias is exactly equivalent to reading the
    // param ref directly (which the lint rule flags in cleanups).
    const wheelRafIdRef = rafWheelIdRef;
    const handleMouseMove = (e: MouseEvent) => {
      // Dragging step bend handle (rAF throttled)
      if (stepBendDragRef.current) {
        const { edgeId, startX, startY, initialOffset, orientation } = stepBendDragRef.current;
        const zoom = viewportRef.current.zoom;
        const delta =
          orientation === "horizontal" ? (e.clientX - startX) / zoom : (e.clientY - startY) / zoom;
        const newOffset = Math.round(initialOffset + delta);
        latestStepBendPosRef.current = { edgeId, newOffset };
        if (!rafStepBendIdRef.current) {
          rafStepBendIdRef.current = requestAnimationFrame(() => {
            rafStepBendIdRef.current = null;
            const bend = latestStepBendPosRef.current;
            if (!bend || !stepBendDragRef.current) return;
            setData((prev) => ({
              ...prev,
              edges: prev.edges.map((edge) =>
                edge.id === bend.edgeId ? { ...edge, stepOffset: bend.newOffset } : edge,
              ),
            }));
          });
        }
        return;
      }

      // 0. Group drag from the hollow middle of a multi-selection.
      // Every selected card moves by the same offset, so the arrangement keeps
      // its exact shape and spacing.
      if (groupDragRef.current) {
        const group = groupDragRef.current;
        const zoom = viewportRef.current.zoom;
        const dx = (e.clientX - group.startClientX) / zoom;
        const dy = (e.clientY - group.startClientY) / zoom;

        if (Math.hypot(e.clientX - group.startClientX, e.clientY - group.startClientY) > 3) {
          hasDraggedRef.current = true;
        }
        latestGroupDragPosRef.current = { dx, dy };

        if (!rafGroupDragIdRef.current) {
          rafGroupDragIdRef.current = requestAnimationFrame(() => {
            rafGroupDragIdRef.current = null;
            const pos = latestGroupDragPosRef.current;
            const active = groupDragRef.current;
            if (!pos || !active) return;

            setData((prev) => {
              const nextNodes = prev.nodes.map((n) => {
                const s = active.startById.get(n.id);
                return s
                  ? {
                      ...n,
                      x: Math.round(s.startX + pos.dx),
                      y: Math.round(s.startY + pos.dy),
                    }
                  : n;
              });
              const nextData = {
                ...prev,
                nodes: nextNodes,
                edges: syncLoopEdgeGeometry(nextNodes, prev.edges),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 0. Marquee Box Selection (rAF throttled to monitor refresh rate)
      if (selectionBoxRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const currentZoom = viewportRef.current.zoom;
        const currentPanX = viewportRef.current.panX;
        const currentPanY = viewportRef.current.panY;
        const mouseCanvasX = (e.clientX - rect.left - currentPanX) / currentZoom;
        const mouseCanvasY = (e.clientY - rect.top - currentPanY) / currentZoom;
        const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
        const updated = {
          ...selectionBoxRef.current,
          currentX: mouseCanvasX,
          currentY: mouseCanvasY,
        };
        selectionBoxRef.current = updated;
        latestBoxSelectPosRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          isModifier,
        };
        if (!rafBoxSelectIdRef.current) {
          rafBoxSelectIdRef.current = requestAnimationFrame(() => {
            rafBoxSelectIdRef.current = null;
            if (!selectionBoxRef.current || !containerRef.current) return;
            const currentBox = selectionBoxRef.current;
            setSelectionBox(currentBox);

            // Real-time selection calculation for live visual feedback
            const minX = Math.min(currentBox.startX, currentBox.currentX);
            const maxX = Math.max(currentBox.startX, currentBox.currentX);
            const minY = Math.min(currentBox.startY, currentBox.currentY);
            const maxY = Math.max(currentBox.startY, currentBox.currentY);

            if (maxX - minX > 4 || maxY - minY > 4) {
              const hitIds = computeBoxSelectionHits(
                minX,
                maxX,
                minY,
                maxY,
                latestDataRef.current.nodes,
              );
              setSelectedNodeIds(
                isModifier ? new Set([...baseSelectionBeforeBoxRef.current, ...hitIds]) : hitIds,
              );
              const currentNodesMap = new Map(latestDataRef.current.nodes.map((n) => [n.id, n]));
              const hitEdgeIds = computeBoxSelectionEdgeHits(
                minX,
                maxX,
                minY,
                maxY,
                latestDataRef.current.edges,
                currentNodesMap,
              );
              setSelectedEdgeIds(
                isModifier
                  ? new Set([...baseEdgeSelectionBeforeBoxRef.current, ...hitEdgeIds])
                  : hitEdgeIds,
              );
            } else {
              setSelectedNodeIds(baseSelectionBeforeBoxRef.current);
              setSelectedEdgeIds(baseEdgeSelectionBeforeBoxRef.current);
            }
          });
        }
        return;
      }

      // 1. Panning canvas (rAF throttled to prevent 1000Hz mouse drag re-render storms)
      if (isDraggingCanvasRef.current) {
        const dx = e.clientX - canvasDragStartRef.current.x;
        const dy = e.clientY - canvasDragStartRef.current.y;
        if (Math.hypot(dx, dy) > 4) {
          canvasDragStartRef.current.hasMoved = true;
        }
        latestPanPosRef.current = { dx, dy };
        if (!rafPanIdRef.current) {
          rafPanIdRef.current = requestAnimationFrame(() => {
            rafPanIdRef.current = null;
            const pos = latestPanPosRef.current;
            if (!pos || !isDraggingCanvasRef.current) return;
            setViewport((prev) => ({
              ...prev,
              panX: canvasDragStartRef.current.panX + pos.dx,
              panY: canvasDragStartRef.current.panY + pos.dy,
            }));
          });
        }
        return;
      }

      // 2. Dragging node (with multi-select collaborative dragging & group coordination)
      if (nodeDragRef.current) {
        const dragInfo = nodeDragRef.current;
        if (Math.hypot(e.clientX - dragInfo.mouseStartX, e.clientY - dragInfo.mouseStartY) > 3) {
          hasDraggedRef.current = true;
        }
        const currentZoom = viewportRef.current.zoom;
        const dx = (e.clientX - dragInfo.mouseStartX) / currentZoom;
        const dy = (e.clientY - dragInfo.mouseStartY) / currentZoom;
        const updatedId = dragInfo.nodeId;
        const startX = dragInfo.startNodeX;
        const startY = dragInfo.startNodeY;
        // Reuse the Maps built once at drag start. These used to be rebuilt on
        // every mousemove, which fires far more often than the frame rate.
        latestDragPosRef.current = {
          dx,
          dy,
          updatedId,
          startX,
          startY,
          containedMap: dragInfo.containedMap ?? EMPTY_DRAG_MAP,
          // The drag-start gridSpacing already carries a ready `startById` Map.
          gridSpacing: dragInfo.gridSpacing,
          ringSpacing: dragInfo.ringSpacing,
        };

        // Standard 60fps RAF throttling: update when frame is ready without dropping intermediate movement
        if (!rafDragIdRef.current) {
          rafDragIdRef.current = requestAnimationFrame(() => {
            rafDragIdRef.current = null;
            const pos = latestDragPosRef.current;
            if (!pos) return;
            setData((prev) => {
              // ── Grid spacing mode ──────────────────────────────────────
              // The dragged card follows the pointer while the remaining
              // cards re-flow around it with the new gutters.
              let workingNodes = prev.nodes;
              if (pos.gridSpacing) {
                const gs = pos.gridSpacing;
                const startPos = gs.startById.get(pos.updatedId);
                workingNodes = prev.nodes.map((n) =>
                  n.id === pos.updatedId && startPos
                    ? {
                        ...n,
                        x: Math.round(startPos.startX + pos.dx),
                        y: Math.round(startPos.startY + pos.dy),
                      }
                    : n,
                );
                workingNodes = resizeGridSpacing(
                  workingNodes,
                  gs.layout,
                  pos.updatedId,
                  pos.dx,
                  pos.dy,
                  gs.baseGapX,
                  gs.baseGapY,
                );
                const gridData = {
                  ...prev,
                  nodes: workingNodes,
                  // Keep loop metadata glued to the re-flowed cards
                  edges: syncLoopEdgeGeometry(workingNodes, prev.edges),
                };
                latestDataRef.current = gridData;
                return gridData;
              }

              // ── Ring spacing mode ──────────────────────────────────────
              // The dragged card follows the pointer; its distance from the
              // ring centre becomes the new radius, and every other card keeps
              // its seat while re-distributing around that circle.
              if (pos.ringSpacing) {
                const rs = pos.ringSpacing;
                const movedNodes = prev.nodes.map((n) =>
                  n.id === pos.updatedId
                    ? {
                        ...n,
                        x: Math.round(pos.startX + pos.dx),
                        y: Math.round(pos.startY + pos.dy),
                      }
                    : n,
                );
                const moved = movedNodes.find((n) => n.id === pos.updatedId);
                if (moved) {
                  const ringNodes = resizeRingSpacing(movedNodes, rs.layout, pos.updatedId, {
                    x: moved.x + moved.width / 2,
                    y: moved.y + moved.height / 2,
                  });
                  const ringData = {
                    ...prev,
                    nodes: ringNodes,
                    edges: syncLoopEdgeGeometry(ringNodes, prev.edges),
                  };
                  latestDataRef.current = ringData;
                  return ringData;
                }
              }

              const movedNodes = workingNodes.map((n) => {
                if (n.id === pos.updatedId) {
                  return {
                    ...n,
                    x: Math.round(pos.startX + pos.dx),
                    y: Math.round(pos.startY + pos.dy),
                  };
                }
                const contained = pos.containedMap.get(n.id);
                if (contained) {
                  return {
                    ...n,
                    x: Math.round(contained.startX + pos.dx),
                    y: Math.round(contained.startY + pos.dy),
                  };
                }
                return n;
              });

              const nextData = {
                ...prev,
                nodes: movedNodes,
                // Recompute ring/grid metadata against the new card positions
                // so a closed loop stays attached to its cards while dragged.
                edges: syncLoopEdgeGeometry(movedNodes, prev.edges),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 3. Resizing node
      if (resizeDragRef.current) {
        const resizeInfo = resizeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dw = (e.clientX - resizeInfo.mouseStartX) / currentZoom;
        const dh = (e.clientY - resizeInfo.mouseStartY) / currentZoom;
        const updatedId = resizeInfo.nodeId;
        const startW = resizeInfo.startW;
        const startH = resizeInfo.startH;

        latestResizePosRef.current = { dw, dh, updatedId, startW, startH };

        if (!rafResizeIdRef.current) {
          rafResizeIdRef.current = requestAnimationFrame(() => {
            rafResizeIdRef.current = null;
            const pos = latestResizePosRef.current;
            if (!pos) return;
            setData((prev) => {
              const nextData = {
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === pos.updatedId
                    ? {
                        ...n,
                        width: Math.max(180, Math.round(pos.startW + pos.dw)),
                        height: Math.max(100, Math.round(pos.startH + pos.dh)),
                      }
                    : n,
                ),
              };
              latestDataRef.current = nextData;
              return nextData;
            });
          });
        }
        return;
      }

      // 4. Connecting edge (rAF throttled)
      if (connectingStateRef.current && containerRef.current) {
        latestConnectPosRef.current = { clientX: e.clientX, clientY: e.clientY };
        if (!rafConnectIdRef.current) {
          rafConnectIdRef.current = requestAnimationFrame(() => {
            rafConnectIdRef.current = null;
            const pos = latestConnectPosRef.current;
            if (!pos || !connectingStateRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const currentZoom = viewportRef.current.zoom;
            const currentPanX = viewportRef.current.panX;
            const currentPanY = viewportRef.current.panY;
            const mouseCanvasX = (pos.clientX - rect.left - currentPanX) / currentZoom;
            const mouseCanvasY = (pos.clientY - rect.top - currentPanY) / currentZoom;
            setConnectingState((prev) =>
              prev ? { ...prev, currentX: mouseCanvasX, currentY: mouseCanvasY } : null,
            );
          });
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (rafDragIdRef.current) {
        cancelAnimationFrame(rafDragIdRef.current);
        rafDragIdRef.current = null;
      }
      if (rafResizeIdRef.current) {
        cancelAnimationFrame(rafResizeIdRef.current);
        rafResizeIdRef.current = null;
      }
      if (rafGroupDragIdRef.current) {
        cancelAnimationFrame(rafGroupDragIdRef.current);
        rafGroupDragIdRef.current = null;
      }
      if (rafPanIdRef.current) {
        cancelAnimationFrame(rafPanIdRef.current);
        rafPanIdRef.current = null;
      }
      if (rafBoxSelectIdRef.current) {
        cancelAnimationFrame(rafBoxSelectIdRef.current);
        rafBoxSelectIdRef.current = null;
      }
      if (rafConnectIdRef.current) {
        cancelAnimationFrame(rafConnectIdRef.current);
        rafConnectIdRef.current = null;
      }
      if (rafStepBendIdRef.current) {
        cancelAnimationFrame(rafStepBendIdRef.current);
        rafStepBendIdRef.current = null;
      }
      latestDragPosRef.current = null;
      latestResizePosRef.current = null;
      latestGroupDragPosRef.current = null;
      latestBoxSelectPosRef.current = null;
      latestConnectPosRef.current = null;

      // Complete a group drag from the hollow middle of a multi-selection.
      if (groupDragRef.current) {
        groupDragRef.current = null;
        if (hasDraggedRef.current) {
          pushHistory(latestDataRef.current);
        }
        // Either way the selection stays as it was: a background press used to
        // clear it, but inside the group that would drop the very selection
        // the user is working with.
        return;
      }

      // Complete step bend dragging
      if (stepBendDragRef.current) {
        const { edgeId, startX, startY, initialOffset, orientation } = stepBendDragRef.current;
        stepBendDragRef.current = null;
        const zoom = viewportRef.current.zoom;
        const delta =
          orientation === "horizontal" ? (e.clientX - startX) / zoom : (e.clientY - startY) / zoom;
        const newOffset =
          latestStepBendPosRef.current?.newOffset ?? Math.round(initialOffset + delta);
        const nextEdges = latestDataRef.current.edges.map((edge) =>
          edge.id === edgeId ? { ...edge, stepOffset: newOffset } : edge,
        );
        const nextData = { ...latestDataRef.current, edges: nextEdges };
        latestDataRef.current = nextData;
        setData(nextData);
        emitChange(nextData);
        if (newOffset !== initialOffset) {
          pushHistory(nextData);
        }
      }
      latestStepBendPosRef.current = null;

      // Complete box selection
      if (selectionBoxRef.current) {
        const box = selectionBoxRef.current;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const currentZoom = viewportRef.current.zoom;
          const currentPanX = viewportRef.current.panX;
          const currentPanY = viewportRef.current.panY;
          box.currentX = (e.clientX - rect.left - currentPanX) / currentZoom;
          box.currentY = (e.clientY - rect.top - currentPanY) / currentZoom;
        }
        selectionBoxRef.current = null;
        setSelectionBox(null);
        const minX = Math.min(box.startX, box.currentX);
        const maxX = Math.max(box.startX, box.currentX);
        const minY = Math.min(box.startY, box.currentY);
        const maxY = Math.max(box.startY, box.currentY);
        const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
        if (maxX - minX > 4 || maxY - minY > 4) {
          const hitIds = computeBoxSelectionHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.nodes,
          );
          setSelectedNodeIds(
            isModifier ? new Set([...baseSelectionBeforeBoxRef.current, ...hitIds]) : hitIds,
          );
          const currentNodesMap = new Map(latestDataRef.current.nodes.map((n) => [n.id, n]));
          const hitEdgeIds = computeBoxSelectionEdgeHits(
            minX,
            maxX,
            minY,
            maxY,
            latestDataRef.current.edges,
            currentNodesMap,
          );
          setSelectedEdgeIds(
            isModifier
              ? new Set([...baseEdgeSelectionBeforeBoxRef.current, ...hitEdgeIds])
              : hitEdgeIds,
          );
        } else {
          setSelectedNodeIds(baseSelectionBeforeBoxRef.current);
          setSelectedEdgeIds(baseEdgeSelectionBeforeBoxRef.current);
        }
      }

      if (isDraggingCanvasRef.current) {
        if (latestPanPosRef.current) {
          const pos = latestPanPosRef.current;
          setViewport((prev) => ({
            ...prev,
            panX: canvasDragStartRef.current.panX + pos.dx,
            panY: canvasDragStartRef.current.panY + pos.dy,
          }));
        }
        isDraggingCanvasRef.current = false;
        if (!canvasDragStartRef.current.hasMoved) {
          // Reads the mount-time presentation flag — see the ref above for why.
          if (!isPresentationModeAtMountRef.current) {
            setSelectedNodeIds(new Set());
            setSelectedEdgeIds(new Set());
          }
        }
      }
      latestPanPosRef.current = null;
      if (nodeDragRef.current) {
        const dragInfo = nodeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dx = (e.clientX - dragInfo.mouseStartX) / currentZoom;
        const dy = (e.clientY - dragInfo.mouseStartY) / currentZoom;

        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          const updatedId = dragInfo.nodeId;
          const startX = dragInfo.startNodeX;
          const startY = dragInfo.startNodeY;
          const containedMap = dragInfo.containedMap ?? EMPTY_DRAG_MAP;

          let finalNodes: CanvasNode[];
          if (dragInfo.ringSpacing) {
            // Ring spacing drag: settle the ring on the final radius
            const rs = dragInfo.ringSpacing;
            const movedNodes = latestDataRef.current.nodes.map((n) =>
              n.id === updatedId
                ? { ...n, x: Math.round(startX + dx), y: Math.round(startY + dy) }
                : n,
            );
            const moved = movedNodes.find((n) => n.id === updatedId);
            finalNodes = moved
              ? resizeRingSpacing(movedNodes, rs.layout, updatedId, {
                  x: moved.x + moved.width / 2,
                  y: moved.y + moved.height / 2,
                })
              : movedNodes;
          } else if (dragInfo.gridSpacing) {
            // Grid spacing drag: settle the grid on the final gutters
            const gs = dragInfo.gridSpacing;
            const startPos = gs.startPositions.find((p) => p.id === updatedId);
            const movedNodes = latestDataRef.current.nodes.map((n) =>
              n.id === updatedId && startPos
                ? {
                    ...n,
                    x: Math.round(startPos.startX + dx),
                    y: Math.round(startPos.startY + dy),
                  }
                : n,
            );
            finalNodes = resizeGridSpacing(
              movedNodes,
              gs.layout,
              updatedId,
              dx,
              dy,
              gs.baseGapX,
              gs.baseGapY,
            );
          } else {
            finalNodes = latestDataRef.current.nodes.map((n) => {
              if (n.id === updatedId) {
                return {
                  ...n,
                  x: Math.round(startX + dx),
                  y: Math.round(startY + dy),
                };
              }
              const contained = containedMap.get(n.id);
              if (contained) {
                return {
                  ...n,
                  x: Math.round(contained.startX + dx),
                  y: Math.round(contained.startY + dy),
                };
              }
              return n;
            });
          }

          // Re-sync straight/arc metadata with the settled layout so the
          // rendered frame matches where the cards ended up.
          const settledEdges = syncLoopEdgeGeometry(finalNodes, latestDataRef.current.edges);

          const finalData = {
            ...latestDataRef.current,
            nodes: finalNodes,
            edges: settledEdges,
          };
          latestDataRef.current = finalData;
          setData(finalData);
          emitChange(finalData);
          pushHistory(finalData);
        }

        nodeDragRef.current = null;
      }

      if (resizeDragRef.current) {
        const resizeInfo = resizeDragRef.current;
        const currentZoom = viewportRef.current.zoom;
        const dw = (e.clientX - resizeInfo.mouseStartX) / currentZoom;
        const dh = (e.clientY - resizeInfo.mouseStartY) / currentZoom;

        if (rafResizeIdRef.current) {
          cancelAnimationFrame(rafResizeIdRef.current);
          rafResizeIdRef.current = null;
        }

        if (Math.abs(dw) > 0 || Math.abs(dh) > 0) {
          const updatedId = resizeInfo.nodeId;
          const startW = resizeInfo.startW;
          const startH = resizeInfo.startH;
          const finalNodes = latestDataRef.current.nodes.map((n) => {
            if (n.id === updatedId) {
              return {
                ...n,
                width: Math.max(120, Math.round(startW + dw)),
                height: Math.max(60, Math.round(startH + dh)),
              };
            }
            return n;
          });
          const finalData = { ...latestDataRef.current, nodes: finalNodes };
          latestDataRef.current = finalData;
          setData(finalData);
          emitChange(finalData);
          pushHistory(finalData);
        } else {
          pushHistory(latestDataRef.current);
        }

        resizeDragRef.current = null;
      }
      // Unconditional: React bails out when the value is already null, and this
      // keeps `connectingState` out of the listener's dependency list so the
      // listeners are attached once instead of on every connection update.
      setConnectingState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (rafDragIdRef.current) cancelAnimationFrame(rafDragIdRef.current);
      if (rafResizeIdRef.current) cancelAnimationFrame(rafResizeIdRef.current);
      if (rafGroupDragIdRef.current) cancelAnimationFrame(rafGroupDragIdRef.current);
      if (rafPanIdRef.current) cancelAnimationFrame(rafPanIdRef.current);
      if (rafBoxSelectIdRef.current) cancelAnimationFrame(rafBoxSelectIdRef.current);
      if (rafConnectIdRef.current) cancelAnimationFrame(rafConnectIdRef.current);
      if (rafStepBendIdRef.current) cancelAnimationFrame(rafStepBendIdRef.current);
      if (wheelRafIdRef.current) cancelAnimationFrame(wheelRafIdRef.current);
    };
    // Every dependency below is referentially stable (refs, setState
    // functions, and the document hook's stable callbacks), so the listeners
    // attach exactly once — the same behaviour the original `[pushHistory]`
    // dependency list had.
  }, [
    pushHistory,
    emitChange,
    setData,
    latestDataRef,
    setViewport,
    viewportRef,
    containerRef,
    rafWheelIdRef,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    setSelectionBox,
    selectionBoxRef,
    baseSelectionBeforeBoxRef,
    baseEdgeSelectionBeforeBoxRef,
    hasDraggedRef,
    nodeDragRef,
    resizeDragRef,
    connectingStateRef,
    setConnectingState,
    rafConnectIdRef,
    latestConnectPosRef,
    stepBendDragRef,
  ]);

  return {
    /** Armed by the background mousedown below for pan / slide drags. */
    isDraggingCanvasRef,
    canvasDragStartRef,
    /** Armed by the background mousedown for a hollow-middle group drag. */
    groupDragRef,
    handleMouseDownBackground,
  };
}
