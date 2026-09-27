import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { MindmapNode } from "../../core/types";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";
import type { Bounds } from "../../core/mindmapBounds";
import { planDrop, reparentNode } from "../../services/mindmapService";
import type { MindmapContextMenu } from "./useMindmapAnnotations";

type UseMindmapViewportParams = {
  /** The scrollable container, measured by every pointer coordinate conversion. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The on-screen SVG; the print path swaps its view box for the page. */
  svgRef: RefObject<SVGSVGElement | null>;
  /**
   * The pan & zoom transform, and its writer.
   *
   * Held by the view rather than by this hook, deliberately: `useMindmapTreeOps`
   * runs before this hook (the pan handlers need its callbacks and its layout)
   * and its `handleAddChild` positions the side question with the transform, so
   * the state has to exist above both. Threading it in is the only acyclic order.
   */
  transform: { x: number; y: number; scale: number };
  setTransform: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>;
  /** The laid-out map, framed by "fit to screen" and hit-tested by the marquee release. */
  layout: MindmapLayoutResult;
  /** The bounds anything framing the canvas uses — floating topics included. */
  frameBounds: Bounds;
  /** The tree; the drop bands skip the root, and a drop commits against it. */
  tree: MindmapNode;
  /** The tree writer a finished drop commits through, from `useMindmapTreeOps`. */
  applyTreeChange: (nextTree: MindmapNode) => void;
  /** The style writer the node-resize gesture streams new sizes through. */
  handleUpdateStyle: (
    nodeId: string,
    styles: { customWidth?: number; customHeight?: number },
  ) => void;
  /** Commits an open text edit; a click on blank canvas is the click away from it. */
  handleCommitEdit: () => void;
  /** While a node's text is being edited, blank-canvas mousedown commits it. */
  editingNodeId: string | null;
  /** The open context menu, dismissed by a wheel or a mousedown elsewhere. */
  contextMenu: MindmapContextMenu | null;
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenu | null>>;
  /** The open side question, dismissed by a mousedown on the control bar. */
  sideChooser: { parentId: string; x: number; y: number } | null;
  setSideChooser: Dispatch<SetStateAction<{ parentId: string; x: number; y: number } | null>>;
  /** The node selection; blank-canvas mousedown clears it. */
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
};

/**
 * The camera and the container-level gestures of the mindmap: the pan & zoom
 * transform's handlers, the wheel zoom, "fit to screen", the marquee
 * selection's press, the print view-box swap, and the container mouse trio.
 *
 * The trio — `handleMouseDown`/`handleMouseMove`/`handleMouseUp` — multiplexes
 * three gestures with early returns: the node-resize stream, the node
 * drag-and-drop hit-testing, and the pan. Splitting them would mean composing
 * handlers in the view, which changes which functions the container listens
 * with and in what order the branches run, so the whole trio lives here and the
 * domains it reaches in arrive as params. That is also why the drag and resize
 * states (`draggingNodeId`, `dragGhostPos`, `dropTargetId`, `dropPosition`,
 * `nodeDragStartRef`, `resizingNode`) live here rather than with the tree ops:
 * the trio is their only writer, and the view reads them back for the drag
 * ghost and the drop indicators.
 *
 * Extracted from MindmapView (batch 3, wave 2c of the decomposition). A verbatim
 * move: the blank-canvas guard list, the drop bands, the zoom clamps and the
 * print view-box restore are the contract, not implementation detail. The
 * marquee's press handler is here, but its window-listeners release effect
 * stays in the view — it reads `setSelectedRelation` from `useMindmapAnnotations`
 * through the late-bound closure documented there, and a hook that runs before
 * the annotations call cannot receive that setter without changing when the
 * listeners attach.
 *
 * The dep arrays are the originals, verbatim and in order, plus the identities
 * the bodies touch that now arrive as params — every one a stable React setter
 * or ref, so the additions change when a callback identity refreshes and
 * nothing else.
 */
