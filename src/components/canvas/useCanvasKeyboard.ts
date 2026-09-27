import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CanvasNode } from "../../types/canvasTypes";
import type { CanvasContextMenuState } from "./CanvasOverlayMenus";
import type { CanvasSelectionBox } from "./useCanvasSelection";

/**
 * The keyboard domain of the canvas: the global shortcut handler
 * (Ctrl+S/A/D/Z/Y, Delete/Backspace, R, Tab, Enter, Escape) and the
 * Escape-key priority chain that closes whichever overlay is on top.
 *
 * Extracted from CanvasView (wave 7 of the CanvasView decomposition). The two
 * effects keep their original registration order (Escape chain first, then
 * the shortcuts) and their handler bodies verbatim — only the identities they
 * compose are threaded through params. The deps arrays gained only the stable
 * setter/ref identities that exhaustive-deps demands; the loose entries the
 * original array carried (selectedEdgeId, handleDeleteEdge, handleReverseEdge)
 * are threaded too, so the array stays byte-identical apart from those gains.
 */
type UseCanvasKeyboardParams = {
  // ── Shortcut guards ──────────────────────────────────────────────────────
  editable: boolean;
  /** While a card or edge is being edited, most shortcuts are suppressed. */
  editingNodeId: string | null;
  editingEdgeId: string | null;
  // ── Selection state read by the shortcuts ────────────────────────────────
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
  /** Carried for the verbatim deps array; the body reads the plural sets. */
  selectedEdgeId: string | null;
  selectedEdgeIds: Set<string>;
  /** The board's nodes — Enter looks up the selected card's text to edit. */
  nodes: CanvasNode[];
  // ── Document / history ops ───────────────────────────────────────────────
  handleSave: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  // ── Node ops ─────────────────────────────────────────────────────────────
  handleSelectAll: () => void;
  handleDeleteSelected: () => void;
  handleDuplicateSelected: () => void;
  // ── Edge ops (delete/reverse carry the verbatim deps entries) ────────────
  handleDeleteEdge: (edgeId: string) => void;
  handleBatchDeleteEdges: () => void;
  handleReverseEdge: (edgeId: string) => void;
  handleBatchReverseEdges: () => void;
  // ── Connect / branch ops ─────────────────────────────────────────────────
  handleSpawnConnectedChild: (sourceNodeId: string, direction?: "right" | "bottom") => void;
  // ── State writers the shortcuts compose ──────────────────────────────────
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEdgeIds: Dispatch<SetStateAction<Set<string>>>;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | null>>;
  setIsBoxSelectMode: Dispatch<SetStateAction<boolean>>;
  selectionBoxRef: RefObject<CanvasSelectionBox | null>;
  setSelectionBox: Dispatch<SetStateAction<CanvasSelectionBox | null>>;
  // ── Escape priority chain ────────────────────────────────────────────────
  /** The open right-click menu, if any — Escape closes it. */
  contextMenu: CanvasContextMenuState | null;
  showSlideDrawer: boolean;
  setShowSlideDrawer: Dispatch<SetStateAction<boolean>>;
  showExtractModal: boolean;
  setShowExtractModal: Dispatch<SetStateAction<boolean>>;
  showExportModal: boolean;
  setShowExportModal: Dispatch<SetStateAction<boolean>>;
  showFilePicker: boolean;
  setShowFilePicker: Dispatch<SetStateAction<boolean>>;
  isPresentationMode: boolean;
  handleTogglePresentation: () => void;
  isFullscreenActive: boolean;
  handleToggleFullscreen: () => void;
};

