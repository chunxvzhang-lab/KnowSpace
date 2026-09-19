import { create } from "zustand";
import type { TabItem } from "../components/TabBar";
import { samePath } from "../core/paths";

/**
 * Tab state: which documents are open, which one is active, and which one the
 * comparison pane is showing.
 *
 * This is the second slice of the App.tsx migration (R1 batch B1). Two things
 * shaped it:
 *
 * 1. **A tab does not store whether it is dirty.** The editor session holds one
 *    document at a time, so at most one tab can ever be dirty. Keeping the flag
 *    in the array meant a keystroke had to write into tab state: an effect
 *    compared five fields — four of them metadata and the fifth the dirty flag —
 *    purely to decide whether to bail out. Deriving it instead (see
 *    `tabsWithDirtyFlags`) deletes that path, so typing no longer touches tabs.
 *
 * 2. **Actions that only rearrange the array never run side effects.** App.tsx
 *    has to react to the result — which tab becomes active, whether the split
 *    pane survived — and React invokes a `set` updater twice under StrictMode to
 *    surface impure ones, so that work belongs outside. Hence the pure helpers
 *    below return the new array and the caller decides what follows.
 *
 * As with the UI store, App.tsx aliases these selectors to the identifiers the
 * `useState` calls used, so the call sites needed no changes.
 */

/**
 * A tab as stored.
 *
 * `TabItem` is this plus the dirty flag, which only exists at render time.
 */
export type TabMeta = {
  id: string;
  title: string;
  relativePath: string;
  absolutePath?: string;
};

/** How many recently visited documents are remembered. */
export const RECENT_DOC_LIMIT = 15;

/**
 * Index of the tab that represents `tab`, or -1.
 *
 * Matching goes by id, then by absolute path, then by title when **at most one**
 * side has a path. That order lets a document opened from disk find the tab it
 * already has, while a document created in-app — which has no path yet — still
 * finds its tab by title.
 *
 * "At most one" rather than "neither", and this comment said "neither" until a test
 * written against the comment failed against the code: the case the title clause
 * exists for is precisely the one where the sides differ — a tab that has a file and
 * a document that does not have one yet are the same document, and their paths can
 * never say so. Two documents that *both* have paths are told apart by their paths,
 * which is why a title match between those is not a match.
 */
export function findTabIndex(tabs: TabMeta[], tab: TabMeta): number {
  return tabs.findIndex(
    (candidate) =>
      candidate.id === tab.id ||
      samePath(candidate.absolutePath, tab.absolutePath) ||
      (candidate.title === tab.title && (!candidate.absolutePath || !tab.absolutePath))
  );
}

/**
 * The tabs after a document was opened at this chapter.
 *
 * The same list, unchanged, when that document is already open — opening the file
 * the reader already has in front of them should not grow a second tab for it. Which
 * is what `findTabIndex` answers, and the reason this defers to it rather than
 * repeating the comparison: there is one rule for "which tab is this document", and
 * everything that has to answer it asks the same question.
 */
export function tabsWithNewDocument(
  tabs: TabMeta[],
  chapter: { id: string; title: string; src: string; absolutePath?: string },
  absolutePath: string | undefined
): TabMeta[] {
  const tab: TabMeta = {
    id: chapter.id,
    title: chapter.title,
    relativePath: chapter.src,
    ...(absolutePath ? { absolutePath } : {}),
  };
  return findTabIndex(tabs, tab) === -1 ? [...tabs, tab] : tabs;
}

/**
 * Applies the session's dirty flag to the tab that owns it.
 *
 * Only the active tab can be dirty: the comparison pane renders a document
 * rather than editing one, and there is a single editing session. That makes
 * this a pure function of the flag, with no per-tab bookkeeping — which is the
 * whole point of not storing it.
 */
export function tabsWithDirtyFlags(
  tabs: TabMeta[],
  activeTabId: string,
  isDirty: boolean
): TabItem[] {
  return tabs.map((tab) => ({
    ...tab,
    isDirty: Boolean(isDirty) && tab.id === activeTabId,
  }));
}

