import { useCallback, useRef, useState, type RefObject } from "react";
import type { CanvasNode, CanvasViewport } from "../../types/canvasTypes";
import { computeBoundingBox } from "../../services/canvasService";
import { wheelBelongsToInnerScroller } from "../../services/wheelScrollGuard";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;

/**
 * The camera domain of the canvas: the viewport transform, the wheel/zoom
 * gestures that move it, and minimap recentring.
 *
 * Extracted from CanvasView (wave 1 of the CanvasView decomposition); the
 * document/history domain lives in `useCanvasDocument`.
 */
type UseCanvasViewportParams = {
  /**
   * The scrollable canvas container — the coordinate space every camera
   * computation below is relative to. Owned by CanvasView.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Board nodes, read by zoom-to-fit to compute the bounding box. */
  nodes: CanvasNode[];
};

export function useCanvasViewport({ containerRef, nodes }: UseCanvasViewportParams) {
  // Viewport transformation
  const [viewport, setViewport] = useState<CanvasViewport>({
    panX: 80,
    panY: 80,
    zoom: 1.0,
  });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Wheel-event rAF throttling & batching refs to achieve native high refresh
  // rates (120Hz/144Hz+) with minimal CPU load
  const rafWheelIdRef = useRef<number | null>(null);
  const wheelAccumulatorRef = useRef<{
    deltaX: number;
    deltaY: number;
    zoomEvents: Array<{ factor: number; clientX: number; clientY: number }>;
  }>({ deltaX: 0, deltaY: 0, zoomEvents: [] });

  // Viewport Zooming
  const handleZoom = useCallback(
    (deltaZoom: number, clientX?: number, clientY?: number) => {
      setViewport((prev) => {
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * deltaZoom));
        if (!containerRef.current || clientX === undefined || clientY === undefined) {
          return { ...prev, zoom: newZoom };
        }
        const rect = containerRef.current.getBoundingClientRect();
        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;
        const factor = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          panX: cursorX - (cursorX - prev.panX) * factor,
          panY: cursorY - (cursorY - prev.panY) * factor,
        };
      });
    },
    [containerRef],
  );

  // Zoom to fit bounding box
  const handleZoomToFit = useCallback(() => {
    if (nodes.length === 0) {
      setViewport({ panX: 100, panY: 100, zoom: 1.0 });
      return;
    }
    const bbox = computeBoundingBox(nodes);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / bbox.width;
    const scaleY = (rect.height - padding * 2) / bbox.height;
    const fitZoom = Math.min(1.2, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
    const centerX = bbox.minX + bbox.width / 2;
    const centerY = bbox.minY + bbox.height / 2;
    setViewport({
      zoom: fitZoom,
      panX: rect.width / 2 - centerX * fitZoom,
      panY: rect.height / 2 - centerY * fitZoom,
    });
  }, [nodes, containerRef]);

  /**
   * Recentres the board on a point picked from the minimap.
   *
   * The minimap reports canvas-space coordinates and the viewport lives here,
   * so the camera maths stays with the rest of the viewport handlers.
   */
  const handleMinimapNavigate = useCallback(
    (canvasX: number, canvasY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const viewW = el.clientWidth;
      const viewH = el.clientHeight;
      setViewport((prev) => ({
        ...prev,
        panX: viewW / 2 - canvasX * prev.zoom,
        panY: viewH / 2 - canvasY * prev.zoom,
      }));
    },
    [containerRef],
  );

  // Mouse wheel zoom and pan with requestAnimationFrame batching
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // A wheel over something that can still scroll belongs to that something —
      // a card body — and the canvas must leave it alone. Without this the wheel
      // reached the card, scrolled it, and bubbled up here as well, so scrolling a
      // checklist dragged the whole whiteboard with it. Once the inner region is
      // pinned at its edge the canvas takes the wheel back, so a wheel over a card
      // is never a dead zone. Ctrl+wheel is a zoom gesture and always belongs to
      // the canvas.
      //
      // This only sees what is inside the canvas. A popup portalled to
      // `document.body` — the card editor's suggestion list — is not on the walk
      // (its ancestors are body and html, not this container), so it stops the
      // wheel itself; see `canvas/CanvasCardSuggestMenu`.
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        wheelBelongsToInnerScroller(e.target, e.deltaX, e.deltaY, containerRef.current)
      ) {
        return;
      }

      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 1.15 : 0.85;
        wheelAccumulatorRef.current.zoomEvents.push({
          factor: delta,
          clientX: e.clientX,
          clientY: e.clientY,
        });
      } else {
        wheelAccumulatorRef.current.deltaX += e.deltaX;
        wheelAccumulatorRef.current.deltaY += e.deltaY;
      }

      if (!rafWheelIdRef.current) {
        rafWheelIdRef.current = requestAnimationFrame(() => {
          rafWheelIdRef.current = null;
          const { deltaX, deltaY, zoomEvents } = wheelAccumulatorRef.current;
          wheelAccumulatorRef.current = { deltaX: 0, deltaY: 0, zoomEvents: [] };

          if (deltaX !== 0 || deltaY !== 0 || zoomEvents.length > 0) {
            setViewport((prev) => {
              let nextPanX = prev.panX - deltaX;
              let nextPanY = prev.panY - deltaY;
              let nextZoom = prev.zoom;

              if (containerRef.current && zoomEvents.length > 0) {
                const rect = containerRef.current.getBoundingClientRect();
                for (const zEvent of zoomEvents) {
                  const targetZoom = Math.min(
                    MAX_ZOOM,
                    Math.max(MIN_ZOOM, nextZoom * zEvent.factor),
                  );
                  const cursorX = zEvent.clientX - rect.left;
                  const cursorY = zEvent.clientY - rect.top;
                  const factor = targetZoom / nextZoom;
                  nextPanX = cursorX - (cursorX - nextPanX) * factor;
                  nextPanY = cursorY - (cursorY - nextPanY) * factor;
                  nextZoom = targetZoom;
                }
              }

              return {
                panX: nextPanX,
                panY: nextPanY,
                zoom: nextZoom,
              };
            });
          }
        });
      }
    },
    [containerRef],
  );

  return {
    viewport,
    setViewport,
    /** Render-current mirror of `viewport` for hot paths and global listeners. */
    viewportRef,
    /**
     * The wheel rAF id — CanvasView's global-listener cleanup cancels it on
     * unmount alongside the drag/pan rAFs it owns.
     */
    rafWheelIdRef,
    handleZoom,
    handleZoomToFit,
    handleMinimapNavigate,
    handleWheel,
  };
}
