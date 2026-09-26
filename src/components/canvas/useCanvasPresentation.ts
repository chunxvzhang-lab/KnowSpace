import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CanvasData, CanvasNode, CanvasViewport } from "../../types/canvasTypes";
import { buildPresentationSequence } from "../../services/canvasService";

/**
 * The presentation (分镜演示) domain of the canvas: the slide-sequence state,
 * the camera moves that focus a slide, the autoplay loop, the presentation
 * fullscreen handling and the F5 / slide-navigation keyboard controls.
 *
 * Extracted from CanvasView (wave 4 of the CanvasView decomposition). The
 * Escape-key priority chain (slide drawer → modals → context menu →
 * presentation exit → fullscreen) deliberately stays in CanvasView: its
 * branch order spans non-presentation overlays too, and re-registering it as
 * two window listeners would reorder which overlay an Escape closes first.
 */
type UseCanvasPresentationParams = {
  /** The scrollable canvas container — `focusSlide` measures it to frame a slide. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Board data, walked by the sequence builder. */
  data: CanvasData;
  /** Node id → node lookup, read by `focusSlide` to frame the target card. */
  nodeMap: Map<string, CanvasNode>;
  /** Current camera transform; saved before entering presentation mode. */
  viewport: CanvasViewport;
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedNodeId: (id: string | null) => void;
  /** Workspace-level fullscreen flag; the canvas only owns fullscreen when it is absent. */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Toast sink for the "nothing to present" notice. */
  showToast: (msg: string) => void;
};

