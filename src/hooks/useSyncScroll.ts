import { useCallback, useRef, useState, useEffect } from "react";
import type { EditorView } from "@codemirror/view";

type SyncScrollOptions = {
  containerRef: React.RefObject<HTMLElement | null>;
  viewMode: string;
  navLockUntilRef?: React.MutableRefObject<number>;
};

type ScrollKeyframe = {
  editorY: number;
  readerY: number;
};

/**
 * Builds piecewise anchor keyframes mapping editor pixel coordinates
 * directly to rendered preview DOM block coordinates.
 */
function buildScrollKeyframes(view: EditorView, readerElem: HTMLElement): ScrollKeyframe[] {
  const scrollDOM = view.scrollDOM;
  const maxEditorScroll = Math.max(0, scrollDOM.scrollHeight - scrollDOM.clientHeight);
  const maxReaderScroll = Math.max(0, readerElem.scrollHeight - readerElem.clientHeight);

  const keyframes: ScrollKeyframe[] = [{ editorY: 0, readerY: 0 }];

  const mappedElements = Array.from(readerElem.querySelectorAll<HTMLElement>("[data-source-line]"));

  const readerRect = readerElem.getBoundingClientRect();
  const doc = view.state.doc;
  const totalLines = doc.lines;

  for (let i = 0; i < mappedElements.length; i += 1) {
    const el = mappedElements[i];
    const rawLine = el.getAttribute("data-source-line");
    if (!rawLine) continue;

    const lineNumber = parseInt(rawLine, 10);
    if (Number.isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) continue;

    try {
      const lineObj = doc.line(lineNumber);
      const lineBlock = view.lineBlockAt(lineObj.from);
      const editorY = Math.max(0, lineBlock.top);

      const elRect = el.getBoundingClientRect();
      const readerY = Math.max(0, elRect.top - readerRect.top + readerElem.scrollTop);

      const lastKeyframe = keyframes[keyframes.length - 1];
      // Keep strictly increasing keyframes to ensure monotonic interpolation
      if (editorY > lastKeyframe.editorY && readerY > lastKeyframe.readerY) {
        keyframes.push({ editorY, readerY });
      }
    } catch {
      // Ignore lines that can't be mapped
    }
  }

  // Append end-of-document keyframe
  const lastKeyframe = keyframes[keyframes.length - 1];
  const finalEditorY = Math.max(maxEditorScroll, lastKeyframe.editorY + 1);
  const finalReaderY = Math.max(maxReaderScroll, lastKeyframe.readerY + 1);

  if (finalEditorY > lastKeyframe.editorY || finalReaderY > lastKeyframe.readerY) {
    keyframes.push({
      editorY: finalEditorY,
      readerY: finalReaderY,
    });
  }

  return keyframes;
}

/**
 * Piecewise linear interpolation between keyframes using binary search.
 */
