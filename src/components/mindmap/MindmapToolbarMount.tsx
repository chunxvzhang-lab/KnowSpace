import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MindmapNode } from "../../core/types";
import { MindmapToolbar } from "../MindmapToolbar";
import type { MindmapContextMenu } from "./useMindmapAnnotations";
import type { useMindmapAppearance } from "./useMindmapAppearance";
import type { useMindmapExport } from "./useMindmapExport";
import type { useMindmapSearch } from "./useMindmapSearch";
import type { useMindmapTreeOps } from "./useMindmapTreeOps";
import type { useMindmapViewport } from "./useMindmapViewport";

/**
 * The toolbar's mount point: the bar's props, composed from the hooks the view
 * still calls, plus the one handler only the bar needs.
 *
 * Extracted from MindmapView (final trim wave of the decomposition) as pure
 * prop plumbing — the JSX and the search-field's focus closure moved verbatim,
 * the hook calls stay in the view and arrive here as their return objects. The
 * one stylistic concession: `handleStylePanelRequest` lives here now, so the
 * exhaustive-deps rule (an error in this file, off in the view) adds the two
 * stable identities it already read — the container ref and the menu setter —
 * to its dependency array. Neither changes identity, so neither changes when
 * the callback does.
 */
type MindmapToolbarMountProps = {
  /** The document title, shown when the root topic has no text of its own. */
  title: string;
  /** The tree — the bar's title falls back to the root topic's text. */
  tree: MindmapNode;
  /** The current selection, for the batch count. */
  selectedNodeIds: Set<string>;
  /** Write access to the document; gates the editing buttons. */
  editable: boolean;
  /** The write channel; without it, syncing back is not offered. */
  onSourceChange?: (newSource: string) => void;
  /** Whether the tree has edits the document does not know about yet. */
  hasUnsyncedChanges: boolean;
  /** The pan & zoom transform, for the scale readout. */
  transform: { x: number; y: number; scale: number };
  /** Measured by `handleStylePanelRequest` to place the style panel on canvas. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The primary selection — the style panel's fallback target. */
  primarySelectedId: string | null;
  /** The context-menu writer; the style panel rides on it. */
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenu | null>>;
  /** The look & feel domain: theme, layout, numbering, breakpoints. */
  appearance: ReturnType<typeof useMindmapAppearance>;
  /** The search domain: field state, matches, walking between them. */
  search: ReturnType<typeof useMindmapSearch>;
  /** The tree domain's handlers. */
  treeOps: ReturnType<typeof useMindmapTreeOps>;
  /** The camera domain: zoom steps and fit-to-screen. */
  viewport: ReturnType<typeof useMindmapViewport>;
  /** The seven ways a map leaves the app. */
  exportHandlers: ReturnType<typeof useMindmapExport>;
};

export function MindmapToolbarMount({
  title,
  tree,
  selectedNodeIds,
  editable,
  onSourceChange,
  hasUnsyncedChanges,
  transform,
  containerRef,
  primarySelectedId,
  setContextMenu,
  appearance,
  search,
  treeOps,
  viewport,
  exportHandlers,
}: MindmapToolbarMountProps) {
  const {
    handlePickTheme,
    activeThemeId,
    handlePickLayout,
    activeLayoutId,
    showNumbering,
    handleToggleNumbering,
    isUltraNarrow,
  } = appearance;

  const {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    searchMatchIds,
    currentSearchIndex,
    searchInputRef,
    handleSearch,
    handlePrevSearch,
    handleNextSearch,
    handleCloseSearch,
    handleSelectAll,
  } = search;

  const {
    layout,
    handleSyncToDocument,
    handleAddSibling,
    handleAddChild,
    handleCollapseToLevel2,
    handleExpandAll,
  } = treeOps;

  const { handleZoomStep, handleFitToScreen } = viewport;
  const {
    handleExportPng,
    handleExportSvg,
    handlePrintPdf,
    handleExportOpml,
    handleExportFreeMind,
    handleExportXmind,
    handleExportMarkdownOutline,
  } = exportHandlers;

  /**
   * Opens the style panel under whatever the toolbar pressed.
   *
   * The bar measures its own button and hands the rect over; converting it into
   * canvas coordinates belongs to the view, because the canvas offset is the
   * view's to know. The panel targets the primary selection, or the root when
   * nothing is selected — the same target the node context menu uses.
   */
  const handleStylePanelRequest = useCallback(
    (anchor: DOMRect) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: anchor.left - (containerRect?.left ?? 0),
        y: anchor.bottom - (containerRect?.top ?? 0) + 6,
        nodeId: primarySelectedId || tree.id,
      });
    },
    [primarySelectedId, tree.id, containerRef, setContextMenu],
  );

  return (
    <>
      {/* Top Floating Clean & Spacious Control Bar */}
      <MindmapToolbar
        title={tree.text || title}
        nodeCount={layout.nodes.length}
        selectedCount={selectedNodeIds.size}
        editable={editable}
        canSyncToDocument={editable && !!onSourceChange}
        hasUnsyncedChanges={hasUnsyncedChanges}
        isUltraNarrow={isUltraNarrow}
        scale={transform.scale}
        themeId={activeThemeId}
        layoutId={activeLayoutId}
        search={{
          isOpen: isSearchOpen,
          query: searchQuery,
          matchIds: searchMatchIds,
          currentIndex: currentSearchIndex,
          inputRef: searchInputRef,
          onToggle: () => {
            setIsSearchOpen((prev) => {
              const next = !prev;
              // Focus after the field exists, hence the delay: it is rendered
              // by the same state change that this returns.
              if (next) setTimeout(() => searchInputRef.current?.focus(), 60);
              return next;
            });
          },
          onQueryChange: handleSearch,
          onPrev: handlePrevSearch,
          onNext: handleNextSearch,
          onClose: handleCloseSearch,
        }}
        onSyncToDocument={handleSyncToDocument}
        onAddSibling={() => handleAddSibling()}
        onAddChild={() => handleAddChild()}
        onStylePanelRequest={handleStylePanelRequest}
        onSelectAll={handleSelectAll}
        onCollapseToLevel2={handleCollapseToLevel2}
        onExpandAll={handleExpandAll}
        onPickTheme={handlePickTheme}
        onPickLayout={handlePickLayout}
        numbering={showNumbering}
        onToggleNumbering={handleToggleNumbering}
        onZoomStep={handleZoomStep}
        onFitToScreen={handleFitToScreen}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onPrintPdf={handlePrintPdf}
        onExportOpml={handleExportOpml}
        onExportFreeMind={handleExportFreeMind}
        onExportXmind={handleExportXmind}
        onExportMarkdownOutline={handleExportMarkdownOutline}
      />
    </>
  );
}