export function useCanvasKeyboard({
  editable,
  editingNodeId,
  editingEdgeId,
  selectedNodeId,
  selectedNodeIds,
  selectedEdgeId,
  selectedEdgeIds,
  nodes,
  handleSave,
  handleUndo,
  handleRedo,
  handleSelectAll,
  handleDeleteSelected,
  handleDuplicateSelected,
  handleDeleteEdge,
  handleBatchDeleteEdges,
  handleReverseEdge,
  handleBatchReverseEdges,
  handleSpawnConnectedChild,
  setEditingNodeId,
  setEditingText,
  setSelectedNodeIds,
  setSelectedEdgeIds,
  setContextMenu,
  setIsBoxSelectMode,
  selectionBoxRef,
  setSelectionBox,
  contextMenu,
  showSlideDrawer,
  setShowSlideDrawer,
  showExtractModal,
  setShowExtractModal,
  showExportModal,
  setShowExportModal,
  showFilePicker,
  setShowFilePicker,
  isPresentationMode,
  handleTogglePresentation,
  isFullscreenActive,
  handleToggleFullscreen,
}: UseCanvasKeyboardParams) {
  // Escape-key priority chain. F5 and the in-presentation slide keys live in
  // useCanvasPresentation's own listener; the Escape chain stays whole here
  // because it is ONE ordered list that also covers non-presentation overlays
  // (modals → context menu → fullscreen). Splitting it across two listeners
  // would let a later branch fire where the original handler had `return`ed —
  // e.g. Escape with both the slide drawer and presentation active must close
  // only the drawer, never exit the presentation.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showSlideDrawer) {
        e.preventDefault();
        setShowSlideDrawer(false);
        return;
      }
      if (showExtractModal) {
        e.preventDefault();
        setShowExtractModal(false);
        return;
      }
      if (showExportModal) {
        e.preventDefault();
        setShowExportModal(false);
        return;
      }
      if (showFilePicker) {
        e.preventDefault();
        setShowFilePicker(false);
        return;
      }
      if (contextMenu) {
        e.preventDefault();
        setContextMenu(null);
        return;
      }
      if (isPresentationMode) {
        e.preventDefault();
        handleTogglePresentation();
        return;
      }
      if (isFullscreenActive) {
        e.preventDefault();
        handleToggleFullscreen();
        return;
      }

      // ── Fallback: force-exit whatever fullscreen is actually active ────
      // The React flag above can go stale (e.g. the window went fullscreen
      // through a path that never updated it), and then ESC appeared to do
      // nothing. These checks ask the real sources of truth instead.
      if (typeof document !== "undefined" && document.fullscreenElement) {
        e.preventDefault();
        document.exitFullscreen?.().catch(() => {});
        return;
      }
      // The namespaced bridge; `system` holds the fullscreen calls.
      const desktopFs = window.bookMDDesktop?.system;
      if (desktopFs?.isFullScreen && desktopFs?.toggleFullScreen) {
        e.preventDefault();
        desktopFs
          .isFullScreen()
          .then((full) => {
            if (full) return desktopFs.toggleFullScreen?.();
            return undefined;
          })
          .catch(() => {});
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showSlideDrawer,
    showExtractModal,
    showExportModal,
    showFilePicker,
    contextMenu,
    setContextMenu,
    isPresentationMode,
    isFullscreenActive,
    handleTogglePresentation,
    handleToggleFullscreen,
    setShowSlideDrawer,
    setShowExtractModal,
    setShowExportModal,
    setShowFilePicker,
  ]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Save shortcut (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // While a card's text is being edited, the keys belong to the text.
      // Without this guard the Enter below is the trap: it closes the editor,
      // React flushes, and this handler — whose closure still says "not
      // editing" — opens it straight back, so Ctrl+Enter looked like it did
      // nothing at all. The same guard is what stops Delete from deleting the
      // card out from under the sentence being typed, and Tab from spawning a
      // branch beside it.
      const keyTarget = e.target as HTMLElement | null;
      if (
        keyTarget &&
        (keyTarget.tagName === "TEXTAREA" ||
          keyTarget.tagName === "INPUT" ||
          keyTarget.isContentEditable)
      ) {
        return;
      }

      if (editingNodeId || editingEdgeId) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size > 0) {
          handleDeleteSelected();
        } else if (selectedEdgeIds.size > 0) {
          handleBatchDeleteEdges();
        }
      } else if (
        (e.key === "r" || e.key === "R") &&
        selectedEdgeIds.size > 0 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        handleBatchReverseEdges();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          handleDuplicateSelected();
        }
      } else if (e.key === "Tab" && selectedNodeId && !editingNodeId) {
        e.preventDefault();
        handleSpawnConnectedChild(selectedNodeId, "right");
      } else if (e.key === "Enter" && selectedNodeId) {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node && editable) {
          e.preventDefault();
          setEditingNodeId(node.id);
          setEditingText(
            node.type === "text" ? node.text : node.type === "group" ? node.label || "" : "",
          );
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        handleRedo();
      } else if (e.key === "Escape") {
        setSelectedNodeIds(new Set());
        setSelectedEdgeIds(new Set());
        setContextMenu(null);
        setIsBoxSelectMode(false);
        if (selectionBoxRef.current) {
          selectionBoxRef.current = null;
          setSelectionBox(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingNodeId,
    editingEdgeId,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    selectedEdgeIds,
    nodes,
    editable,
    handleSave,
    handleSelectAll,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleDeleteEdge,
    handleBatchDeleteEdges,
    handleReverseEdge,
    handleBatchReverseEdges,
    handleSpawnConnectedChild,
    handleUndo,
    handleRedo,
    setEditingNodeId,
    setEditingText,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    setContextMenu,
    setIsBoxSelectMode,
    selectionBoxRef,
    setSelectionBox,
  ]);
}