function interpolateCoordinate(
  sourceY: number,
  keyframes: ScrollKeyframe[],
  fromKey: "editorY" | "readerY",
  toKey: "editorY" | "readerY",
): number {
  if (keyframes.length <= 1) return sourceY;

  if (sourceY <= keyframes[0][fromKey]) {
    return keyframes[0][toKey];
  }

  const last = keyframes[keyframes.length - 1];
  if (sourceY >= last[fromKey]) {
    return last[toKey];
  }

  let low = 0;
  let high = keyframes.length - 2;
  let idx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (keyframes[mid][fromKey] <= sourceY) {
      idx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const k1 = keyframes[idx];
  const k2 = keyframes[idx + 1];
  const span = k2[fromKey] - k1[fromKey];
  if (span <= 0) return k1[toKey];

  const progress = (sourceY - k1[fromKey]) / span;
  return k1[toKey] + progress * (k2[toKey] - k1[toKey]);
}

export function useSyncScroll({ containerRef, viewMode, navLockUntilRef }: SyncScrollOptions) {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const editorViewRef = useRef<EditorView | null>(null);
  const scrollingSourceRef = useRef<"editor" | "reader" | null>(null);
  const lockTimerRef = useRef<number | null>(null);

  const lockSync = useCallback(
    (durationMs = 850) => {
      if (navLockUntilRef) {
        navLockUntilRef.current = Date.now() + durationMs;
      }
      if (lockTimerRef.current) {
        window.clearTimeout(lockTimerRef.current);
      }
      scrollingSourceRef.current = null;
      lockTimerRef.current = window.setTimeout(() => {
        lockTimerRef.current = null;
      }, durationMs);
    },
    [navLockUntilRef],
  );

  const clearLock = useCallback(() => {
    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    scrollingSourceRef.current = null;
  }, []);

  const setLock = useCallback((source: "editor" | "reader") => {
    scrollingSourceRef.current = source;
    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
    }
    lockTimerRef.current = window.setTimeout(() => {
      scrollingSourceRef.current = null;
      lockTimerRef.current = null;
    }, 150);
  }, []);

  // Sync from Editor -> Reader Preview
  const handleEditorScroll = useCallback(
    (view: EditorView) => {
      if (!syncEnabled || viewMode !== "split") return;
      if (navLockUntilRef?.current && Date.now() < navLockUntilRef.current) return;
      if (scrollingSourceRef.current === "reader") return;

      const readerElem = containerRef.current;
      if (!readerElem) return;

      setLock("editor");

      const editorScrollTop = view.scrollDOM.scrollTop;
      const keyframes = buildScrollKeyframes(view, readerElem);
      const targetReaderY = interpolateCoordinate(editorScrollTop, keyframes, "editorY", "readerY");

      readerElem.scrollTop = targetReaderY;
    },
    [syncEnabled, viewMode, navLockUntilRef, containerRef, setLock],
  );

  // Sync from Reader Preview -> Editor
  const handleReaderScroll = useCallback(() => {
    if (!syncEnabled || viewMode !== "split") return;
    if (navLockUntilRef?.current && Date.now() < navLockUntilRef.current) return;
    if (scrollingSourceRef.current === "editor") return;

    const readerElem = containerRef.current;
    const view = editorViewRef.current;
    if (!readerElem || !view) return;

    setLock("reader");

    const readerScrollTop = readerElem.scrollTop;
    const keyframes = buildScrollKeyframes(view, readerElem);
    const targetEditorY = interpolateCoordinate(readerScrollTop, keyframes, "readerY", "editorY");

    view.scrollDOM.scrollTop = targetEditorY;
  }, [syncEnabled, viewMode, navLockUntilRef, containerRef, setLock]);

  // Bind scroll event to reader element
  useEffect(() => {
    const readerElem = containerRef.current;
    if (!readerElem || viewMode !== "split") return undefined;

    const onScroll = () => {
      handleReaderScroll();
    };

    readerElem.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      readerElem.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, viewMode, handleReaderScroll]);

  // When entering split mode, lock scrolling to reader and align editor position without jumping reader
  useEffect(() => {
    if (viewMode !== "split" || !syncEnabled) return undefined;

    // Lock to reader immediately so any initial editor layout/scroll events do not overwrite the reader position
    setLock("reader");

    const timer = window.setTimeout(() => {
      const readerElem = containerRef.current;
      const view = editorViewRef.current;
      if (!readerElem || !view) return;

      const readerScrollTop = readerElem.scrollTop;
      if (readerScrollTop > 0) {
        const keyframes = buildScrollKeyframes(view, readerElem);
        const targetEditorY = interpolateCoordinate(
          readerScrollTop,
          keyframes,
          "readerY",
          "editorY",
        );
        view.scrollDOM.scrollTop = targetEditorY;
      }
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [viewMode, syncEnabled, containerRef, setLock]);

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => {
      clearLock();
    };
  }, [clearLock]);

  return {
    syncEnabled,
    setSyncEnabled,
    toggleSync: () => setSyncEnabled((prev) => !prev),
    lockSync,
    editorViewRef,
    handleEditorScroll,
  };
}
