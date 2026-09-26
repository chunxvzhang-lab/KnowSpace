import { useCallback, useRef, useEffect } from "react";
import { EditorView } from "@codemirror/view";

type SyncSelectionOptions = {
  containerRef: React.RefObject<HTMLElement | null>;
  viewMode: string;
  editorViewRef: React.RefObject<EditorView | null>;
};

/**
 * Finds all elements in the preview container that overlap with the given line range.
 */
export function findMatchingPreviewElements(
  container: HTMLElement,
  startLine: number,
  endLine: number
): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-line]")
  );

  const rawMatched: HTMLElement[] = [];

  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    const rawStart = el.getAttribute("data-source-line");
    if (!rawStart) continue;

    const elemStart = parseInt(rawStart, 10);
    if (Number.isNaN(elemStart)) continue;

    const rawEnd = el.getAttribute("data-source-line-end");
    const elemEnd = rawEnd ? parseInt(rawEnd, 10) : elemStart;

    // Check interval overlap: [startLine, endLine] intersects with [elemStart, elemEnd]
    if (Math.max(startLine, elemStart) <= Math.min(endLine, elemEnd)) {
      rawMatched.push(el);
    }
  }

  // Filter out ancestor elements if any of their descendants are also matched.
  // This avoids double-highlighting container blocks (e.g. <ol>, <ul>, <table>, <blockquote>)
  // when an inner child element (e.g. <li>, <p>, <tr>) is already matched and highlighted.
  const filtered = rawMatched.filter((el) => {
    return !rawMatched.some((other) => other !== el && el.contains(other));
  });

  const finalMatched = filtered.length > 0 ? filtered : rawMatched;

  // For a single-line cursor (startLine === endLine), pick only the tightest/innermost matching element
  if (startLine === endLine && finalMatched.length > 1) {
    let bestElem = finalMatched[0];
    let minSpan = Infinity;
    for (const el of finalMatched) {
      const s = parseInt(el.getAttribute("data-source-line") || "0", 10);
      const e = parseInt(el.getAttribute("data-source-line-end") || String(s), 10);
      const span = Math.max(0, e - s);
      if (span < minSpan) {
        minSpan = span;
        bestElem = el;
      }
    }
    return [bestElem];
  }

  return finalMatched;
}

/**
 * Clears highlight from all elements in the container.
 */
export function clearAllHighlights(container: HTMLElement): void {
  const activeElements = container.querySelectorAll(".sync-highlight-active, .search-highlight-active");
  activeElements.forEach((el) => {
    el.classList.remove("sync-highlight-active");
    el.classList.remove("search-highlight-active");
  });
}

export function useSyncSelection({
  containerRef,
  viewMode,
  editorViewRef,
}: SyncSelectionOptions) {
  const lockRef = useRef<"editor" | "preview" | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const highlightRafRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  const setLock = useCallback((source: "editor" | "preview") => {
    lockRef.current = source;
    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
    }
    lockTimerRef.current = window.setTimeout(() => {
      lockRef.current = null;
      lockTimerRef.current = null;
    }, 150);
  }, []);

  // 1. Editor -> Preview Highlight & Scroll Sync
  const handleEditorSelectionChange = useCallback(
    (view: EditorView) => {
      if (viewMode !== "split") return;
      if (lockRef.current === "preview") return;

      const readerElem = containerRef.current;
      if (!readerElem) return;

      const selection = view.state.selection.main;
      const doc = view.state.doc;
      if (doc.length === 0) return;

      const from = Math.min(selection.from, selection.to);
      const to = Math.max(selection.from, selection.to);

      const startLine = doc.lineAt(from).number;
      const endLine = doc.lineAt(to).number;

      setLock("editor");

      // Batch DOM operations with requestAnimationFrame to prevent layout thrashing and scroll jitter
      if (highlightRafRef.current) {
        cancelAnimationFrame(highlightRafRef.current);
      }

      highlightRafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        clearAllHighlights(containerRef.current);

        const matched = findMatchingPreviewElements(containerRef.current, startLine, endLine);
        if (matched.length > 0) {
          matched.forEach((el) => {
            el.classList.add("sync-highlight-active");
          });
        }
      });
    },
    [viewMode, containerRef, setLock]
  );

  // 2. Preview -> Editor Selection Sync
  const handlePreviewSelectionChange = useCallback(
    (targetElement: HTMLElement, selectedText = "") => {
      if (viewMode !== "split") return;
      if (lockRef.current === "editor") return;

      const view = editorViewRef.current;
      const readerElem = containerRef.current;
      if (!view || !readerElem) return;

      const blockElem = targetElement.closest<HTMLElement>("[data-source-line]");
      if (!blockElem) return;

      const rawStart = blockElem.getAttribute("data-source-line");
      if (!rawStart) return;

      const startLine = parseInt(rawStart, 10);
      if (Number.isNaN(startLine) || startLine < 1) return;

      const rawEnd = blockElem.getAttribute("data-source-line-end");
      const endLine = rawEnd ? parseInt(rawEnd, 10) : startLine;

      setLock("preview");

      // Highlight clicked block in preview immediately
      clearAllHighlights(readerElem);
      blockElem.classList.add("sync-highlight-active");

      const doc = view.state.doc;
      const totalLines = doc.lines;
      const safeStartLine = Math.min(Math.max(1, startLine), totalLines);
      const safeEndLine = Math.min(Math.max(safeStartLine, endLine), totalLines);

      const lineObj = doc.line(safeStartLine);
      let targetFrom = lineObj.from;
      let targetTo = lineObj.from; // Default to collapsed cursor at line start

      const cleanSelection = selectedText.trim();
      if (cleanSelection.length >= 2) {
        // If user explicitly selected text, locate the exact character range
        const searchScopeStart = doc.line(Math.max(1, safeStartLine - 1)).from;
        const searchScopeEnd = doc.line(Math.min(totalLines, safeEndLine + 1)).to;
        const scopeText = doc.sliceString(searchScopeStart, searchScopeEnd);

        const foundIndex = scopeText.indexOf(cleanSelection);
        if (foundIndex !== -1) {
          targetFrom = searchScopeStart + foundIndex;
          targetTo = targetFrom + cleanSelection.length;
        } else {
          // If markdown markup doesn't match plain text, collapse to line start
          targetFrom = lineObj.from;
          targetTo = lineObj.from;
        }
      }

      view.dispatch({
        selection: { anchor: targetFrom, head: targetTo },
        effects: EditorView.scrollIntoView(targetFrom, { y: "nearest" }),
      });
    },
    [viewMode, editorViewRef, containerRef, setLock]
  );

  // Clear highlight when exiting split mode
  useEffect(() => {
    if (viewMode !== "split" && containerRef.current) {
      clearAllHighlights(containerRef.current);
    }
  }, [viewMode, containerRef]);

  // Cleanup timers and RAF on unmount
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) {
        window.clearTimeout(lockTimerRef.current);
      }
      if (highlightRafRef.current) {
        cancelAnimationFrame(highlightRafRef.current);
      }
      if (scrollTimeoutRef.current) {
        // Not a React-rendered node: the ref holds a timer id, and the cleanup
        // must read the latest id at unmount to clear whatever is still pending.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reading ref.current in cleanup is intentional here
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleEditorSelectionChange,
    handlePreviewSelectionChange,
    clearAllHighlights: () => {
      if (containerRef.current) clearAllHighlights(containerRef.current);
    },
  };
}
