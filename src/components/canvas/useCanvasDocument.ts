import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CanvasData } from "../../types/canvasTypes";
import {
  createDefaultCanvas,
  parseCanvasData,
  serializeCanvasData,
} from "../../services/canvasService";

/**
 * The document domain of the canvas: board state and its external-source sync,
 * the undo/redo history stack, the save paths, and the colour-picker
 * snapshot/commit trio that routes colour drags through that same history.
 *
 * Extracted from CanvasView (wave 1 of the CanvasView decomposition); the
 * camera/viewport domain lives in `useCanvasViewport`.
 */
type UseCanvasDocumentParams = {
  /** Externally owned canvas source; external changes are parsed back into state. */
  source: string;
  /** Fallback board title when `source` has no parseable nodes (first mount only). */
  title: string;
  onSourceChange?: (newSource: string) => void;
  /** The parent's file-save action, fired by Ctrl+S and the Save button. */
  onSave?: () => void;
  /**
   * The card editor's live draft, mirrored into these refs by CanvasView so
   * the save paths below can commit it without re-subscribing on keystroke.
   */
  editingNodeIdRef: RefObject<string | null>;
  editingTextRef: RefObject<string>;
  /** Clears the card editor once its draft has been committed. */
  setEditingNodeId: (id: string | null) => void;
  /** Saving from the context menu also dismisses the menu. */
  setContextMenu: (menu: null) => void;
};

