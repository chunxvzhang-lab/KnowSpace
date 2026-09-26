import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CanvasData, CanvasEdge, CanvasNode, CanvasNodeSide } from "../../types/canvasTypes";
import {
  connectChainNodes,
  connectLoopNodes,
  connectOneToMany,
  getNodeAnchorPoint,
  getOptimalAnchorSides,
  getSourceNodeEdgeColor,
  spawnConnectedCard,
  spawnMultipleBranches,
} from "../../services/canvasService";

/** A live anchor-drag connection: where it starts and where the cursor is. */
export type ConnectingState = {
  fromNodeId: string;
  fromSide: CanvasNodeSide;
  currentX: number;
  currentY: number;
};

/** Settings for the batch spawn-branches dialog. */
export type SpawnModalState = {
  nodeId: string;
  count: number;
  direction: "right" | "bottom";
};

/** An in-progress step-bend handle drag. */
export type StepBendDragState = {
  edgeId: string;
  startX: number;
  startY: number;
  initialOffset: number;
  orientation: "horizontal" | "vertical";
};

/**
 * The connect / step-bend subsystem of the canvas: anchor-press connection
 * drags, the batch connection builders (chain, one-to-many, loop), branch
 * spawning, and the step-bend handle that reshapes an orthogonal edge.
 *
 * Extracted from CanvasView (wave 2 of the CanvasView decomposition) as the
 * fallback split of the pointer system: the big mouse effect stays in
 * `useCanvasPointer` and receives this hook's state mirror and rAF refs as
 * params, because the two together would exceed the 999-line file cap.
 */
type UseCanvasConnectParams = {
  editable: boolean;
  isPresentationMode: boolean;
  /** Board nodes, read when an anchor press starts a connection (render snapshot, as before). */
  nodes: CanvasNode[];
  /** Render-current mirror of the board; the builders read live data. */
  latestDataRef: RefObject<CanvasData>;
  pushHistory: (newData: CanvasData) => void;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedEdgeId: (id: string | null) => void;
  /** A spawned child card opens straight into the editor. */
  setEditingNodeId: (id: string | null) => void;
  setEditingText: (text: string) => void;
  setContextMenu: (menu: null) => void;
  spawnModalState: SpawnModalState | null;
  setSpawnModalState: Dispatch<SetStateAction<SpawnModalState | null>>;
  showToast: (msg: string) => void;
};