export function useCanvasPresentation({
  containerRef,
  data,
  nodeMap,
  viewport,
  setViewport,
  selectedNodeId,
  selectedNodeIds,
  setSelectedNodeIds,
  setSelectedNodeId,
  isFullscreen,
  onToggleFullscreen,
  showToast,
}: UseCanvasPresentationParams) {
  // Presentation Mode state
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showSlideDrawer, setShowSlideDrawer] = useState(false);
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState(false);
  const isFullscreenActive = isFullscreen ?? isPresentationFullscreen;
  const slideDrawerRef = useRef<HTMLDivElement>(null);
  const savedViewportBeforePresentationRef = useRef<CanvasViewport | null>(null);

  const presentationSequence = useMemo(() => buildPresentationSequence(data), [data]);

  const focusSlide = useCallback(
    (index: number) => {
      if (presentationSequence.length === 0 || !containerRef.current) return;
      const targetId = presentationSequence[index];
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerW = rect.width || 1000;
      const containerH = rect.height || 700;

      // Available vertical height clearing the bottom floating presentation bar (~80px)
      const usableH = Math.max(300, containerH - 90);
      const targetZoom = Math.min(
        1.35,
        Math.max(
          0.35,
          Math.min((containerW - 160) / targetNode.width, (usableH - 120) / targetNode.height),
        ),
      );

      // Target center slightly shifted upward to give clearance to the bottom presentation controller
      const visualCenterY = usableH / 2 + 10;
      const targetPanX = Math.round(
        containerW / 2 - (targetNode.x + targetNode.width / 2) * targetZoom,
      );
      const targetPanY = Math.round(
        visualCenterY - (targetNode.y + targetNode.height / 2) * targetZoom,
      );

      setViewport({ panX: targetPanX, panY: targetPanY, zoom: targetZoom });
      setSelectedNodeIds(new Set([targetId]));
      setSelectedNodeId(targetId);
    },
    [
      presentationSequence,
      nodeMap,
      containerRef,
      setViewport,
      setSelectedNodeIds,
      setSelectedNodeId,
    ],
  );

  const handleJumpToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= presentationSequence.length) return;
      setCurrentSlideIndex(index);
      focusSlide(index);
    },
    [presentationSequence.length, focusSlide],
  );

  const handleTogglePresentation = useCallback(() => {
    if (isPresentationMode) {
      setIsPresentationMode(false);
      setIsAutoPlaying(false);
      setShowSlideDrawer(false);
      if (savedViewportBeforePresentationRef.current) {
        setViewport(savedViewportBeforePresentationRef.current);
      }
    } else {
      if (presentationSequence.length === 0) {
        showToast("画布中暂无可演示的卡片");
        return;
      }
      savedViewportBeforePresentationRef.current = { ...viewport };
      setIsPresentationMode(true);
      setShowSlideDrawer(false);

      // "就近开播": Check if currently selected node is in presentation sequence
      const currentSelected = selectedNodeId || Array.from(selectedNodeIds)[0];
      const targetIndex = currentSelected ? presentationSequence.indexOf(currentSelected) : -1;
      const startIndex = targetIndex >= 0 ? targetIndex : 0;

      setCurrentSlideIndex(startIndex);
      focusSlide(startIndex);
    }
  }, [
    isPresentationMode,
    presentationSequence,
    viewport,
    selectedNodeId,
    selectedNodeIds,
    focusSlide,
    showToast,
    setViewport,
  ]);

  const handleNextSlide = useCallback(() => {
    if (presentationSequence.length === 0) return;
    const nextIdx = (currentSlideIndex + 1) % presentationSequence.length;
    setCurrentSlideIndex(nextIdx);
    focusSlide(nextIdx);
  }, [currentSlideIndex, presentationSequence.length, focusSlide]);

  const handlePrevSlide = useCallback(() => {
    if (presentationSequence.length === 0) return;
    const prevIdx =
      (currentSlideIndex - 1 + presentationSequence.length) % presentationSequence.length;
    setCurrentSlideIndex(prevIdx);
    focusSlide(prevIdx);
  }, [currentSlideIndex, presentationSequence.length, focusSlide]);

  const handleToggleFullscreen = useCallback(async () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    const desktopWin = (
      window as unknown as { bookMDDesktop?: { toggleFullScreen?: () => Promise<boolean> } }
    ).bookMDDesktop;
    if (desktopWin?.toggleFullScreen) {
      const next = await desktopWin.toggleFullScreen();
      setIsPresentationFullscreen(Boolean(next));
    } else if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.().catch(() => {});
        setIsPresentationFullscreen(true);
      } else {
        await document.exitFullscreen?.().catch(() => {});
        setIsPresentationFullscreen(false);
      }
    }
  }, [onToggleFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsPresentationFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    if (!showSlideDrawer) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (slideDrawerRef.current && !slideDrawerRef.current.contains(e.target as Node)) {
        setShowSlideDrawer(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSlideDrawer]);

  useEffect(() => {
    if (!isPresentationMode || !isAutoPlaying) return;
    const timer = setInterval(() => {
      handleNextSlide();
    }, 3500);
    return () => clearInterval(timer);
  }, [isPresentationMode, isAutoPlaying, handleNextSlide]);

  // Global F5 / slide-navigation keys. The Escape chain (drawer → extract →
  // export → file picker → context menu → presentation exit → fullscreen)
  // stays in CanvasView's own listener: it is one ordered priority list that
  // also covers non-presentation overlays, so splitting it across two
  // listeners would let a later branch fire where the original `return`ed.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // NOTE: F11 is intentionally NOT handled here — App.tsx already has a
      // global F11 listener. Handling it in both places toggled fullscreen
      // twice per keypress, which looked like "F11 does nothing".

      if (e.key === "F5") {
        e.preventDefault();
        handleTogglePresentation();
        return;
      }

      if (!isPresentationMode) return;

      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown" || e.key === "Enter") {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "Backspace") {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === "Home") {
        e.preventDefault();
        handleJumpToSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        handleJumpToSlide(presentationSequence.length - 1);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setShowSlideDrawer((prev) => !prev);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setIsAutoPlaying((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPresentationMode,
    handleTogglePresentation,
    handleToggleFullscreen,
    handleNextSlide,
    handlePrevSlide,
    handleJumpToSlide,
    presentationSequence.length,
  ]);

  return {
    isPresentationMode,
    currentSlideIndex,
    isAutoPlaying,
    showSlideDrawer,
    isFullscreenActive,
    setIsAutoPlaying,
    setShowSlideDrawer,
    /** Attached to the slide-overview drawer so outside clicks can close it. */
    slideDrawerRef,
    presentationSequence,
    handleJumpToSlide,
    handleTogglePresentation,
    handleNextSlide,
    handlePrevSlide,
    handleToggleFullscreen,
  };
}
