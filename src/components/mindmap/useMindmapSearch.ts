import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { MindmapNode } from "../../core/types";
import type { MindmapSidecar } from "../../services/mindmapSidecar";
import type { MindmapLayoutResult } from "../../services/mindmapLayout";
import { searchMindmapNodes } from "../../services/mindmapService";
import { describeMindmapIcon } from "../../core/mindmapIcons";
import { iconFor } from "../../services/mindmapSidecar";

/**
 * The in-canvas search domain of the mindmap: the search field's state, the
 * match set, walking between matches, and "select all" — which lives here
 * because it is the search's sibling act of pointing at topics the reader
 * named rather than clicked.
 *
 * Extracted from MindmapView (batch 3, wave 2a of the decomposition). The
 * focus/selection setters and the container ref are threaded in rather than
 * owned: the viewport, the selection set and the container belong to the view.
 * `focusOnNode` is the hook's own helper — nothing outside the search domain
 * jumps to a node today.
 */
type UseMindmapSearchParams = {
  /** The tree, walked by the searcher — topic text is the primary index. */
  tree: MindmapNode;
  /** The companion file, read so a topic is findable by the icon it wears. */
  sidecar: MindmapSidecar | null;
  /** The laid-out nodes, looked up to frame a match in the viewport. */
  layout: MindmapLayoutResult;
  /** The scrollable container, measured to centre a match. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Viewport writer used to bring a match to the middle of the canvas. */
  setTransform: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>;
  /** Selection writer used to mark the match (and everyone, for select-all). */
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
};

export function useMindmapSearch({
  tree,
  sidecar,
  layout,
  containerRef,
  setTransform,
  setSelectedNodeIds,
}: UseMindmapSearchParams) {
  // In-canvas search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const focusOnNode = useCallback(
    (nodeId: string) => {
      if (!layout || !containerRef.current) return;
      const target = layout.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const cWidth = containerRef.current.clientWidth;
      const cHeight = containerRef.current.clientHeight;
      const targetCenterX = target.x + target.width / 2;
      const targetCenterY = target.y + target.height / 2;
      setTransform((prev) => ({
        ...prev,
        x: Math.round(cWidth / 2 - targetCenterX * prev.scale),
        y: Math.round(cHeight / 2 - targetCenterY * prev.scale),
      }));
      setSelectedNodeIds(new Set([nodeId]));
    },
    [layout, containerRef, setTransform, setSelectedNodeIds],
  );

  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (!q.trim()) {
        setSearchMatchIds([]);
        setCurrentSearchIndex(0);
        return;
      }
      // Two things are searchable: the words in the topics, and the type a topic wears.
      // The types live in the companion file, so only this side can name them — and being
      // findable by name is half of what makes the row of icons a way to ask "what is
      // still open in this map" instead of a row of pictures.
      const matches = searchMindmapNodes(tree, q, (nodeId) =>
        describeMindmapIcon(iconFor(sidecar, nodeId)),
      );
      setSearchMatchIds(matches);
      setCurrentSearchIndex(0);
      if (matches.length > 0) {
        focusOnNode(matches[0]);
      }
    },
    [focusOnNode, sidecar, tree],
  );

  const handleNextSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % searchMatchIds.length;
    setCurrentSearchIndex(nextIdx);
    focusOnNode(searchMatchIds[nextIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  const handlePrevSearch = useCallback(() => {
    if (searchMatchIds.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
    setCurrentSearchIndex(prevIdx);
    focusOnNode(searchMatchIds[prevIdx]);
  }, [currentSearchIndex, focusOnNode, searchMatchIds]);

  /**
   * Closes the search and clears it.
   *
   * One callback rather than the same three setters written out at each of the
   * four places that dismiss the search — the field's Escape, its close button,
   * the canvas Escape and now the extracted group. Clearing the query on close
   * is part of it: leaving it behind means reopening shows stale matches with
   * no focused node, which reads as the search being broken.
   */
  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchMatchIds([]);
    setCurrentSearchIndex(0);
  }, []);

  // Select all nodes handler
  const handleSelectAll = useCallback(() => {
    if (!layout || layout.nodes.length === 0) return;
    setSelectedNodeIds(new Set(layout.nodes.map((n) => n.id)));
  }, [layout, setSelectedNodeIds]);

  return {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    searchMatchIds,
    currentSearchIndex,
    /** Attached to the search field so Ctrl+F and the toolbar toggle can focus it. */
    searchInputRef,
    handleSearch,
    handleNextSearch,
    handlePrevSearch,
    handleCloseSearch,
    handleSelectAll,
  };
}
