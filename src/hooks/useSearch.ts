import { useCallback, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import {
  extractHeadingsFromSource,
  findHeadingLineInSource,
  findInChapter,
} from "../services/markdown";
import { searchVault } from "../services/searchIndexService";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { RenderedChapter, SearchResult } from "../core/types";
import type { DocumentSessionState } from "./useDocumentSession";

/**
 * A jump waiting for its document to finish loading.
 *
 * Exported so App.tsx can keep owning the ref with the same shape: the reading
 * position restore there reads and clears it too.
 */
export type PendingNavigation = {
  headingId?: string;
  lineNumber?: number;
  highlight?: boolean;
  searchResult?: SearchResult;
};

/**
 * Search: running the query, jumping to a hit, and highlighting it.
 *
 * Fourth logic hook out of App.tsx (R1 batch B3b-4) and the largest cluster to
 * leave so far. It spans two regions of the component — the results memo and
 * the navigation callbacks — which is why they move together: the callbacks
 * read the memo, and splitting them would mean threading the results through a
 * parameter for no reason.
 *
 * Four things are passed in rather than reached for, all of them shared with
 * parts of App.tsx that are not about searching:
 *
 * - `renderedChapter` and `session` come from the editing session.
 * - `editorViewRef` and `readerRef` are the two scroll surfaces. Highlighting
 *   and jumping both need to reach whichever one is showing, and the reading
 *   position restore in App.tsx scrolls the same two.
 * - `selectChapterRef` lets a hit in another document navigate there through
 *   App's unsaved-changes guard rather than bypassing it.
 * - `setActiveHeadingId` tracks the reader's position, which stays in App.tsx
 *   because it describes the rendered document rather than the search.
 */

type UseSearchParams = {
  renderedChapter: RenderedChapter | null;
  session: DocumentSessionState["session"];
  /** Which pane is showing, because a jump scrolls a different surface for each. */
  viewMode: DocumentSessionState["viewMode"];
  editorViewRef: { current: EditorView | null };
  readerRef: { current: HTMLElement | null };
  selectChapterRef: { current: (chapterId: string) => void };
  setActiveHeadingId: (headingId: string | undefined) => void;
  /** Until this timestamp, scroll-driven heading updates are suppressed. */
  navLockUntilRef: { current: number };
  /** A jump waiting for its document to load, shared with the restore effect. */
  pendingNavigationRef: { current: PendingNavigation | null };
};

export function useSearch({
  renderedChapter,
  session,
  viewMode,
  editorViewRef,
  readerRef,
  selectChapterRef,
  setActiveHeadingId,
  navLockUntilRef,
  pendingNavigationRef,
}: UseSearchParams) {
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const searchScope = useVaultStore((s) => s.searchScope);
  const vaultSearchIndex = useVaultStore((s) => s.vaultSearchIndex);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);
  const setActiveSearchMatchId = useVaultStore((s) => s.setActiveSearchMatchId);

  // Whether the results are on screen at all — the side panel is showing them,
  // or the command palette is.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);

  const chapterId = useTabStore((s) => s.activeTabId);

  const isSearchActive = (sidebarOpen && sidebarTab === "search") || commandPaletteOpen;
  const searchResults = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !isSearchActive) return [];
    if (searchScope === "vault") {
      return searchVault(vaultSearchIndex, trimmed);
    }
    return renderedChapter
      ? findInChapter(trimmed, renderedChapter.plainText, renderedChapter.headings, session?.source)
      : [];
  }, [searchScope, vaultSearchIndex, searchQuery, isSearchActive, renderedChapter, session?.source]);

  const jumpToHeading = useCallback(
    (headingId: string, behavior: ScrollBehavior = "smooth", highlight: boolean = false) => {
      setActiveHeadingId(headingId);

      // Lock sync-scroll and reading tracker during navigation animation to eliminate jitter and feedback loops
      const lockDuration = behavior === "smooth" ? 850 : 100;
      navLockUntilRef.current = Date.now() + lockDuration;

      const allHeadings = renderedChapter?.headings?.length
        ? renderedChapter.headings
        : session?.source
          ? extractHeadingsFromSource(session.source)
          : [];
      const heading = allHeadings.find(
        (h) => h.id === headingId || h.text.trim().toLowerCase() === headingId.trim().toLowerCase()
      );

      // 1. If Reader pane is present (read or split mode), scroll preview accurately and scoped
      const container = readerRef.current;
      if (container) {
        const cleanBlockId = headingId.replace(/^[#^]+/, "");
        const isBlockJump = headingId.startsWith("^") || headingId.includes("^") || cleanBlockId.length > 0;
        let target =
          container.querySelector<HTMLElement>(`[data-heading-id="${CSS.escape(headingId)}"]`) ||
          container.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`) ||
          container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(cleanBlockId)}"]`) ||
          container.querySelector<HTMLElement>(`[id="^${CSS.escape(cleanBlockId)}"]`) ||
          container.querySelector<HTMLElement>(`#${CSS.escape(cleanBlockId)}`);

        if (!target) {
          const headingsInDom = Array.from(container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
          target =
            headingsInDom.find(
              (el) =>
                el.id === headingId ||
                el.getAttribute("data-heading-id") === headingId ||
                el.textContent?.trim().toLowerCase() === headingId.toLowerCase()
            ) || null;
        }

        if (!target && heading?.line) {
          target = container.querySelector<HTMLElement>(`[data-source-line="${heading.line}"]`);
        }

        if (!target && heading?.text) {
          const headingsInDom = Array.from(container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
          target = headingsInDom.find((el) => el.textContent?.trim() === heading.text.trim()) || null;
        }

        if (target) {
          const blockParent = target.closest<HTMLElement>(
            "p, li, blockquote, tr, pre, .task-list-item, div.admonition, figure"
          );
          const scrollTarget = blockParent || target;
          const containerRect = container.getBoundingClientRect();
          const targetRect = scrollTarget.getBoundingClientRect();
          const targetTop = container.scrollTop + (targetRect.top - containerRect.top);
          container.scrollTo({
            top: Math.max(0, targetTop - 32),
            behavior,
          });

          // Focus pulse glow animation only when explicitly requested (e.g. jumping to a block or wikilink anchor)
          // Never trigger on document open or silent reading position restoration
          if (highlight) {
            scrollTarget.classList.add("jump-target-pulse");
            if (target !== scrollTarget) {
              target.classList.add("jump-target-pulse");
            }
            window.setTimeout(() => {
              scrollTarget?.classList.remove("jump-target-pulse");
              target?.classList.remove("jump-target-pulse");
            }, 1600);
          }
        } else if (isBlockJump) {
          // DOM rendering delay fallback protection (e.g. during chapter switch)
          window.setTimeout(() => {
            if (!readerRef.current) return;
            const retryContainer = readerRef.current;
            const retryTarget =
              retryContainer.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(cleanBlockId)}"]`) ||
              retryContainer.querySelector<HTMLElement>(`[id="^${CSS.escape(cleanBlockId)}"]`) ||
              retryContainer.querySelector<HTMLElement>(`#${CSS.escape(cleanBlockId)}`);
            if (retryTarget) {
              const retryParent = retryTarget.closest<HTMLElement>(
                "p, li, blockquote, tr, pre, .task-list-item, div.admonition, figure"
              );
              const retryScroll = retryParent || retryTarget;
              const cRect = retryContainer.getBoundingClientRect();
              const tRect = retryScroll.getBoundingClientRect();
              const tTop = retryContainer.scrollTop + (tRect.top - cRect.top);
              retryContainer.scrollTo({
                top: Math.max(0, tTop - 32),
                behavior,
              });
              if (highlight) {
                retryScroll.classList.add("jump-target-pulse");
                if (retryTarget !== retryScroll) retryTarget.classList.add("jump-target-pulse");
                window.setTimeout(() => {
                  retryScroll?.classList.remove("jump-target-pulse");
                  retryTarget?.classList.remove("jump-target-pulse");
                }, 1600);
              }
            }
          }, 80);
        }
      }

      // 2. If Editor pane is present (source or split mode), scroll editor directly to heading or block line
      const editor = editorViewRef.current;
      if (editor && session?.source) {
        if (headingId.startsWith("^") || headingId.includes("^")) {
          const cleanBlockId = headingId.replace(/^[#^]+/, "");
          const content = editor.state.doc.toString();
          const idx = content.indexOf(`^${cleanBlockId}`);
          if (idx !== -1) {
            const line = editor.state.doc.lineAt(idx);
            editor.dispatch({
              selection: { anchor: line.from, head: line.to },
              effects: EditorView.scrollIntoView(line.from, { y: "center", yMargin: 40 }),
            });
            if (viewMode === "source") {
              editor.focus();
            }
          }
        } else if (heading) {
          const lineNum = findHeadingLineInSource(session.source, heading);
          if (lineNum > 0) {
            const totalLines = editor.state.doc.lines;
            const safeLineNum = Math.min(Math.max(1, lineNum), totalLines);
            const line = editor.state.doc.line(safeLineNum);
            editor.dispatch({
              selection: { anchor: line.from, head: line.from },
              effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 40 }),
            });
            if (viewMode === "source") {
              editor.focus();
            }
          }
        }
      }
    },
    [renderedChapter?.headings, session?.source, viewMode]
  );

  const jumpToRatio = useCallback((ratio: number) => {
    const container = readerRef.current;
    if (!container) return;
    const max = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: Math.max(0, max * ratio), behavior: "smooth" });
  }, []);

  const clearSearchHighlights = useCallback(() => {
    // 1. Globally remove all search and sync highlight classes across document
    const activeHighlights = document.querySelectorAll(".search-highlight-active, .sync-highlight-active");
    activeHighlights.forEach((el) => {
      el.classList.remove("search-highlight-active");
      el.classList.remove("sync-highlight-active");
      (el as HTMLElement).style.animation = "";
    });

    // 2. Globally restore all search mark tags back to plain text
    const marks = document.querySelectorAll("mark.search-keyword-match");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
      }
    });
  }, []);

  const highlightKeywordsInNode = useCallback((root: HTMLElement, query: string) => {
    if (!query || !query.trim()) return;
    const q = query.trim();
    const qLower = q.toLowerCase();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (
        node.parentElement?.tagName.toLowerCase() === "mark" &&
        node.parentElement.classList.contains("search-keyword-match")
      ) {
        continue;
      }
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(qLower)) {
        textNodes.push(node as Text);
      }
    }

    for (const textNode of textNodes) {
      const parent = textNode.parentNode;
      if (!parent) continue;
      const text = textNode.nodeValue || "";
      const textLower = text.toLowerCase();
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let idx = 0;

      while ((idx = textLower.indexOf(qLower, lastIndex)) !== -1) {
        if (idx > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
        }
        const mark = document.createElement("mark");
        mark.className = "search-keyword-match";
        mark.textContent = text.slice(idx, idx + q.length);
        fragment.appendChild(mark);
        lastIndex = idx + q.length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      parent.replaceChild(fragment, textNode);
    }
  }, []);

  const handleSearchJump = useCallback((result: SearchResult) => {
    setActiveSearchMatchId(result.id ?? `match-${result.index}`);

    if (result.chapterId && result.chapterId !== chapterId) {
      pendingNavigationRef.current = {
        headingId: result.headingId,
        lineNumber: result.lineNumber,
        highlight: true,
        searchResult: result,
      };
      selectChapterRef.current(result.chapterId);
      return;
    }

    // If editor is active, scroll editor to matching line
    if (editorViewRef.current && result.lineNumber) {
      const editor = editorViewRef.current;
      const totalLines = editor.state.doc.lines;
      const safeLineNum = Math.min(Math.max(1, result.lineNumber), totalLines);
      const line = editor.state.doc.line(safeLineNum);
      editor.dispatch({
        selection: { anchor: line.from, head: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 40 }),
      });
      if (viewMode === "source") {
        editor.focus();
      }
    }

    const container = readerRef.current;
    if (!container) return;

    // 1. Immediately wipe all previous highlights and marks across the whole DOM
    clearSearchHighlights();

    let targetElement: HTMLElement | null = null;
    const queryText = (result.matchedText || searchQuery || "").trim().toLowerCase();

    // 2. Try finding by source line number
    if (result.lineNumber) {
      const lineElements = Array.from(container.querySelectorAll<HTMLElement>("[data-source-line]"));
      const targetStart = result.lineNumber;
      const targetEnd = result.lineEndNumber ?? targetStart;

      const matched = lineElements.filter((el) => {
        const start = parseInt(el.getAttribute("data-source-line") || "0", 10);
        const end = parseInt(el.getAttribute("data-source-line-end") || String(start), 10);
        return Math.max(targetStart, start) <= Math.min(targetEnd, end);
      });

      if (matched.length > 0) {
        // Priority 1: Check if there is an overarching block container (ol, ul, blockquote, pre, table, p)
        // that encompasses the list/paragraph block
        const containerBlock = matched.find((el) => {
          const tag = el.tagName.toLowerCase();
          return (
            ["ol", "ul", "blockquote", "pre", "table", "p"].includes(tag) &&
            matched.some((child) => child !== el && el.contains(child))
          );
        });

        // Priority 2: If there's an overarching container, highlight the entire broad block!
        // Otherwise, if any matched item directly contains the queryText, prefer it; else use matched[0]
        if (containerBlock) {
          targetElement = containerBlock;
        } else {
          targetElement =
            matched.find((el) => queryText && el.textContent?.toLowerCase().includes(queryText)) || matched[0];
        }
      }
    }

    // 3. Fallback: Search by content/excerpt matching
    if (!targetElement && queryText) {
      const candidateBlocks = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".markdown-body p, .markdown-body ol, .markdown-body ul, .markdown-body li, .markdown-body blockquote, .markdown-body pre, .markdown-body table, .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6"
        )
      );
      targetElement = candidateBlocks.find((el) => el.textContent?.toLowerCase().includes(queryText)) || null;
    }

    // 4. Fallback: Search by headingId
    if (!targetElement && result.headingId) {
      targetElement = container.querySelector(`#${CSS.escape(result.headingId)}`);
    }

    if (targetElement) {
      // Highlight the entire broad block ("大片对应文段")
      targetElement.classList.add("search-highlight-active");

      // Highlight all matching keywords inside the block
      highlightKeywordsInNode(targetElement, searchQuery);

      // Determine the best scroll target: if a keyword was marked inside, center on the first mark
      const firstMark = targetElement.querySelector("mark.search-keyword-match") as HTMLElement | null;
      const scrollAnchor = firstMark || targetElement;

      const containerRect = container.getBoundingClientRect();
      const elRect = scrollAnchor.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 3;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });

      // Trigger pulse animation
      targetElement.style.animation = "none";
      void targetElement.offsetHeight; // Force reflow
      targetElement.style.animation = "searchPulse 1.8s cubic-bezier(0.16, 1, 0.3, 1)";
    } else {
      jumpToRatio(result.index / Math.max(1, renderedChapter?.plainText.length ?? 1));
    }
  }, [clearSearchHighlights, highlightKeywordsInNode, jumpToRatio, renderedChapter, searchQuery, chapterId]);
  return {
    searchResults,
    jumpToHeading,
    jumpToRatio,
    clearSearchHighlights,
    handleSearchJump,
  };
}