export function useCanvasDocument({
  source,
  title,
  onSourceChange,
  onSave,
  editingNodeIdRef,
  editingTextRef,
  setEditingNodeId,
  setContextMenu,
}: UseCanvasDocumentParams) {
  // Initialize canvas data
  const [data, setData] = useState<CanvasData>(() => {
    const parsed = parseCanvasData(source);
    if (parsed.nodes.length > 0) return parsed;
    return createDefaultCanvas(title);
  });

  const lastEmittedSourceRef = useRef(source);

  // Synchronize external source changes into internal canvas state
  useEffect(() => {
    if (source && source !== lastEmittedSourceRef.current) {
      const parsed = parseCanvasData(source);
      if (parsed.nodes.length > 0 || parsed.edges.length > 0) {
        setData(parsed);
      }
      lastEmittedSourceRef.current = source;
    }
  }, [source]);

  // History stack for Undo/Redo
  const [history, setHistory] = useState<{ past: CanvasData[]; future: CanvasData[] }>({
    past: [],
    future: [],
  });

  const latestDataRef = useRef(data);
  latestDataRef.current = data;

  /** Pending debounce timer for committing colour pick history. */
  const colorCommitTimerRef = useRef<number | null>(null);
  /**
   * Board state captured the moment a colour drag began. Dragging inside the
   * native chooser only previews against this baseline; the history entry is
   * committed once, from here, when the pick settles.
   */
  const colorPickStartRef = useRef<CanvasData | null>(null);

  // Never leave a timer behind that would touch state after unmount.
  useEffect(
    () => () => {
      if (colorCommitTimerRef.current !== null) {
        window.clearTimeout(colorCommitTimerRef.current);
        colorCommitTimerRef.current = null;
      }
    },
    [],
  );

  // Synchronize internal data changes to parent
  // Kept in a ref so `emitChange` (and everything built on it, such as the
  // global mousemove/mouseup listeners) stays referentially stable even when
  // the parent passes a fresh inline callback on every render. Previously that
  // identity churn made React detach and re-attach the window listeners after
  // every single render.
  const onSourceChangeRef = useRef(onSourceChange);
  onSourceChangeRef.current = onSourceChange;

  const emitChange = useCallback((newData: CanvasData) => {
    setData(newData);
    latestDataRef.current = newData;
    const handler = onSourceChangeRef.current;
    if (handler) {
      const serialized = serializeCanvasData(newData);
      lastEmittedSourceRef.current = serialized;
      handler(serialized);
    }
  }, []);

  // Push history snapshot
  const pushHistory = useCallback(
    (newData: CanvasData) => {
      setHistory((prev) => ({
        past: [...prev.past.slice(-25), latestDataRef.current],
        future: [],
      }));
      emitChange(newData);
    },
    [emitChange],
  );

  // ── Colour-picker preview & commit ───────────────────────────────────────
  // Dragging inside the native OS colour chooser fires onChange dozens of
  // times a second. Committing each of those through pushHistory (with its
  // whole-board JSON serialisation) is what used to crash the app mid-drag —
  // so the drag only *previews* against the baseline below, and exactly one
  // history entry is written once the pick settles.

  /** Records the pre-pick baseline the first time a colour drag fires. */
  const captureColorSnapshot = useCallback(() => {
    if (!colorPickStartRef.current) {
      colorPickStartRef.current = latestDataRef.current;
    }
  }, []);

  /**
   * Writes ONE history entry for a whole colour-drag gesture, from the
   * baseline captured when it began.
   */
  const commitColorPick = useCallback(() => {
    const before = colorPickStartRef.current;
    colorPickStartRef.current = null;
    if (!before || before === latestDataRef.current) return;
    setHistory((prev) => ({
      past: [...prev.past.slice(-25), before],
      future: [],
    }));
    emitChange(latestDataRef.current);
  }, [emitChange]);

  const debounceCommitColorPick = useCallback(() => {
    // A real debounce for history commit: while the user drags inside the chooser,
    // onChange fires repeatedly, and each call pushes the commit further out.
    // The history entry is therefore written exactly once, from the baseline
    // captured at drag start.
    //
    // The context menu stays open on purpose so the user can freely compare and
    // continue operations without any unexpected auto-dismiss. Only the history
    // snapshot persistence is delayed by 500ms after the interaction settles.
    if (colorCommitTimerRef.current !== null) {
      window.clearTimeout(colorCommitTimerRef.current);
    }
    colorCommitTimerRef.current = window.setTimeout(() => {
      colorCommitTimerRef.current = null;
      commitColorPick();
    }, 500);
  }, [commitColorPick]);

  const handleUndo = useCallback(() => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    setHistory((prev) => ({
      past: prev.past.slice(0, -1),
      future: [latestDataRef.current, ...prev.future],
    }));
    emitChange(previous);
  }, [history, emitChange]);

  const handleRedo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory((prev) => ({
      past: [...prev.past, latestDataRef.current],
      future: prev.future.slice(1),
    }));
    emitChange(next);
  }, [history, emitChange]);

  const handleSaveNodeEdit = useCallback(() => {
    const currentId = editingNodeIdRef.current;
    if (!currentId) return;
    const currentText = editingTextRef.current;
    pushHistory({
      ...data,
      nodes: data.nodes.map((n) => {
        if (n.id === currentId) {
          if (n.type === "text") return { ...n, text: currentText };
          if (n.type === "group") return { ...n, label: currentText };
        }
        return n;
      }),
    });
    setEditingNodeId(null);
  }, [data, pushHistory, editingNodeIdRef, editingTextRef, setEditingNodeId]);

  const handleSave = useCallback(() => {
    let currentData = data;
    if (editingNodeIdRef.current) {
      const currentId = editingNodeIdRef.current;
      const currentText = editingTextRef.current;
      currentData = {
        ...data,
        nodes: data.nodes.map((n) => {
          if (n.id === currentId) {
            if (n.type === "text") return { ...n, text: currentText };
            if (n.type === "group") return { ...n, label: currentText };
          }
          return n;
        }),
      };
      setData(currentData);
      setEditingNodeId(null);
    }
    const serialized = serializeCanvasData(currentData);
    lastEmittedSourceRef.current = serialized;
    if (onSourceChange) {
      onSourceChange(serialized);
    }
    if (onSave) {
      onSave();
    }
    setContextMenu(null);
  }, [
    data,
    onSourceChange,
    onSave,
    editingNodeIdRef,
    editingTextRef,
    setEditingNodeId,
    setContextMenu,
  ]);

  return {
    /** The whole board. Mutate only through `emitChange`/`pushHistory`/`setData`. */
    data,
    setData,
    /** Render-current mirror of `data` for rAF hot paths and global listeners. */
    latestDataRef,
    history,
    /** Writes board state and serialises it up to the parent. Referentially stable. */
    emitChange,
    /** Records one undo entry, then emits. Referentially stable. */
    pushHistory,
    handleUndo,
    handleRedo,
    handleSaveNodeEdit,
    handleSave,
    /** Colour-picker baseline capture — the preview helpers live in CanvasView. */
    captureColorSnapshot,
    /** Debounced, single-entry history commit for a whole colour-drag gesture. */
    debounceCommitColorPick,
  };
}