/**
 * The tab that should take over once `closedId` is gone: the one that slides
 * into the closed tab's slot, or the new last tab.
 *
 * Returns null when nothing is left, which the caller reads as "close the
 * session too".
 */
export function nextActiveAfterClose(tabs: TabMeta[], closedId: string): string | null {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedId);
  const remaining = tabs.filter((tab) => tab.id !== closedId);
  if (remaining.length === 0) return null;
  const index = Math.min(Math.max(0, closedIndex), remaining.length - 1);
  return remaining[index].id;
}

/**
 * The tabs that survive closing everything to the right of `tabId`.
 *
 * Returns null when `tabId` is not open at all, which tells the caller to do
 * nothing at all — the same early return the inline version used to take before
 * it touched the split pane or the active tab.
 */
export function tabsAfterClosingRight(tabs: TabMeta[], tabId: string): TabMeta[] | null {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  return index === -1 ? null : tabs.slice(0, index + 1);
}

type TabState = {
  tabs: TabMeta[];
  /** The tab being read. App.tsx aliases this as `chapterId`. */
  activeTabId: string;
  dualSplitTabId: string | null;
  /**
   * Most recently visited documents, newest first.
   *
   * Read by the command palette, which offers them as a "recently opened"
   * section.
   */
  recentVisitedDocIds: string[];
};

type TabActions = {
  /**
   * Replaces the list.
   *
   * Accepts an updater as well as a value, because every call site that appends
   * a tab derived it from the previous list.
   */
  setTabs: (tabs: TabMeta[] | ((prev: TabMeta[]) => TabMeta[])) => void;
  /** Registers the active document's tab, or refreshes the one it already has. */
  ensureTab: (tab: TabMeta) => void;
  setActiveTabId: (id: string) => void;
  setDualSplitTabId: (id: string | null) => void;
  /** Moves a document to the front of the recent list, capped. */
  rememberVisitedDoc: (docId: string) => void;
};

export type TabStore = TabState & TabActions;

export const useTabStore = create<TabStore>()((set) => ({
  tabs: [],
  activeTabId: "",
  dualSplitTabId: null,
  recentVisitedDocIds: [],

  setTabs: (tabs) =>
    set((state) => ({ tabs: typeof tabs === "function" ? tabs(state.tabs) : tabs })),

  ensureTab: (tab) =>
    set((state) => {
      const index = findTabIndex(state.tabs, tab);
      if (index === -1) return { tabs: [...state.tabs, tab] };

      const existing = state.tabs[index];
      if (
        existing.id === tab.id &&
        existing.title === tab.title &&
        existing.relativePath === tab.relativePath &&
        existing.absolutePath === tab.absolutePath
      ) {
        // Returning the state object itself is what tells Zustand nothing
        // changed — an empty object would still allocate a new one and notify
        // every subscriber. This is the comparison the old effect made inline,
        // and it is why merely rendering a saved document no longer churns the
        // tab list.
        return state;
      }

      const tabs = state.tabs.slice();
      tabs[index] = { ...existing, ...tab };
      return { tabs };
    }),

  setActiveTabId: (id) => set({ activeTabId: id }),

  setDualSplitTabId: (id) => set({ dualSplitTabId: id }),

  rememberVisitedDoc: (docId) =>
    set((state) => {
      if (!docId) return state;
      const rest = state.recentVisitedDocIds.filter((id) => id !== docId);
      const next = [docId, ...rest].slice(0, RECENT_DOC_LIMIT);
      // Revisiting the document that is already at the front must not churn
      // subscribers, so the ordered comparison is on the whole list, not just
      // on membership.
      const unchanged =
        next.length === state.recentVisitedDocIds.length &&
        next.every((id, index) => id === state.recentVisitedDocIds[index]);
      return unchanged ? state : { recentVisitedDocIds: next };
    }),
}));
