import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type {
  CanvasData,
  CanvasEdgeLabelShape,
  CanvasEdgeLineStyle,
  CanvasNodeSide,
} from "../../types/canvasTypes";
import {
  cycleEdgeArrow,
  cycleEdgeStrokePattern,
  cycleEdgeStyle,
  disconnectNodeEdges,
  expandLoopEdgeSelection,
  reverseEdgeDirection,
} from "../../services/canvasService";

/**
 * The edge-operation domain of the canvas: single-edge and batch-edge
 * mutations — deleting, restyling, arrow toggling, reversing, recolouring
 * (with the closed-ring invariant), edge labels and label shapes, explicit
 * anchor sides, stroke patterns, and the batch toolbar / select-all /
 * disconnect actions.
 *
 * Extracted from CanvasView (wave 5 of the CanvasView decomposition); the
 * connect builders and the step-bend handle live in `useCanvasConnect`, the
 * node CRUD in `useCanvasNodeOps`.
 */
type UseCanvasEdgeOpsParams = {
  editable: boolean;
  /** The board; `handleSelectAllEdges` reads the render snapshot of the edges. */
  data: CanvasData;
  /** Render-current mirror of the board; the mutation paths read live data. */
  latestDataRef: RefObject<CanvasData>;
  pushHistory: (newData: CanvasData) => void;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedEdgeIds: Set<string>;
  setSelectedEdgeIds: Dispatch<SetStateAction<Set<string>>>;
  /** Deleting the edge being label-edited also closes that editor. */
  editingEdgeId: string | null;
  setEditingEdgeId: (id: string | null) => void;
  setContextMenu: (menu: null) => void;
  showToast: (msg: string) => void;
};

