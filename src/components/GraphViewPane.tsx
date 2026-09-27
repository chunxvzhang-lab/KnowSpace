import { useState } from "react";
import type { ThemeMode } from "../core/types";
import type { GraphData } from "../services/graphService";
import { GraphFilterDrawer } from "./graph/GraphFilterDrawer";
import { GraphNodeInspector } from "./graph/GraphNodeInspector";
import { GraphPaneHeader } from "./graph/GraphPaneHeader";
import { findCurrentNode, useCytoscapeGraph } from "./graph/useCytoscapeGraph";
import { useGraphFilters } from "./graph/useGraphFilters";

export type GraphViewPaneProps = {
  graphData: GraphData;
  currentDocId?: string | null;
  theme: ThemeMode;
  onSelectNode: (docId: string) => void;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  splitOrientation?: "row" | "column";
  onToggleOrientation?: () => void;
};

/**
 * The graph pane of the split workspace — now the composition root of its
 * decomposition (GraphViewPane was 1,075 lines; behavior unchanged):
 *
 * - `useGraphFilters` owns the seven filter states, `filteredData` and the
 *   `clearForFocus` rollback.
 * - `useCytoscapeGraph` owns the Cytoscape instance: refs, the init effect as
 *   one unit, the Space-pan mode, the current-document highlight effect, the
 *   selected node, the zoom pair and the zoom/focus handlers.
 * - `GraphPaneHeader` / `GraphFilterDrawer` / `GraphNodeInspector` are the
 *   verbatim views.
 *
 * What stays here is the one piece that spans both domains: `handleFocusActive`
 * mutates filter state (`clearForFocus`) and then — after a 60ms deferral that
 * gives the init effect time to re-create the canvas under the relaxed filters
 * — re-focuses through the hook's `executeFocus`. That mutate-then-deferred-
 * refocus flow is load-bearing; do not inline or reorder it.
 */
export function GraphViewPane({
  graphData,
  currentDocId,
  theme,
  onSelectNode,
  onClose,
  isMaximized = false,
  onToggleMaximize,
  splitOrientation = "row",
  onToggleOrientation,
}: GraphViewPaneProps) {
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const {
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
  } = useGraphFilters({ graphData, currentDocId });

  const {
    containerRef,
    cyRef,
    selectedNode,
    setSelectedNode,
    isSpacePanning,
    zoomPercent,
    zoomInputValue,
    setZoomInputValue,
    onSelectNodeRef,
    handleApplyZoomInput,
    handleResetFit,
    executeFocus,
    handleZoomIn,
    handleZoomOut,
  } = useCytoscapeGraph({ filteredData, theme, clusterByFolder, currentDocId, onSelectNode });

  const handleFocusActive = () => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const targetNode = findCurrentNode(cy, currentDocId);

    if (!targetNode || targetNode.length === 0) {
      // The active document is invisible under the current filters: relax them
      // (verbatim rollback, now via clearForFocus), then wait for the init
      // effect to rebuild the canvas before probing again.
      clearForFocus();

      setTimeout(() => {
        if (!cyRef.current) return;
        const restored = findCurrentNode(cyRef.current, currentDocId);
        if (restored && restored.length > 0) {
          executeFocus(restored);
        }
      }, 60);
      return;
    }

    executeFocus(targetNode);
  };

  return (
    <div className="graph-view-pane" role="region" aria-label="知识网络图谱分栏">
      <GraphPaneHeader
        filteredData={filteredData}
        showFilterDrawer={showFilterDrawer}
        setShowFilterDrawer={setShowFilterDrawer}
        handleFocusActive={handleFocusActive}
        handleZoomIn={handleZoomIn}
        handleZoomOut={handleZoomOut}
        handleResetFit={handleResetFit}
        zoomInputValue={zoomInputValue}
        setZoomInputValue={setZoomInputValue}
        zoomPercent={zoomPercent}
        handleApplyZoomInput={handleApplyZoomInput}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        splitOrientation={splitOrientation}
        onToggleOrientation={onToggleOrientation}
        onClose={onClose}
      />

      {/* Collapsible Filter Bar */}
      {showFilterDrawer && (
        <GraphFilterDrawer
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          hopDepth={hopDepth}
          setHopDepth={setHopDepth}
          viewFilter={viewFilter}
          setViewFilter={setViewFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          clusterByFolder={clusterByFolder}
          setClusterByFolder={setClusterByFolder}
          crossFolderOnly={crossFolderOnly}
          setCrossFolderOnly={setCrossFolderOnly}
          hideIsolates={hideIsolates}
          setHideIsolates={setHideIsolates}
        />
      )}

      {/* Graph Canvas Container */}
      <div className={`graph-pane-canvas-wrapper ${isSpacePanning ? "space-panning" : ""}`}>
        <div className="graph-pane-canvas" ref={containerRef} />
      </div>

      {/* Selected Node Details Card — outside canvas-wrapper so overflow:hidden doesn't clip it */}
      {selectedNode && (
        <GraphNodeInspector
          selectedNode={selectedNode}
          onSelectNodeRef={onSelectNodeRef}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
