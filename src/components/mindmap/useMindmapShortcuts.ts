import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MindmapSide } from "../../core/mindmapSides";

/**
 * The shape of the open context menu, matching the state MindmapView holds.
 *
 * Written out structurally rather than imported: the state itself stays in the
 * view (the menus' panels consume it directly), and only this Escape-chain
 * reader needs the type.
 */
type MindmapContextMenuState = {
  x: number;
  y: number;
  nodeId: string;
  isCanvas?: boolean;
  floating?: boolean;
};

/**
 * The keyboard domain of the mindmap: the global window keydown handler —
 * Enter/Escape while a node is being edited, Ctrl+F search, Ctrl+A/C/X/V,
 * the Escape priority chain (search → side question → context menu →
 * selection → close), undo/redo, sync, Tab/Enter/Delete/F2, zoom, and the
 * plain and Alt-arrow navigation.
 *
 * Extracted from MindmapView (batch 3, wave 2a of the decomposition). The
 * handler body is verbatim — same guards, same order, same preventDefaults —
 * and everything it composes is threaded in as params from the view's own
 * hooks and remaining locals.
 *
 * The deps array is the original one plus the identities the body touches that
 * the original array omitted. The original predates the exhaustive-deps rule
 * (it is whitelisted off in MindmapView.tsx, where this effect used to live),
 * and new files run with the rule on. Every addition except one is a stable
 * setter/ref identity; `sideChooser` is the one state value the body reads
 * that the original array never listed — added so the Escape branch reads the
 * value the code above it promises ("Escape closes … the side question"),
 * which the stale closure could miss. Re-registering a listener is
 * unobservable; nothing else about the effect changed.
 */
type UseMindmapShortcutsParams = {
  // ── Guards ────────────────────────────────────────────────────────────────
  /** While a node's text is being edited, Enter and Escape belong to the editor. */
  editingNodeId: string | null;
  // ── Overlay state the Escape chain walks (read) ───────────────────────────
  isSearchOpen: boolean;
  sideChooser: { parentId: string; x: number; y: number } | null;
  contextMenu: MindmapContextMenuState | null;
  selectedNodeIds: Set<string>;
  // ── Search wiring: Ctrl+F opens the field and focuses it ──────────────────
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  handleCloseSearch: () => void;
  // ── Overlay writers the Escape chain composes ─────────────────────────────
  setSideChooser: Dispatch<SetStateAction<{ parentId: string; x: number; y: number } | null>>;
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenuState | null>>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  // ── Handlers composed, in the order the body reaches them ─────────────────
  handleSelectAll: () => void;
  handleCommitEdit: () => void;
  handleCancelEdit: () => void;
  handleCopyNode: (explicitNodeId?: string) => void;
  handleCutNode: (explicitNodeId?: string) => void;
  handlePasteNode: (explicitParentId?: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSyncToDocument: () => void;
  handleAddChild: (parentId?: string, side?: MindmapSide) => void;
  handleAddSibling: (targetId?: string) => void;
  handleDeleteNode: (nodeId?: string) => void;
  startEditing: (nodeId?: string) => void;
  handleZoomStep: (factor: number) => void;
  handleFitToScreen: () => void;
  handleMoveSibling: (delta: number) => void;
  handleNavigate: (direction: "up" | "down" | "left" | "right") => void;
  /** Closes the view itself — the last thing Escape does, with nothing left to close. */
  onClose?: () => void;
};

export function useMindmapShortcuts({
  editingNodeId,
  isSearchOpen,
  sideChooser,
  contextMenu,
  selectedNodeIds,
  setIsSearchOpen,
  searchInputRef,
  handleCloseSearch,
  setSideChooser,
  setContextMenu,
  setSelectedNodeIds,
  handleSelectAll,
  handleCommitEdit,
  handleCancelEdit,
  handleCopyNode,
  handleCutNode,
  handlePasteNode,
  handleUndo,
  handleRedo,
  handleSyncToDocument,
  handleAddChild,
  handleAddSibling,
  handleDeleteNode,
  startEditing,
  handleZoomStep,
  handleFitToScreen,
  handleMoveSibling,
  handleNavigate,
  onClose,
}: UseMindmapShortcutsParams) {
  // Global Mindmap Keydown shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCommitEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleCancelEdit();
        }
        return;
      }

      // Keys belong to the field the reader is typing in, not to the map.
      //
      // The same rule as the block above, and it has to be written twice because these
      // shortcuts are bound to the window: they fired while the caret was in the panel's
      // own fields. Delete inside the note field deleted the topic the note was on;
      // Ctrl+V inside the tag or link field pasted a branch — reading a menu of text
      // fields and getting the map rearranged behind it. Anything with a caret is left
      // alone now: the annotation fields, the search box, the colour inputs. Escape is
      // the exception, because it changes nothing — it drops the focus and then closes
      // whatever is open, which is what it already did everywhere else.
      const focused = e.target as HTMLElement | null;
      const focusedTag = focused?.tagName;
      const isTextEntry =
        focusedTag === "INPUT" ||
        focusedTag === "TEXTAREA" ||
        focusedTag === "SELECT" ||
        Boolean(focused?.isContentEditable);
      if (isTextEntry) {
        if (e.key !== "Escape") return;
        focused?.blur();
      }

      // Ctrl+F In-Canvas Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
        return;
      }

      // Ctrl+A Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // Copy, cut and paste the selected branch. These sit after the
      // editing guard at the top of this handler, so they never fire while
      // text is being edited — Ctrl+C in the inline editor has to stay the
      // browser's copy.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopyNode();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCutNode();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteNode();
        return;
      }

      // Escape closes search, the side question, the context menu, deselects nodes, or
      // closes view
      if (e.key === "Escape") {
        e.preventDefault();
        if (isSearchOpen) {
          handleCloseSearch();
          return;
        }
        if (sideChooser) {
          setSideChooser(null);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
          return;
        }
        if (onClose) {
          onClose();
          return;
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (
        (e.ctrlKey && e.key.toLowerCase() === "y") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSyncToDocument();
        return;
      }

      if (e.key === "Tab" || e.key === "Insert") {
        e.preventDefault();
        handleAddChild();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddSibling();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteNode();
        return;
      }
      if (e.key === "F2" || e.key === " ") {
        e.preventDefault();
        startEditing();
        return;
      }
      // Zoom. Ctrl/Cmd with the usual keys, plus Ctrl+0 for fit-to-screen,
      // which until now only ran once when the canvas mounted.
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handleZoomStep(1.15);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        handleZoomStep(0.87);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // Alt+arrows reorder among siblings. This has to be tested before the
      // plain arrow navigation below, which does not look at the modifier and
      // would otherwise swallow both of these.
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        handleMoveSibling(e.key === "ArrowUp" ? -1 : 1);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleNavigate("up");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleNavigate("down");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigate("left");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigate("right");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    // The original deps array, verbatim and in order.
    editingNodeId,
    contextMenu,
    selectedNodeIds,
    handleSelectAll,
    handleCommitEdit,
    handleCancelEdit,
    handleUndo,
    handleRedo,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    startEditing,
    handleNavigate,
    handleMoveSibling,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    handleZoomStep,
    handleFitToScreen,
    onClose,
    isSearchOpen,
    handleSyncToDocument,
    // Identities the body touches that the original array omitted — every one
    // a stable setter/ref except sideChooser (see the header note).
    setIsSearchOpen,
    searchInputRef,
    handleCloseSearch,
    sideChooser,
    setSideChooser,
    setContextMenu,
    setSelectedNodeIds,
  ]);
}