export function useMindmapViewport({
  containerRef,
  svgRef,
  transform,
  setTransform,
  layout,
  frameBounds,
  tree,
  applyTreeChange,
  handleUpdateStyle,
  handleCommitEdit,
  editingNodeId,
  contextMenu,
  setContextMenu,
  sideChooser,
  setSideChooser,
  setSelectedNodeIds,
}: UseMindmapViewportParams) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startTransformX: 0, startTransformY: 0 });

  // Node manual resizing state
  const [resizingNode, setResizingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Drag-and-drop reparenting state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  /**
   * Where the dragged node would land relative to the node under the pointer.
   *
   * "before" and "after" slot it between that node's siblings; "child" makes it
   * a child, which is what dropping on the middle of a node has always meant.
   *
   * Before this, a drop could only ever append: reparentNode has taken a
   * targetIndex since it was written, and nothing ever passed one.
   */
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "child">("child");
  const nodeDragStartRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  /** Marquee selection, in canvas coordinates, while dragging on empty space. */
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  /**
   * Whether an event landed on bare canvas.
   *
   * The svg receives everything, including events from the nodes inside it, so
   * every canvas-level gesture has to ask this first. Without it a double-click
   * on a node would both edit that node and create a new one.
   */
  const isBlankCanvasTarget = useCallback((target: EventTarget | null): boolean => {
    const element = target as HTMLElement | SVGElement | null;
    if (!element || typeof element.closest !== "function") return true;
    return !(
      element.closest(".mindmap-node-interactive") ||
      element.closest(".mindmap-toolbar") ||
      element.closest(".mindmap-inline-edit-input") ||
      element.closest(".mindmap-context-menu")
    );
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left button only, and only on bare canvas: the pan drag starts on the
      // same surface, so anything looser would fight it.
      if (e.button !== 0 || !isBlankCanvasTarget(e.target)) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const x = (e.clientX - containerRect.left - transform.x) / transform.scale;
      const y = (e.clientY - containerRect.top - transform.y) / transform.scale;
      marqueeStartRef.current = { x, y };
      marqueeRectRef.current = { x1: x, y1: y, x2: x, y2: y };
      setMarquee(marqueeRectRef.current);
    },
    [isBlankCanvasTarget, transform.scale, transform.x, transform.y, containerRef],
  );

  // Fit to screen helper
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !layout) return;

    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    const { width: lWidth, height: lHeight, minX, minY } = frameBounds;

    if (lWidth === 0 || lHeight === 0) return;

    const scaleX = (cWidth - 140) / lWidth;
    const scaleY = (cHeight - 140) / lHeight;
    const newScale = Math.max(0.4, Math.min(1.15, Math.min(scaleX, scaleY)));

    const newX = (cWidth - lWidth * newScale) / 2 - minX * newScale;
    const newY = (cHeight - lHeight * newScale) / 2 - minY * newScale;

    setTransform({ x: Math.round(newX), y: Math.round(newY), scale: Number(newScale.toFixed(2)) });
    // The original array, plus `containerRef`, `frameBounds` and `setTransform` —
    // stable identities this hook receives as params (see header).
  }, [layout, containerRef, frameBounds, setTransform]);

  /**
   * Steps the zoom, keeping the centre of the viewport fixed.
   *
   * The wheel handler anchors on the cursor; from a keyboard there is no cursor
   * to anchor to, so the middle of the canvas is the equivalent choice.
   */
  const handleZoomStep = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const centreX = rect.width / 2;
      const centreY = rect.height / 2;

      setTransform((prev) => {
        const nextScale = Math.max(0.25, Math.min(2.5, Number((prev.scale * factor).toFixed(3))));
        const scaleRatio = nextScale / prev.scale;
        return {
          ...prev,
          scale: nextScale,
          x: centreX - (centreX - prev.x) * scaleRatio,
          y: centreY - (centreY - prev.y) * scaleRatio,
        };
      });
    },
    [containerRef, setTransform],
  );

  /**
   * Fits the whole map onto the printed page.
   *
   * On screen this is an infinite canvas, and what is visible is decided by the
   * reader's pan and zoom; a printed page has no reader, so the map has to be
   * fitted to the paper instead. The print stylesheet drops the pan and zoom
   * transform, but it cannot supply a view box, because that depends on where
   * the layout put everything — which is why this half is code and runs on the
   * print event the browser (and Electron's printToPDF) fires around printing.
   *
   * Whatever was there before is put back afterwards, including nothing: the
   * canvas normally has no view box at all, and leaving one behind would change
   * how the map is drawn until the next reload.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let restore: string | null = null;

    const handleBeforePrint = () => {
      restore = svg.getAttribute("viewBox");
      const { minX, minY, width, height } = frameBounds;
      svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    };

    const handleAfterPrint = () => {
      if (restore === null) svg.removeAttribute("viewBox");
      else svg.setAttribute("viewBox", restore);
      restore = null;
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      handleAfterPrint();
    };
    // The original array, plus `svgRef` (a stable ref passed in).
  }, [frameBounds, svgRef]);

  // Pan interaction handlers & blank canvas click deselect
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | SVGElement;
      if (
        target.closest(".mindmap-node-interactive") ||
        target.closest(".mindmap-inline-edit-input") ||
        target.closest(".mindmap-context-menu")
      ) {
        return;
      }
      // A click on the control bar: the menus close, and nothing else happens.
      //
      // The bar used to sit in the list above, which made a click on it not a click
      // anywhere — a panel stayed open over a map the reader had started using again, and
      // the only way to be rid of it was to click the canvas, which threw the selection
      // away too. Dismissing on the way in is what every other surface here already does.
      if (target.closest(".mindmap-toolbar")) {
        if (contextMenu) setContextMenu(null);
        if (sideChooser) setSideChooser(null);
        return;
      }
      // Clicking blank canvas background commits edit, closes menu, and cancels selection!
      if (editingNodeId) {
        handleCommitEdit();
      }
      if (contextMenu) {
        setContextMenu(null);
      }
      setSelectedNodeIds(new Set());

      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startTransformX: transform.x,
        startTransformY: transform.y,
      };
    },
    // The original array, plus the setters the body writes through (see header).
    [
      transform.x,
      transform.y,
      editingNodeId,
      contextMenu,
      sideChooser,
      handleCommitEdit,
      setContextMenu,
      setSideChooser,
      setSelectedNodeIds,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (resizingNode) {
        const dx = (e.clientX - resizingNode.startX) / transform.scale;
        const dy = (e.clientY - resizingNode.startY) / transform.scale;
        const newWidth = Math.max(60, Math.round(resizingNode.startWidth + dx));
        const newHeight = Math.max(30, Math.round(resizingNode.startHeight + dy));
        handleUpdateStyle(resizingNode.nodeId, {
          customWidth: newWidth,
          customHeight: newHeight,
        });
        return;
      }

      if (nodeDragStartRef.current) {
        const dx = e.clientX - nodeDragStartRef.current.startX;
        const dy = e.clientY - nodeDragStartRef.current.startY;
        if (!nodeDragStartRef.current.hasMoved && Math.hypot(dx, dy) > 8) {
          nodeDragStartRef.current.hasMoved = true;
          setDraggingNodeId(nodeDragStartRef.current.nodeId);
        }
        if (nodeDragStartRef.current.hasMoved) {
          setDragGhostPos({ x: e.clientX, y: e.clientY });

          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect && layout) {
            const canvasX = (e.clientX - containerRect.left - transform.x) / transform.scale;
            const canvasY = (e.clientY - containerRect.top - transform.y) / transform.scale;

            let targetFound: string | null = null;
            let position: "before" | "after" | "child" = "child";
            for (const node of layout.nodes) {
              if (node.id === nodeDragStartRef.current.nodeId) continue;
              if (
                canvasX >= node.x - 25 &&
                canvasX <= node.x + node.width + 25 &&
                canvasY >= node.y - 25 &&
                canvasY <= node.y + node.height + 25
              ) {
                targetFound = node.id;
                // The upper and lower fifths reorder among siblings; the middle
                // makes the node a child. The root is exempt from the bands —
                // it has no siblings to slot between.
                if (node.id !== tree.id) {
                  const topBand = node.y + node.height * 0.2;
                  const bottomBand = node.y + node.height * 0.8;
                  if (canvasY < topBand) position = "before";
                  else if (canvasY > bottomBand) position = "after";
                }
                break;
              }
            }
            setDropTargetId(targetFound);
            setDropPosition(position);
          }
          return;
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: Math.round(dragStartRef.current.startTransformX + dx),
        y: Math.round(dragStartRef.current.startTransformY + dy),
      }));
    },
    // tree.id is here because the drop bands are skipped for the root node.
    // `containerRef` is the original array's other addition — a stable ref
    // passed in (see header).
    [
      isDragging,
      resizingNode,
      transform.scale,
      transform.x,
      transform.y,
      layout,
      tree.id,
      handleUpdateStyle,
      containerRef,
      setTransform,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (resizingNode) {
      setResizingNode(null);
    }
    if (nodeDragStartRef.current) {
      if (nodeDragStartRef.current.hasMoved && draggingNodeId && dropTargetId) {
        // A before/after drop on the root or on one's own descendant is
        // meaningless, so planDrop returns null and the move is dropped rather
        // than silently becoming something else.
        const plan = planDrop(tree, draggingNodeId, dropTargetId, dropPosition);
        if (plan) {
          const nextTree = reparentNode(tree, draggingNodeId, plan.parentId, plan.index);
          if (nextTree !== tree) applyTreeChange(nextTree);
        }
      }
      nodeDragStartRef.current = null;
      setDraggingNodeId(null);
      setDropTargetId(null);
      setDropPosition("child");
      setDragGhostPos(null);
    }
    setIsDragging(false);
  }, [applyTreeChange, draggingNodeId, dropTargetId, dropPosition, resizingNode, tree]);

  // Wheel zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // A wheel that lands on an open menu belongs to the menu. The menus are tall — that is
      // why they scroll (`overflow-y: auto`, with `overscroll-behavior: contain` so they do
      // not drag the page with them) — but a wheel event still bubbles up to this container,
      // so scrolling a long menu also zoomed the map: the reader was trying to see the rest
      // of the menu and the map grew and shrank underneath it.
      //
      // Nothing here moves the map while a menu is up. A wheel outside one dismisses it, the
      // way a click outside does, and is spent doing that rather than zooming — one gesture,
      // one effect.
      const target = e.target as Element | null;
      if (target?.closest?.(".mindmap-context-menu")) return;
      // The control bar is chrome, not canvas: a wheel over it is someone trying to get
      // through the bar, and it used to zoom the map underneath instead. Nothing happens
      // now — which is also the second half of the fix that lets the bar wrap: the
      // right-hand controls are on screen rather than somewhere a wheel cannot reach.
      if (target?.closest?.(".mindmap-toolbar")) return;
      if (contextMenu) {
        setContextMenu(null);
        return;
      }

      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      setTransform((prev) => {
        const nextScale = Math.max(
          0.25,
          Math.min(2.5, Number((prev.scale * zoomFactor).toFixed(3))),
        );
        const scaleRatio = nextScale / prev.scale;
        const nextX = cursorX - (cursorX - prev.x) * scaleRatio;
        const nextY = cursorY - (cursorY - prev.y) * scaleRatio;
        return {
          x: Math.round(nextX),
          y: Math.round(nextY),
          scale: nextScale,
        };
      });
    },
    // The original array, plus `containerRef`, `setContextMenu` and `setTransform`
    // — stable identities this hook receives as params (see header).
    [contextMenu, containerRef, setContextMenu, setTransform],
  );

  return {
    // Pan & zoom surface state, read by the container's class and the wheel.
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleZoomStep,
    handleFitToScreen,
    // Canvas-level gesture predicates and the marquee press. The marquee's
    // window-listener release effect stays in the view (see header).
    isBlankCanvasTarget,
    handleCanvasMouseDown,
    marquee,
    setMarquee,
    marqueeStartRef,
    marqueeRectRef,
    // Node resize (written by the resize handle, streamed by the move handler).
    setResizingNode,
    // Node drag-and-drop, read by the ghost badge and the drop indicators.
    draggingNodeId,
    dragGhostPos,
    dropTargetId,
    dropPosition,
    nodeDragStartRef,
  };
}
