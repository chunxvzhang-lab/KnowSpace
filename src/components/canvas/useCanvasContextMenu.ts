import {
  useCallback,
  useLayoutEffect,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CanvasData, CanvasEdge, CanvasNode, CanvasViewport } from "../../types/canvasTypes";
import type { CanvasContextMenuState } from "./CanvasOverlayMenus";

/**
 * The context-menu domain of the canvas: the right-click menu's positioning,
 * its dismissal paths and the three openers (canvas background, card, edge),
 * plus saving an edge-label edit started from the label layer.
 *
 * Extracted from CanvasView (wave 6 of the CanvasView decomposition). The
 * `contextMenu` state, its setter and `contextMenuRef` deliberately STAY in
 * CanvasView and arrive here as params: `useCanvasDocument`'s save path
 * consumes `setContextMenu`, and this hook's other dependencies (the viewport
 * ref, the selection and presentation state) only exist after the document
 * hook has run — owning the state here would make the initialisation order
 * circular. The align-menu flag also stays in CanvasView (two domains write
 * it); this hook only closes it on Escape via `setShowAlignMenu`.
 */
type UseCanvasContextMenuParams = {
  /** The open menu, if any — owned by CanvasView (see the header note). */
  contextMenu: CanvasContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  /** The rendered menu element, measured by the clamp effect below. */
  contextMenuRef: RefObject<HTMLDivElement | null>;
  /** The toolbar's align dropdown — closed alongside the menu on Escape. */
  setShowAlignMenu: Dispatch<SetStateAction<boolean>>;
  /** The scrollable canvas container — the click coordinates are relative to it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Render-current mirror of the viewport, for the canvas-space coordinates. */
  viewportRef: RefObject<CanvasViewport>;
  isPresentationMode: boolean;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedEdgeIds: Set<string>;
  setSelectedEdgeIds: Dispatch<SetStateAction<Set<string>>>;
  /** The board snapshot `handleSaveEdgeLabel` writes the label through. */
  latestDataRef: RefObject<CanvasData>;
  pushHistory: (newData: CanvasData) => void;
  /** The edge-label editor's target and draft — owned by CanvasView. */
  editingEdgeId: string | null;
  editingEdgeLabel: string;
  setEditingEdgeId: (id: string | null) => void;
};

export function useCanvasContextMenu({
  contextMenu,
  setContextMenu,
  contextMenuRef,
  setShowAlignMenu,
  containerRef,
  viewportRef,
  isPresentationMode,
  selectedNodeIds,
  setSelectedNodeIds,
  selectedEdgeIds,
  setSelectedEdgeIds,
  latestDataRef,
  pushHistory,
  editingEdgeId,
  editingEdgeLabel,
  setEditingEdgeId,
}: UseCanvasContextMenuParams) {
  // Dynamically clamp context menu position against the actual viewport so
  // the menu never spills off-screen, even when the canvas is nested in a
  // narrow layout (e.g. dual-document workspace).
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menuEl = contextMenuRef.current;

    const padding = 12;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;

    // Constrain maximum height to viewport so content can always be reached
    menuEl.style.maxHeight = `${Math.max(160, viewportH - padding * 2)}px`;

    // Measure actual rendered dimensions
    const menuW = menuEl.offsetWidth || 260;
    const menuH = menuEl.offsetHeight || 320;

    let clampedX = contextMenu.x;
    let clampedY = contextMenu.y;

    // Clamp horizontally within the viewport
    if (clampedX + menuW > viewportW - padding) {
      clampedX = Math.max(padding, viewportW - menuW - padding);
    }
    if (clampedX < padding) {
      clampedX = padding;
    }

    // Clamp vertically: if overflowing bottom, flip upward (preferred over
    // compressing the menu) so the user can always see the option closest to
    // the cursor.
    if (clampedY + menuH > viewportH - padding) {
      const flippedY = contextMenu.y - menuH;
      clampedY = Math.max(padding, flippedY < padding ? padding : flippedY);
    }
    if (clampedY < padding) {
      clampedY = padding;
    }

    menuEl.style.left = `${clampedX}px`;
    menuEl.style.top = `${clampedY}px`;
  }, [contextMenu, contextMenuRef]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setShowAlignMenu(false);
      }
    };
    const handleResize = () => setContextMenu(null);
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [contextMenu, contextMenuRef, setContextMenu, setShowAlignMenu]);

  const handleContextMenuCanvas = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      setContextMenu({
        // Use viewport-absolute coordinates so the portal-rendered menu can use
        // position: fixed and never be clipped by ancestor `overflow: hidden`.
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
      });
    },
    [containerRef, isPresentationMode, setContextMenu, viewportRef],
  );

  const handleContextMenuNode = useCallback(
    (e: React.MouseEvent, node: CanvasNode) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      if (!selectedNodeIds.has(node.id)) {
        setSelectedNodeIds(new Set([node.id]));
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
        targetNodeId: node.id,
      });
    },
    [
      containerRef,
      isPresentationMode,
      selectedNodeIds,
      setContextMenu,
      setSelectedNodeIds,
      viewportRef,
    ],
  );

  const handleContextMenuEdge = useCallback(
    (e: React.MouseEvent, edge: CanvasEdge) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPresentationMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      if (selectedEdgeIds.has(edge.id) && selectedEdgeIds.size > 1) {
        // keep multiple selection
      } else {
        setSelectedEdgeIds(new Set([edge.id]));
      }
      setSelectedNodeIds(new Set());

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        canvasX,
        canvasY,
        targetEdgeId: edge.id,
      });
    },
    [
      containerRef,
      isPresentationMode,
      selectedEdgeIds,
      setContextMenu,
      setSelectedEdgeIds,
      setSelectedNodeIds,
      viewportRef,
    ],
  );

  const handleSaveEdgeLabel = useCallback(() => {
    if (!editingEdgeId) return;
    const currentData = latestDataRef.current;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        e.id === editingEdgeId ? { ...e, label: editingEdgeLabel.trim() || undefined } : e,
      ),
    });
    setEditingEdgeId(null);
  }, [editingEdgeId, editingEdgeLabel, latestDataRef, pushHistory, setEditingEdgeId]);

  return {
    handleContextMenuCanvas,
    handleContextMenuNode,
    handleContextMenuEdge,
    handleSaveEdgeLabel,
  };
}
