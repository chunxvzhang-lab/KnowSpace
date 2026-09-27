import { useCallback, useMemo, useState } from "react";
import { filterGraphData, type GraphData } from "../../services/graphService";

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
 */
export function useGraphFilters({ graphData, currentDocId }: UseGraphFiltersParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hideIsolates, setHideIsolates] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "chapter" | "space">("all");
  const [hopDepth, setHopDepth] = useState<"all" | 1 | 2>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "hubs" | "orphans">("all");
  const [clusterByFolder, setClusterByFolder] = useState(false);
  const [crossFolderOnly, setCrossFolderOnly] = useState(false);

  // Compute filtered dataset
  const filteredData = useMemo(() => {
    return filterGraphData(graphData, {
      hideIsolates,
      query: searchQuery,
      typeFilter,
      depth: hopDepth,
      currentDocId,
      viewFilter,
      clusterByFolder,
      crossFolderOnly,
    });
  }, [
    graphData,
    hideIsolates,
    searchQuery,
    typeFilter,
    hopDepth,
    currentDocId,
    viewFilter,
    clusterByFolder,
    crossFolderOnly,
  ]);

  const clearForFocus = useCallback(() => {
    if (hideIsolates) setHideIsolates(false);
    if (searchQuery) setSearchQuery("");
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
    filteredData,
    clearForFocus,
  };
}
