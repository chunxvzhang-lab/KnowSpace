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
 * A built keyframe table plus the editor-document identity it was measured
 * against: valid while the doc signal still matches AND nothing has marked
 * the cache dirty since the build.
 */
type KeyframeCache = {
  frames: ScrollKeyframe[];
  docLength: number;
  docLines: number;
};

/** A scroll event parked for the next animation frame (read/write separation). */
type PendingScrollSync = {
  source: "editor" | "reader";
  scrollPos: number;
  view: EditorView;
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

  // ---- Keyframe cache -----------------------------------------------------
  // buildScrollKeyframes is O(all blocks) sync layout (querySelectorAll +
  // getBoundingClientRect + lineBlockAt per block), so it must not run on
  // every scroll event. It is rebuilt lazily on the first scroll after a
  // signal that can move geometry, cheapest correct signal per source:
  //  - editor doc changed -> O(1) doc.length/doc.lines compare (this CM
  //    version has no runtime update listener; a source-driven preview
  //    re-render is always preceded by one of these numbers flipping)
  //  - article remount (React key on document switch) -> childList-only
  //    MutationObserver on the container (see WHY below)
  //  - everything that changes BOX SIZES: splitter drag, window resize,
  //    lazily loaded images / mermaid SVGs growing blocks, theme/fontScale
  //    metric changes -> ResizeObserver on the reader container, its article
  //    children, and both CodeMirror DOM boxes
  // The observers only ever flip a boolean; rebuilds happen at most once per
  // scroll burst.
  const keyframesCacheRef = useRef<KeyframeCache | null>(null);
  const keyframesDirtyRef = useRef(true);

  const markKeyframesDirty = useCallback(() => {
    keyframesDirtyRef.current = true;
  }, []);

  const getSyncKeyframes = useCallback((view: EditorView, readerElem: HTMLElement) => {
    const cache = keyframesCacheRef.current;
    const doc = view.state.doc;
    if (
      cache &&
      !keyframesDirtyRef.current &&
      cache.docLength === doc.length &&
      cache.docLines === doc.lines
    ) {
      return cache.frames;
    }
    const frames = buildScrollKeyframes(view, readerElem);
    keyframesCacheRef.current = { frames, docLength: doc.length, docLines: doc.lines };
    keyframesDirtyRef.current = false;
    return frames;
  }, []);

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

  // ---- rAF-coalesced sync application -------------------------------------
  // Scroll events stay passive and cheap: they only stash the latest source
  // position. All layout reads (keyframe build) and the single layout write
  // (programmatic scrollTop) happen at most once per frame. The guards live in
  // refs so a callback scheduled before a re-render still sees current
  // settings instead of a stale closure.
  const syncEnabledRef = useRef(syncEnabled);
  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    syncEnabledRef.current = syncEnabled;
    viewModeRef.current = viewMode;
  }, [syncEnabled, viewMode]);

  const pendingSyncRef = useRef<PendingScrollSync | null>(null);
  const syncRafRef = useRef<number | null>(null);

  const applyPendingSync = useCallback(() => {
    syncRafRef.current = null;
    const pending = pendingSyncRef.current;
    pendingSyncRef.current = null;
    if (!pending) return;

    if (!syncEnabledRef.current || viewModeRef.current !== "split") return;
    if (navLockUntilRef?.current && Date.now() < navLockUntilRef.current) return;
    if (pending.source === "editor" && scrollingSourceRef.current === "reader") return;
    if (pending.source === "reader" && scrollingSourceRef.current === "editor") return;

    const readerElem = containerRef.current;
    const view = pending.source === "editor" ? pending.view : editorViewRef.current;
    if (!readerElem || !view) return;

    // Written at apply time, exactly like the synchronous path did before the
    // rAF hop: the programmatic scroll below then fires a scroll event on the
    // other pane, and this is the only thing that suppresses the echo.
    setLock(pending.source);

    const keyframes = getSyncKeyframes(view, readerElem);
    if (pending.source === "editor") {
      readerElem.scrollTop = interpolateCoordinate(
        pending.scrollPos,
        keyframes,
        "editorY",
        "readerY",
      );
    } else {
      view.scrollDOM.scrollTop = interpolateCoordinate(
        pending.scrollPos,
        keyframes,
        "readerY",
        "editorY",
      );
    }
  }, [navLockUntilRef, containerRef, setLock, getSyncKeyframes]);

  const scheduleSync = useCallback(
    (pending: PendingScrollSync) => {
      pendingSyncRef.current = pending;
      if (syncRafRef.current !== null) return;
      syncRafRef.current = window.requestAnimationFrame(applyPendingSync);
    },
    [applyPendingSync],
  );

  // Sync from Editor -> Reader Preview
  const handleEditorScroll = useCallback(
    (view: EditorView) => {
      if (!syncEnabled || viewMode !== "split") return;
      if (navLockUntilRef?.current && Date.now() < navLockUntilRef.current) return;
      if (scrollingSourceRef.current === "reader") return;

      const readerElem = containerRef.current;
      if (!readerElem) return;

      scheduleSync({ source: "editor", scrollPos: view.scrollDOM.scrollTop, view });
    },
    [syncEnabled, viewMode, navLockUntilRef, containerRef, scheduleSync],
  );

  // Sync from Reader Preview -> Editor
  const handleReaderScroll = useCallback(() => {
    if (!syncEnabled || viewMode !== "split") return;
    if (navLockUntilRef?.current && Date.now() < navLockUntilRef.current) return;
    if (scrollingSourceRef.current === "editor") return;

    const readerElem = containerRef.current;
    const view = editorViewRef.current;
    if (!readerElem || !view) return;

    scheduleSync({ source: "reader", scrollPos: readerElem.scrollTop, view });
  }, [syncEnabled, viewMode, navLockUntilRef, containerRef, scheduleSync]);

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

  // Keep the keyframe cache honest: watch everything that can move geometry
  // while scrolling, so the table can be rebuilt lazily instead of eagerly.
  useEffect(() => {
    if (viewMode !== "split") return undefined;
    const readerElem = containerRef.current;
    if (!readerElem) return undefined;

    // Anything may have changed while detached (modes were swapped); force the
    // next scroll to rebuild rather than trust a cache nobody maintained.
    markKeyframesDirty();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            markKeyframesDirty();
          })
        : null;

    const observeReaderTargets = () => {
      resizeObserver?.observe(readerElem);
      Array.from(readerElem.children).forEach((child) => resizeObserver?.observe(child));
    };

    // WHY childList-only, no subtree/attributes: observing the subtree while a
    // 2282-block preview re-renders makes the browser record thousands of
    // mutations and inflated the typing long task from ~90ms to ~200ms in the
    // 2-4 A/B measurement. Subtree content churn does not need recording
    // anyway: a source-driven re-render is preceded by the doc-length/lines
    // signal, and every lazy growth (mermaid, images, re-theme metrics)
    // changes a box size the ResizeObserver already watches. The direct
    // childList record stays because the <article> NODE is swapped when
    // documentKey remounts it (document switch) — the resize observer must be
    // re-targeted at the fresh children, or a growing new article would never
    // invalidate.
    const mutationObserver = new MutationObserver(() => {
      markKeyframesDirty();
      observeReaderTargets();
    });
    mutationObserver.observe(readerElem, { childList: true });
    observeReaderTargets();

    // Editor side: scrollDOM box changes on splitter/window resize; contentDOM
    // box changes when CodeMirror re-measures line blocks (typing already
    // flips the doc signal; re-wrap/re-theme/re-measure do not). A ResizeObserver
    // samples sizes once per frame and records no mutations, so it is safe on
    // CodeMirror's per-keystroke churn. The view is created in EditorPane's
    // effect (child runs first on mount) and EditorPane only mounts while
    // viewMode !== "read", so this effect re-runs on every view swap and sees
    // the live view here.
    const view = editorViewRef.current;
    if (view) {
      resizeObserver?.observe(view.scrollDOM);
      resizeObserver?.observe(view.contentDOM);
    }

    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [viewMode, containerRef, markKeyframesDirty]);

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
        const keyframes = getSyncKeyframes(view, readerElem);
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
  }, [viewMode, syncEnabled, containerRef, setLock, getSyncKeyframes]);

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => {
      clearLock();
      if (syncRafRef.current !== null) {
        window.cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
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