export function useCanvasConnect({
  editable,
  isPresentationMode,
  nodes,
  latestDataRef,
  pushHistory,
  selectedNodeIds,
  setSelectedNodeIds,
  setSelectedEdgeId,
  setEditingNodeId,
  setEditingText,
  setContextMenu,
  spawnModalState,
  setSpawnModalState,
  showToast,
}: UseCanvasConnectParams) {
  // Connecting line dragging state
  const [connectingState, setConnectingState] = useState<ConnectingState | null>(null);
  // Mirrors connectingState for the global mouse listeners, so those listeners
  // can stay mounted across renders instead of being re-attached every time
  // the connection cursor moves.
  const connectingStateRef = useRef<ConnectingState | null>(null);
  connectingStateRef.current = connectingState;

  const rafConnectIdRef = useRef<number | null>(null);
  const latestConnectPosRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Step bend drag state
  const stepBendDragRef = useRef<StepBendDragState | null>(null);

  const handleStepBendMouseDown = useCallback(
    (
      e: React.MouseEvent,
      edgeId: string,
      orientation: "horizontal" | "vertical",
      currentOffset: number,
    ) => {
      if (e.button !== 0 || !editable) return;
      e.preventDefault();
      e.stopPropagation();
      stepBendDragRef.current = {
        edgeId,
        startX: e.clientX,
        startY: e.clientY,
        initialOffset: currentOffset || 0,
        orientation,
      };
    },
    [editable],
  );

  const handleResetEdgeStepOffset = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        edges: currentData.edges.map((e) =>
          e.id === edgeId ? { ...e, stepOffset: undefined } : e,
        ),
      });
      showToast("已重置折线转折位置");
    },
    [editable, latestDataRef, pushHistory, showToast],
  );

  const handleConnectSelectedNodes = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selectedNodes.length < 2) return;

    // Use spatially sorted chain connection to prevent criss-crossing dead knots
    const newEdges = connectChainNodes(
      selectedNodes,
      currentData.edges,
      "bezier",
      true,
      currentData.nodes,
    );

    if (newEdges.length > 0) {
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, ...newEdges],
      });
      showToast(`已按空间顺序建立 ${newEdges.length} 条链式连线`);
    } else {
      showToast("选中的卡片之间已存在关联连线");
    }
    setContextMenu(null);
  }, [editable, latestDataRef, selectedNodeIds, pushHistory, showToast, setContextMenu]);

  const handleConnectOneToMany = useCallback(
    (specifiedRootId?: string) => {
      if (!editable || selectedNodeIds.size < 2) return;
      const currentData = latestDataRef.current;
      const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
      if (selectedNodes.length < 2) return;

      // Determine the root node (The "One"):
      // 1. Specified root ID (e.g. from context menu target card)
      // 2. The first selected node in sequence (the user clicks the origin node first, then Shift-selects targets)
      // 3. Fallback to the geometrically leftmost/topmost node
      let rootNode: CanvasNode | undefined;
      if (specifiedRootId) {
        rootNode = selectedNodes.find((n) => n.id === specifiedRootId);
      }
      if (!rootNode) {
        const firstSelectedId = Array.from(selectedNodeIds)[0];
        rootNode = selectedNodes.find((n) => n.id === firstSelectedId);
      }
      if (!rootNode) {
        rootNode = [...selectedNodes].sort((a, b) => {
          const dx = a.x - b.x;
          if (Math.abs(dx) > 30) return dx;
          return a.y - b.y;
        })[0];
      }
      if (!rootNode) return;

      const targetNodes = selectedNodes.filter((n) => n.id !== rootNode!.id);
      const newEdges = connectOneToMany(
        rootNode,
        targetNodes,
        currentData.edges,
        "bezier",
        currentData.nodes,
      );

      if (newEdges.length > 0) {
        pushHistory({
          ...currentData,
          edges: [...currentData.edges, ...newEdges],
        });
        const rootTitle =
          rootNode.type === "text"
            ? rootNode.text
                .split("\n")[0]
                .replace(/^[#\s*->]+/, "")
                .slice(0, 12) || "主卡片"
            : rootNode.type === "group"
              ? rootNode.label || "分组"
              : "主卡片";
        showToast(
          `已建立以「${rootTitle}」为发起节点的一对多关联（辐射其余 ${newEdges.length} 张卡片）`,
        );
      } else {
        showToast("选中的卡片之间已存在一对多关联");
      }
      setContextMenu(null);
    },
    [editable, latestDataRef, selectedNodeIds, pushHistory, showToast, setContextMenu],
  );

  const handleConnectLoopNodes = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const selectedNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selectedNodes.length < 3) {
      showToast("环形闭环连线至少需要选择 3 个节点");
      return;
    }

    const newEdges = connectLoopNodes(
      selectedNodes,
      currentData.edges,
      "bezier",
      true,
      currentData.nodes,
    );

    if (newEdges.length > 0) {
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, ...newEdges],
      });
      showToast(`已按顺时针空间顺序建立 ${newEdges.length} 条闭合环形连线`);
    } else {
      showToast("选中的节点之间已存在闭环关联");
    }
    setContextMenu(null);
  }, [editable, latestDataRef, selectedNodeIds, pushHistory, showToast, setContextMenu]);

  const handleSpawnMultipleBranches = useCallback(
    (sourceNodeId: string, count: number = 3, direction: "right" | "bottom" = "right") => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const sourceNode = currentData.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      const { newNodes, newEdges } = spawnMultipleBranches(
        sourceNode,
        count,
        direction,
        currentData.edges,
        currentData.nodes,
      );
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, ...newNodes],
        edges: [...currentData.edges, ...newEdges],
      });
      setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
      setSelectedEdgeId(null);
      showToast(`已成功派生 ${newNodes.length} 个分支想法卡片`);
      setContextMenu(null);
    },
    [
      editable,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedEdgeId,
      showToast,
      setContextMenu,
    ],
  );

  const handleConfirmBatchSpawn = useCallback(() => {
    if (!spawnModalState || !editable) return;
    const { nodeId, count, direction } = spawnModalState;
    handleSpawnMultipleBranches(nodeId, Math.max(1, Math.min(20, count)), direction);
    setSpawnModalState(null);
  }, [spawnModalState, editable, handleSpawnMultipleBranches, setSpawnModalState]);

  const handleSpawnConnectedChild = useCallback(
    (sourceNodeId: string, direction: "right" | "bottom" = "right") => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const sourceNode = currentData.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;
      const { newNode, newEdge } = spawnConnectedCard(
        sourceNode,
        direction,
        undefined,
        undefined,
        currentData.edges,
        currentData.nodes,
      );
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
        edges: [...currentData.edges, newEdge],
      });
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedEdgeId(null);
      setEditingNodeId(newNode.id);
      setEditingText(newNode.text);
      setContextMenu(null);
    },
    [
      editable,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedEdgeId,
      setEditingNodeId,
      setEditingText,
      setContextMenu,
    ],
  );

  // Edge Anchor Dragging
  const handleAnchorMouseDown = (e: React.MouseEvent, nodeId: string, side: CanvasNodeSide) => {
    if (isPresentationMode || e.button !== 0 || !editable) return;
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const pt = getNodeAnchorPoint(node, side);
    setConnectingState({
      fromNodeId: nodeId,
      fromSide: side,
      currentX: pt.x,
      currentY: pt.y,
    });
  };

  const handleAnchorMouseUp = (
    e: React.MouseEvent,
    targetNodeId: string,
    targetSide: CanvasNodeSide,
  ) => {
    if (!connectingState || connectingState.fromNodeId === targetNodeId) return;
    e.stopPropagation();

    const currentData = latestDataRef.current;
    const fromNode = currentData.nodes.find((n) => n.id === connectingState.fromNodeId);
    const targetNode = currentData.nodes.find((n) => n.id === targetNodeId);
    if (!fromNode || !targetNode) {
      setConnectingState(null);
      return;
    }

    const exists = currentData.edges.some(
      (ed) =>
        (ed.fromNode === fromNode.id && ed.toNode === targetNode.id) ||
        (ed.fromNode === targetNode.id && ed.toNode === fromNode.id),
    );

    if (!exists) {
      const edgeColor = getSourceNodeEdgeColor(
        fromNode,
        currentData.edges,
        currentData.nodes,
        targetNode,
      );
      const newEdge: CanvasEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromNode: fromNode.id,
        fromSide: connectingState.fromSide,
        fromEnd: "none",
        toNode: targetNode.id,
        toSide: targetSide,
        toEnd: "arrow",
        color: edgeColor,
        style: "bezier",
      };
      pushHistory({
        ...currentData,
        edges: [...currentData.edges, newEdge],
      });
      showToast("已建立卡片关联");
    } else {
      showToast("两张卡片之间已存在关联连线");
    }
    setConnectingState(null);
  };

  const handleCardMouseUpForConnect = useCallback(
    (e: React.MouseEvent, targetNode: CanvasNode) => {
      if (!connectingState || connectingState.fromNodeId === targetNode.id) return;
      e.stopPropagation();

      const currentData = latestDataRef.current;
      const fromNode = currentData.nodes.find((n) => n.id === connectingState.fromNodeId);
      if (!fromNode) {
        setConnectingState(null);
        return;
      }

      const optimal = getOptimalAnchorSides(fromNode, targetNode);
      const fromSide = connectingState.fromSide || optimal.fromSide;
      const toSide = optimal.toSide;

      const exists = currentData.edges.some(
        (ed) =>
          (ed.fromNode === fromNode.id && ed.toNode === targetNode.id) ||
          (ed.fromNode === targetNode.id && ed.toNode === fromNode.id),
      );

      if (!exists) {
        const edgeColor = getSourceNodeEdgeColor(
          fromNode,
          currentData.edges,
          currentData.nodes,
          targetNode,
        );
        const newEdge: CanvasEdge = {
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromNode: fromNode.id,
          fromSide,
          fromEnd: "none",
          toNode: targetNode.id,
          toSide,
          toEnd: "arrow",
          color: edgeColor,
          style: "bezier",
        };
        pushHistory({
          ...currentData,
          edges: [...currentData.edges, newEdge],
        });
        showToast("已建立卡片关联");
      } else {
        showToast("两张卡片之间已存在关联连线");
      }
      setConnectingState(null);
    },
    [connectingState, latestDataRef, pushHistory, showToast, setConnectingState],
  );

  return {
    connectingState,
    setConnectingState,
    /** Render-current mirror of `connectingState` for the global listeners. */
    connectingStateRef,
    /** rAF id of the connection-cursor update the pointer effect schedules. */
    rafConnectIdRef,
    latestConnectPosRef,
    stepBendDragRef,
    handleStepBendMouseDown,
    handleResetEdgeStepOffset,
    handleAnchorMouseDown,
    handleAnchorMouseUp,
    handleCardMouseUpForConnect,
    handleConnectSelectedNodes,
    handleConnectOneToMany,
    handleConnectLoopNodes,
    handleSpawnMultipleBranches,
    handleConfirmBatchSpawn,
    handleSpawnConnectedChild,
  };
}
