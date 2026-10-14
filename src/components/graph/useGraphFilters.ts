import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterGraphData,
  type FilteredGraphData,
  type GraphData,
} from "../../services/graphService";

type UseGraphFiltersParams = {
  /** The full graph built from the backlink index; the raw input to every filter. */
  graphData: GraphData;
  /** The active document, threaded into `filterGraphData` for depth/orphan handling. */
  currentDocId?: string | null;
};

/**
 * The seven graph filter states and the dataset they produce.
 *
 * Extracted verbatim from GraphViewPane (decomposition of the pane): the state
 * declarations, the `filteredData` memo and its dependency array are the
 * originals. `filteredData` is the only input the Cytoscape init effect re-runs
 * on, so its memo identity is load-bearing — it changes exactly when one of the
 * seven filters, the source graph or the active document changes, never
 * otherwise.
 *
 * `clearForFocus` is the rollback `handleFocusActive` performs when the active
 * document is invisible under the current filters: un-hide isolates, drop the
 * search query, reset the type filter — each only when it is actually hiding
 * something, in that order, all synchronously before the caller schedules its
 * deferred refocus. The guards are the original inline conditions, moved; the
 * caller (GraphViewPane) schedules the 60ms refocus itself, so the contract
 * "mutate the filters now, the canvas re-inits, then refocus" is preserved.
 *
 * ── Two changes on top of that (2026-10-14, graph performance work) ──────────
 *
 * 1. THE SEARCH BOX IS DEBOUNCED. `filteredData` is the init effect's only
 *    dependency, and the init effect destroys and rebuilds the whole Cytoscape
 *    instance — new elements, new force layout — every time its identity
 *    changes. Typing "架构" used to rebuild the graph twice, once per keystroke:
 *    at 800 nodes that is a 405ms synchronous layout each, so the input lagged
 *    behind the cursor by most of a second. The input's own value stays
 *    immediate (`searchQuery`, still what the text field is bound to), and only
 *    the value that reaches `filterGraphData` is deferred. `clearForFocus`
 *    flushes it so the focus button still rolls the query back at once.
 *
 * 2. THE RENDERED NODE COUNT IS CAPPED (`maxNodes`), because a graph that is
 *    too large to lay out in a frame is a graph the user cannot use at all.
 *    This is a degradation, not a silent truncation: `filterGraphData` keeps the
 *    most connected nodes deterministically and reports how many it left out,
 *    and `GraphPaneHeader` shows that number. Turn the cap off in the filter
 *    drawer to see every node.
 */

/**
 * How long the search box waits before it is allowed to rebuild the canvas.
 *
 * 180ms is below the ~200ms threshold where a UI stops feeling immediate, and
 * comfortably above the ~120ms of a fast typist's keystroke gap, so a burst of
 * typing collapses into one rebuild instead of one per character.
 */
const SEARCH_DEBOUNCE_MS = 180;

/**
 * Default ceiling on rendered nodes.
 *
 * Above this the layout's own cost — even with the Barnes-Hut repulsion — stops
 * fitting in a frame, and the labels stop being legible anyway. 1,500 nodes is
 * roughly the point where a canvas graph is still a map rather than a hairball;
 * the cap keeps the pane interactive and the header states the omission.
 */
export const DEFAULT_MAX_GRAPH_NODES = 1500;

export function useGraphFilters({ graphData, currentDocId }: UseGraphFiltersParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hideIsolates, setHideIsolates] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "chapter" | "space">("all");
  const [hopDepth, setHopDepth] = useState<"all" | 1 | 2>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "hubs" | "orphans">("all");
  const [clusterByFolder, setClusterByFolder] = useState(false);
  const [crossFolderOnly, setCrossFolderOnly] = useState(false);
  const [limitNodes, setLimitNodes] = useState(true);

  // The deferred copy of the query; this is what the filter actually reads.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (searchQuery === debouncedQuery) return;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      setDebouncedQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [searchQuery, debouncedQuery]);

  // Compute filtered dataset
  const filteredData: FilteredGraphData = useMemo(() => {
    return filterGraphData(graphData, {
      hideIsolates,
      query: debouncedQuery,
      typeFilter,
      depth: hopDepth,
      currentDocId,
      viewFilter,
      clusterByFolder,
      crossFolderOnly,
      maxNodes: limitNodes ? DEFAULT_MAX_GRAPH_NODES : undefined,
    });
  }, [
    graphData,
    hideIsolates,
    debouncedQuery,
    typeFilter,
    hopDepth,
    currentDocId,
    viewFilter,
    clusterByFolder,
    crossFolderOnly,
    limitNodes,
  ]);

  const clearForFocus = useCallback(() => {
    if (hideIsolates) setHideIsolates(false);
    if (searchQuery) {
      setSearchQuery("");
      // The focus flow reads `filteredData` on a 60ms timer, which is shorter
      // than the debounce window — so the rollback has to land now, not later.
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setDebouncedQuery("");
    }
    if (typeFilter !== "all") setTypeFilter("all");
  }, [hideIsolates, searchQuery, typeFilter]);

  return {
    searchQuery,
    setSearchQuery,
    hideIsolates,
    setHideIsolates,
    typeFilter,
    setTypeFilter,
    hopDepth,
    setHopDepth,
    viewFilter,
    setViewFilter,
    clusterByFolder,
    setClusterByFolder,
    crossFolderOnly,
    setCrossFolderOnly,
    limitNodes,
    setLimitNodes,
    /** True while the search box holds a value the canvas has not rebuilt for yet. */
    isSearchPending: searchQuery !== debouncedQuery,
    filteredData,
    clearForFocus,
  };
}
