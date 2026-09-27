import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { MindmapNode } from "../../core/types";
import {
  DEFAULT_THEME_ID,
  MINDMAP_THEMES,
  resolveThemeId,
  type MindmapTheme,
} from "../../core/mindmapThemes";
import { DEFAULT_LAYOUT_ID, resolveLayoutId } from "../../services/mindmapLayout";
import { numberingFor } from "../../core/mindmapNumbering";
import {
  loadMindmapTheme,
  saveMindmapTheme,
  loadMindmapLayout,
  saveMindmapLayout,
  loadMindmapNumbering,
  saveMindmapNumbering,
} from "../../services/storage";

/**
 * The per-document look & feel of the mindmap: the theme, the layout and the
 * outline-numbering switch the reader picks — each remembered under the
 * document's own key — the values the canvas draws from (`activeThemeId`,
 * `mindmapTheme`, `numbering`), and the responsive breakpoints the container
 * class and the toolbar listen to.
 *
 * Extracted from MindmapView (batch 3, wave 2a of the decomposition). The
 * pick/persist handlers keep their write-on-deliberate-choice shape: the load
 * effects deliberately have no matching save effects, because a view state is
 * written only when the reader actually chooses one.
 */
type UseMindmapAppearanceParams = {
  /**
   * Identifies the document whose theme, layout and numbering are being shown.
   *
   * A path, from the caller that has one. Omitted means these choices are not
   * persisted for this mind map, which is the right behaviour for a preview
   * with no file behind it.
   */
  documentKey?: string;
  /**
   * The appearance the map falls back to for anything a node has not styled
   * itself. Defaults to the classic theme, so a caller that has not been taught
   * about themes yet still renders as it always did.
   */
  themeId?: string;
  /** The scrollable container; the ResizeObserver reads its width for the breakpoints. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The tree, walked by the numbering builder — its structure only, never the layout. */
  tree: MindmapNode;
};

export function useMindmapAppearance({
  documentKey,
  themeId,
  containerRef,
  tree,
}: UseMindmapAppearanceParams) {
  /**
   * The theme the reader picked, or null while the document's own is unknown.
   *
   * Null is a real state rather than a placeholder: it means nobody has chosen
   * for this document yet, so the stored value — or the caller's prop, or the
   * default — applies. Collapsing that into a single string would lose the
   * difference between "this document says dark" and "dark is what we fall back
   * to", and the first is what has to be written back unchanged.
   */
  const [pickedThemeId, setPickedThemeId] = useState<string | null>(null);

  // Load the document's theme when the document changes. Unlike the folds,
  // there is no matching save effect, so no guard is needed here: the write
  // happens in the handler below, which only runs on a deliberate choice.
  useEffect(() => {
    setPickedThemeId(documentKey ? loadMindmapTheme(documentKey) : null);
  }, [documentKey]);

  const activeThemeId = resolveThemeId(pickedThemeId ?? themeId ?? DEFAULT_THEME_ID);
  const mindmapTheme: MindmapTheme = MINDMAP_THEMES[activeThemeId];

  const handlePickTheme = useCallback(
    (next: string) => {
      setPickedThemeId(next);
      // Only a document with a path can be remembered. A preview of unsaved
      // text has nowhere to file the choice, and inventing a key for it would
      // mean every such preview shared one.
      if (documentKey) saveMindmapTheme(documentKey, next);
    },
    [documentKey],
  );

  /**
   * The layout the reader picked, or null while the document's own is unknown.
   *
   * Same shape as the theme above, and for the same reason: null means "nobody
   * has chosen for this document", which is not the same as "this document chose
   * the default", and the deliberate choice has to survive a round trip as
   * itself. There is no caller-supplied prop to fall back to — a layout has no
   * equivalent of the theme's frontmatter, and inventing one would be a second
   * source of truth for a value only this view reads.
   */
  const [pickedLayoutId, setPickedLayoutId] = useState<string | null>(null);

  useEffect(() => {
    setPickedLayoutId(documentKey ? loadMindmapLayout(documentKey) : null);
  }, [documentKey]);

  const activeLayoutId = resolveLayoutId(pickedLayoutId ?? DEFAULT_LAYOUT_ID);

  const handlePickLayout = useCallback(
    (next: string) => {
      setPickedLayoutId(next);
      // A layout is a property of the document, like the theme, so it is filed
      // under the same key. A preview with no path behind it cannot be
      // remembered, and inventing a key would make all such previews share one.
      if (documentKey) saveMindmapLayout(documentKey, next);
    },
    [documentKey],
  );

  /**
   * Whether outline numbers are drawn beside the nodes.
   *
   * A view state, remembered per document like the layout and the theme: some
   * maps are read as outlines and want numbers, others are read as pictures and
   * do not. Nothing about the tree changes either way — the numbers are drawn,
   * never written — so there is nothing to undo when it is switched off.
   */
  const [showNumbering, setShowNumbering] = useState(false);

  useEffect(() => {
    setShowNumbering(documentKey ? loadMindmapNumbering(documentKey) : false);
  }, [documentKey]);

  const handleToggleNumbering = useCallback(() => {
    const next = !showNumbering;
    setShowNumbering(next);
    if (documentKey) saveMindmapNumbering(documentKey, next);
  }, [documentKey, showNumbering]);

  /**
   * Numbers by node id, or nothing while the switch is off.
   *
   * Derived from the tree rather than from the layout, which is the point of the
   * split: folding a branch or changing the layout cannot renumber anything,
   * because neither is an input here — only the document's own structure is.
   */
  const numbering = useMemo(
    () => (showNumbering ? numberingFor(tree) : null),
    [showNumbering, tree],
  );

  // Responsive breakpoints, read off the container rather than the window: the
  // map can be a pane beside other panes, and the window says nothing about
  // how much room it actually got.
  const [isSemiCompact, setIsSemiCompact] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isUltraNarrow, setIsUltraNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setIsSemiCompact(w < 1220);
        setIsCompact(w < 1000);
        setIsNarrow(w < 820);
        setIsUltraNarrow(w < 650);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return {
    pickedThemeId,
    handlePickTheme,
    activeThemeId,
    mindmapTheme,
    pickedLayoutId,
    handlePickLayout,
    activeLayoutId,
    showNumbering,
    handleToggleNumbering,
    numbering,
    isSemiCompact,
    isCompact,
    isNarrow,
    isUltraNarrow,
  };
}