export function useCanvasEdgeOps({
  editable,
  data,
  latestDataRef,
  pushHistory,
  selectedNodeIds,
  setSelectedNodeIds,
  selectedEdgeIds,
  setSelectedEdgeIds,
  editingEdgeId,
  setEditingEdgeId,
  setContextMenu,
  showToast,
}: UseCanvasEdgeOpsParams) {
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.filter((e) => e.id !== edgeId),
      });
      setSelectedEdgeIds((prev) => {
        if (!prev.has(edgeId)) return prev;
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });
      if (editingEdgeId === edgeId) setEditingEdgeId(null);
      setContextMenu(null);
    },
    [
      editable,
      editingEdgeId,
      latestDataRef,
      pushHistory,
      setSelectedEdgeIds,
      setEditingEdgeId,
      setContextMenu,
    ],
  );

  const handleBatchDeleteEdges = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const count = selectedEdgeIds.size;
    pushHistory({
      ...currentData,
      edges: currentData.edges.filter((e) => !selectedEdgeIds.has(e.id)),
    });
    setSelectedEdgeIds(new Set());
    if (editingEdgeId && selectedEdgeIds.has(editingEdgeId)) setEditingEdgeId(null);
    setContextMenu(null);
    showToast(`已删除 ${count} 条连线`);
  }, [
    editable,
    selectedEdgeIds,
    editingEdgeId,
    latestDataRef,
    pushHistory,
    setSelectedEdgeIds,
    setEditingEdgeId,
    setContextMenu,
    showToast,
  ]);

  const handleBatchSetEdgeStyle = useCallback(
    (style: CanvasEdgeLineStyle) => {
      if (!editable || selectedEdgeIds.size === 0) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (selectedEdgeIds.has(e.id) ? { ...e, style } : e)),
      });
      const styleName = style === "bezier" ? "贝塞尔曲线" : style === "step" ? "直角折线" : "直线";
      showToast(`已将 ${selectedEdgeIds.size} 条连线设为${styleName}`);
    },
    [editable, selectedEdgeIds, latestDataRef, pushHistory, showToast],
  );

  const handleBatchCycleStrokePattern = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const first = currentData.edges.find((e) => selectedEdgeIds.has(e.id));
    const nextPattern: "solid" | "dashed" | "dotted" =
      first?.strokePattern === "dashed"
        ? "dotted"
        : first?.strokePattern === "dotted"
          ? "solid"
          : "dashed";
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? { ...e, strokePattern: nextPattern } : e,
      ),
    });
    const patName = nextPattern === "dashed" ? "虚线" : nextPattern === "dotted" ? "点线" : "实线";
    showToast(`已将 ${selectedEdgeIds.size} 条连线切换为${patName}`);
  }, [editable, selectedEdgeIds, latestDataRef, pushHistory, showToast]);

  const handleBatchToggleArrow = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const first = currentData.edges.find((e) => selectedEdgeIds.has(e.id));
    let nextFromEnd: "arrow" | undefined = undefined;
    let nextToEnd: "arrow" | undefined = "arrow";
    let desc: string;

    if (first?.toEnd === "arrow" && first?.fromEnd !== "arrow") {
      nextFromEnd = "arrow";
      nextToEnd = "arrow";
      desc = "双向箭头";
    } else if (first?.toEnd === "arrow" && first?.fromEnd === "arrow") {
      nextFromEnd = undefined;
      nextToEnd = undefined;
      desc = "无箭头";
    } else {
      nextFromEnd = undefined;
      nextToEnd = "arrow";
      desc = "单向箭头";
    }

    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? { ...e, fromEnd: nextFromEnd, toEnd: nextToEnd } : e,
      ),
    });
    showToast(`已将 ${selectedEdgeIds.size} 条连线切换为${desc}`);
  }, [editable, selectedEdgeIds, latestDataRef, pushHistory, showToast]);

  const handleBatchSetEdgeColor = useCallback(
    (colorKey: string) => {
      if (!editable || selectedEdgeIds.size === 0) return;
      const currentData = latestDataRef.current;
      // Selecting a single segment of a closed ring repaints the whole ring,
      // so the "one ring = one color" invariant is never broken.
      const affected = expandLoopEdgeSelection(currentData.edges, selectedEdgeIds);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (affected.has(e.id) ? { ...e, color: colorKey } : e)),
      });
      showToast(`已修改 ${affected.size} 条连线的颜色`);
    },
    [editable, selectedEdgeIds, latestDataRef, pushHistory, showToast],
  );

  const handleBatchReverseEdges = useCallback(() => {
    if (!editable || selectedEdgeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const count = selectedEdgeIds.size;
    pushHistory({
      ...currentData,
      edges: currentData.edges.map((e) =>
        selectedEdgeIds.has(e.id) ? reverseEdgeDirection(e) : e,
      ),
    });
    showToast(`已反转 ${count} 条连线的流向`);
  }, [editable, selectedEdgeIds, latestDataRef, pushHistory, showToast]);

  const handleSelectAllEdges = useCallback(() => {
    if (data.edges.length === 0) return;
    setSelectedEdgeIds(new Set(data.edges.map((e) => e.id)));
    setSelectedNodeIds(new Set());
    setContextMenu(null);
    showToast(`已全选 ${data.edges.length} 条连线`);
  }, [data.edges, setSelectedEdgeIds, setSelectedNodeIds, setContextMenu, showToast]);

  const handleDisconnectSelectedNodesEdges = useCallback(() => {
    if (!editable || selectedNodeIds.size < 2) return;
    const currentData = latestDataRef.current;
    const beforeCount = currentData.edges.length;
    const remainingEdges = currentData.edges.filter(
      (e) => !(selectedNodeIds.has(e.fromNode) && selectedNodeIds.has(e.toNode)),
    );
    const removedCount = beforeCount - remainingEdges.length;
    if (removedCount === 0) {
      showToast("所选卡片之间无内部连线");
      setContextMenu(null);
      return;
    }
    pushHistory({
      ...currentData,
      edges: remainingEdges,
    });
    setSelectedEdgeIds(new Set());
    setContextMenu(null);
    showToast(`已断开所选卡片间的 ${removedCount} 条内部连线`);
  }, [
    editable,
    selectedNodeIds,
    latestDataRef,
    pushHistory,
    setSelectedEdgeIds,
    setContextMenu,
    showToast,
  ]);

  const handleNodeColorChange = useCallback(
    (nodeId: string, color: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === nodeId ? { ...n, color: color || undefined } : n,
        ),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleToggleEdgeStyle = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeStyle(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleToggleEdgeArrow = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeArrow(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleReverseEdge = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = reverseEdgeDirection(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleEdgeColorChange = useCallback(
    (edgeId: string, color?: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      // A right-click on one segment of a closed ring recolors the entire
      // ring, keeping its color unified.
      const affected = expandLoopEdgeSelection(currentData.edges, [edgeId]);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (affected.has(e.id) ? { ...e, color } : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, label: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, label: label.trim() || undefined } : e,
        ),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleEdgeLabelShapeChange = useCallback(
    (edgeId: string, shape: CanvasEdgeLabelShape) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? { ...e, labelShape: shape } : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleSetEdgeAnchorSide = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide", side: CanvasNodeSide | undefined) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? { ...e, [sideKey]: side } : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleCycleEdgeAnchor = useCallback(
    (edgeId: string, sideKey: "fromSide" | "toSide") => {
      if (!editable) return;
      const currentEdge = latestDataRef.current.edges.find((e) => e.id === edgeId);
      if (!currentEdge) return;
      const current = currentEdge[sideKey];
      const sequence: (CanvasNodeSide | undefined)[] = [
        undefined,
        "top",
        "right",
        "bottom",
        "left",
      ];
      const currIdx = sequence.indexOf(current);
      const nextSide = sequence[(currIdx + 1) % sequence.length];
      handleSetEdgeAnchorSide(edgeId, sideKey, nextSide);
    },
    [editable, latestDataRef, handleSetEdgeAnchorSide],
  );

  const handleToggleEdgeStrokePattern = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const targetEdge = currentData.edges.find((e) => e.id === edgeId);
      if (!targetEdge) return;
      const updated = cycleEdgeStrokePattern(targetEdge);
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) => (e.id === edgeId ? updated : e)),
      });
    },
    [editable, latestDataRef, pushHistory],
  );

  const handleDisconnectNodeEdges = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const connectedCount = currentData.edges.filter(
        (e) => e.fromNode === nodeId || e.toNode === nodeId,
      ).length;
      if (connectedCount === 0) {
        showToast("该卡片当前没有任何关联连线");
        setContextMenu(null);
        return;
      }
      const updatedEdges = disconnectNodeEdges(nodeId, currentData.edges);
      pushHistory({
        ...currentData,
        edges: updatedEdges,
      });
      showToast(`已断开该卡片的 ${connectedCount} 条关联连线`);
      setContextMenu(null);
    },
    [editable, latestDataRef, pushHistory, showToast, setContextMenu],
  );

  return {
    handleDeleteEdge,
    handleBatchDeleteEdges,
    handleBatchSetEdgeStyle,
    handleBatchCycleStrokePattern,
    handleBatchToggleArrow,
    handleBatchSetEdgeColor,
    handleBatchReverseEdges,
    handleSelectAllEdges,
    handleDisconnectSelectedNodesEdges,
    handleNodeColorChange,
    handleToggleEdgeStyle,
    handleToggleEdgeArrow,
    handleReverseEdge,
    handleEdgeColorChange,
    handleEdgeLabelChange,
    handleEdgeLabelShapeChange,
    handleSetEdgeAnchorSide,
    handleCycleEdgeAnchor,
    handleToggleEdgeStrokePattern,
    handleDisconnectNodeEdges,
  };
}
