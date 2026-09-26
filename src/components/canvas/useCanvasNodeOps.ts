import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type {
  CanvasData,
  CanvasEdge,
  CanvasFileNode,
  CanvasGroupNode,
  CanvasNode,
  CanvasTextNode,
  CanvasViewport,
} from "../../types/canvasTypes";
import type { CanvasAlignDirection } from "../../services/canvasService";
import {
  alignNodes,
  computeBoundingBox,
  isNodeInsideGroup,
  syncLoopEdgeGeometry,
} from "../../services/canvasService";

/**
 * The node-operation domain of the canvas: card / group CRUD and arrangement —
 * adding cards at the viewport centre or a right-click point, deleting,
 * duplicating, select-all, batch recolouring, z-ordering, resetting sizes,
 * aligning, grouping / dissolving groups, and the clipboard-text helpers the
 * node context menu offers.
 *
 * Extracted from CanvasView (wave 5 of the CanvasView decomposition); the edge
 * mutations live in `useCanvasEdgeOps` and the media / clipboard IO in
 * `useCanvasMediaClipboard`.
 */
type UseCanvasNodeOpsParams = {
  editable: boolean;
  /** Camera state; new cards without explicit coordinates land in view. */
  viewport: CanvasViewport;
  /** The board. The delete / duplicate paths read the render snapshot. */
  data: CanvasData;
  /** Render-current mirror of the board; the arrangement paths read live data. */
  latestDataRef: RefObject<CanvasData>;
  pushHistory: (newData: CanvasData) => void;
  /** Adding a card first commits the card editor's pending draft. */
  handleSaveNodeEdit: () => void;
  editingNodeIdRef: RefObject<string | null>;
  /** Groups created this frame skip the first drag's re-flow (node-drag hook). */
  freshGroupIdsRef: RefObject<Set<string>>;
  selectedNodeIds: Set<string>;
  selectedNodeId: string | null;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedNodeId: (id: string | null) => void;
  setEditingNodeId: (id: string | null) => void;
  setContextMenu: (menu: null) => void;
  /** Adding a file card closes the note picker that offered the chapter. */
  setShowFilePicker: (show: boolean) => void;
  showToast: (msg: string) => void;
  /** The card context menu can extract a text card into a workspace note. */
  onExtractToNote?: (title: string, content: string) => void;
};

export function useCanvasNodeOps({
  editable,
  viewport,
  data,
  latestDataRef,
  pushHistory,
  handleSaveNodeEdit,
  editingNodeIdRef,
  freshGroupIdsRef,
  selectedNodeIds,
  selectedNodeId,
  setSelectedNodeIds,
  setSelectedNodeId,
  setEditingNodeId,
  setContextMenu,
  setShowFilePicker,
  showToast,
  onExtractToNote,
}: UseCanvasNodeOpsParams) {
  const handleAddTextCard = useCallback(
    (atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `text-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 300) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 200) / viewport.zoom);
      const newNode: CanvasTextNode = {
        id,
        type: "text",
        text: "### 新想法卡片\n双击此处或按 Enter 进行 Markdown 编辑...",
        x: targetX,
        y: targetY,
        width: 280,
        height: 160,
        color: undefined,
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
      });
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [
      editable,
      viewport,
      pushHistory,
      handleSaveNodeEdit,
      editingNodeIdRef,
      latestDataRef,
      setSelectedNodeIds,
      setEditingNodeId,
      setContextMenu,
    ],
  );

  const handleAddFileCard = useCallback(
    (chapter: { title: string; src: string }, atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `file-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 320) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 220) / viewport.zoom);
      const newNode: CanvasFileNode = {
        id,
        type: "file",
        file: chapter.src,
        x: targetX,
        y: targetY,
        width: 320,
        height: 220,
        color: "4",
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newNode],
      });
      setSelectedNodeIds(new Set([id]));
      setShowFilePicker(false);
      setContextMenu(null);
    },
    [
      editable,
      viewport,
      pushHistory,
      handleSaveNodeEdit,
      editingNodeIdRef,
      latestDataRef,
      setSelectedNodeIds,
      setShowFilePicker,
      setContextMenu,
    ],
  );

  const handleAddGroup = useCallback(
    (atX?: number, atY?: number) => {
      if (!editable) return;
      if (editingNodeIdRef.current) {
        handleSaveNodeEdit();
      }
      const id = `group-${Date.now()}`;
      const targetX =
        typeof atX === "number" ? atX : Math.round((-viewport.panX + 250) / viewport.zoom);
      const targetY =
        typeof atY === "number" ? atY : Math.round((-viewport.panY + 150) / viewport.zoom);
      const newGroup: CanvasGroupNode = {
        id,
        type: "group",
        label: "概念分组容器",
        x: targetX,
        y: targetY,
        width: 600,
        height: 400,
        color: "5",
      };
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newGroup],
      });
      freshGroupIdsRef.current.add(id);
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [
      editable,
      viewport,
      pushHistory,
      handleSaveNodeEdit,
      editingNodeIdRef,
      latestDataRef,
      freshGroupIdsRef,
      setSelectedNodeIds,
      setEditingNodeId,
      setContextMenu,
    ],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      pushHistory({
        nodes: data.nodes.filter((n) => n.id !== nodeId),
        edges: data.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId),
      });
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory, setSelectedNodeIds, setContextMenu],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    pushHistory({
      nodes: data.nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: data.edges.filter(
        (e) => !selectedNodeIds.has(e.fromNode) && !selectedNodeIds.has(e.toNode),
      ),
    });
    setSelectedNodeIds(new Set());
    setContextMenu(null);
  }, [editable, selectedNodeIds, data, pushHistory, setSelectedNodeIds, setContextMenu]);

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const newNode: CanvasNode = {
        ...node,
        id: `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: node.x + 30,
        y: node.y + 30,
      };
      pushHistory({
        ...data,
        nodes: [...data.nodes, newNode],
      });
      setSelectedNodeIds(new Set([newNode.id]));
      setContextMenu(null);
    },
    [editable, data, pushHistory, setSelectedNodeIds, setContextMenu],
  );

  const handleDuplicateSelected = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    const idMap = new Map<string, string>();
    const newNodes: CanvasNode[] = [];
    for (const node of data.nodes) {
      if (selectedNodeIds.has(node.id)) {
        const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        idMap.set(node.id, newId);
        newNodes.push({
          ...node,
          id: newId,
          x: node.x + 30,
          y: node.y + 30,
        });
      }
    }
    const newEdges: CanvasEdge[] = [];
    for (const edge of data.edges) {
      if (idMap.has(edge.fromNode) && idMap.has(edge.toNode)) {
        newEdges.push({
          ...edge,
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromNode: idMap.get(edge.fromNode)!,
          toNode: idMap.get(edge.toNode)!,
        });
      }
    }
    pushHistory({
      nodes: [...data.nodes, ...newNodes],
      edges: [...data.edges, ...newEdges],
    });
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    setContextMenu(null);
  }, [editable, selectedNodeIds, data, pushHistory, setSelectedNodeIds, setContextMenu]);

  const handleSelectAll = useCallback(() => {
    setSelectedNodeIds(new Set(data.nodes.map((n) => n.id)));
    setContextMenu(null);
  }, [data.nodes, setSelectedNodeIds, setContextMenu]);

  const handleBatchColorChange = useCallback(
    (color: string) => {
      if (!editable || selectedNodeIds.size === 0) return;
      pushHistory({
        ...data,
        nodes: data.nodes.map((n) =>
          selectedNodeIds.has(n.id) ? { ...n, color: color || undefined } : n,
        ),
      });
      // Deliberately does NOT close the context menu here — the caller decides
      // when. When the colour came from the native picker, closing has to wait
      // until that dialog has finished dismissing; unmounting the <input> from
      // onChange tears it down mid-flight and crashes the renderer (闪退).
    },
    [editable, selectedNodeIds, data, pushHistory],
  );

  const handleBringToFront = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      pushHistory({
        ...data,
        nodes: [...data.nodes.filter((n) => n.id !== nodeId), node],
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory, setContextMenu],
  );

  const handleSendToBack = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const node = data.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      pushHistory({
        ...data,
        nodes: [node, ...data.nodes.filter((n) => n.id !== nodeId)],
      });
      setContextMenu(null);
    },
    [editable, data, pushHistory, setContextMenu],
  );

  const handleAlignSelected = useCallback(
    (direction: CanvasAlignDirection) => {
      if (!editable || selectedNodeIds.size < 2) return;
      const currentData = latestDataRef.current;
      const selNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
      if (selNodes.length < 2) return;

      const updatedNodes = alignNodes(currentData.nodes, selectedNodeIds, direction);
      // Keep loop geometry in sync with the new positions: circle alignment
      // stamps a circular arc onto the loop edges, grid alignment marks them as
      // orthogonal straight segments so a rectangular layout reads as a clean
      // frame, and any other alignment clears stale metadata.
      const updatedEdges = syncLoopEdgeGeometry(updatedNodes, currentData.edges);

      const toastMap: Record<CanvasAlignDirection, string> = {
        horizontal: "所选卡片已水平中线对齐",
        vertical: "所选卡片已垂直中线对齐",
        left: "所选卡片已左对齐",
        center: "所选卡片已水平居中",
        right: "所选卡片已右对齐",
        top: "所选卡片已顶端对齐",
        middle: "所选卡片已垂直居中",
        bottom: "所选卡片已底端对齐",
        "distribute-h": "所选卡片已水平等距分布",
        "distribute-v": "所选卡片已垂直等距分布",
        circle: `已将 ${selNodes.length} 张卡片均匀排布为环形`,
        grid: `已将 ${selNodes.length} 张卡片按矩形网格排布`,
      };

      pushHistory({ ...currentData, nodes: updatedNodes, edges: updatedEdges });
      showToast(toastMap[direction] || "所选卡片已对齐");
      setContextMenu(null);
    },
    [editable, selectedNodeIds, latestDataRef, pushHistory, showToast, setContextMenu],
  );

  const handleGroupSelectedNodes = useCallback(() => {
    if (!editable || selectedNodeIds.size === 0) return;
    const currentData = latestDataRef.current;
    const selNodes = currentData.nodes.filter((n) => selectedNodeIds.has(n.id));
    if (selNodes.length === 0) return;

    const bbox = computeBoundingBox(selNodes);
    const padX = 30;
    const padTop = 45;
    const padBottom = 30;

    const newGroup: CanvasGroupNode = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "group",
      label: "新建分组容器",
      x: bbox.minX - padX,
      y: bbox.minY - padTop,
      width: bbox.width + padX * 2,
      height: bbox.height + padTop + padBottom,
      color: "6",
    };

    pushHistory({
      ...currentData,
      nodes: [newGroup, ...currentData.nodes],
    });
    setSelectedNodeIds(new Set([newGroup.id]));
    setSelectedNodeId(newGroup.id);
    showToast(`已将 ${selNodes.length} 张卡片打包进新分组`);
    setContextMenu(null);
  }, [
    editable,
    selectedNodeIds,
    latestDataRef,
    pushHistory,
    setSelectedNodeIds,
    setSelectedNodeId,
    showToast,
    setContextMenu,
  ]);

  const handleResetNodeSize = useCallback(
    (nodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const target = currentData.nodes.find((n) => n.id === nodeId);
      if (!target) return;

      let defaultW = 280;
      let defaultH = 160;
      if (target.type === "file") {
        defaultW = 320;
        defaultH = 240;
      } else if (target.type === "group") {
        defaultW = 400;
        defaultH = 300;
      } else if (target.type === "link") {
        defaultW = 280;
        defaultH = 100;
      }

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === nodeId ? { ...n, width: defaultW, height: defaultH } : n,
        ),
      });
      showToast("已重置卡片为标准尺寸");
      setContextMenu(null);
    },
    [editable, latestDataRef, pushHistory, showToast, setContextMenu],
  );

  const handleCopyNodeText = useCallback(
    (node: CanvasNode) => {
      let textToCopy = "";
      if (node.type === "text") {
        textToCopy = node.text;
      } else if (node.type === "file") {
        textToCopy = node.file;
      } else if (node.type === "link") {
        textToCopy = node.url;
      } else if (node.type === "group") {
        textToCopy = node.label || "未命名分组";
      }

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
        showToast("卡片文本已复制到剪贴板");
      }
      setContextMenu(null);
    },
    [showToast, setContextMenu],
  );

  const handleCopyNodeWikilink = useCallback(
    (node: CanvasNode) => {
      let wikilink = "";
      if (node.type === "file") {
        wikilink = `[[${node.file.replace(/\.md$/i, "")}]]`;
      } else if (node.type === "text") {
        const firstLine = node.text
          .split("\n")[0]
          .replace(/^[#\s\-*]+/, "")
          .trim();
        wikilink = `[[${firstLine || "卡片"}]]`;
      } else if (node.type === "group") {
        wikilink = `[[${node.label || "分组"}]]`;
      } else if (node.type === "link") {
        wikilink = `[${node.url}](${node.url})`;
      }

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(wikilink).catch(() => {});
        showToast(`双链已复制: ${wikilink}`);
      }
      setContextMenu(null);
    },
    [showToast, setContextMenu],
  );

  const handleExtractCardToNote = useCallback(
    (node: CanvasTextNode) => {
      if (!onExtractToNote) return;
      const lines = node.text.split("\n");
      const firstLine = lines[0].replace(/^[#\s\-*]+/, "").trim();
      const title = firstLine || "未命名卡片笔记";
      const content = node.text;
      onExtractToNote(title, content);
      showToast(`已提取为新笔记: ${title}`);
      setContextMenu(null);
    },
    [onExtractToNote, showToast, setContextMenu],
  );

  const handleSelectGroupNodes = useCallback(
    (groupNode: CanvasGroupNode) => {
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode),
      );
      if (insideNodes.length > 0) {
        setSelectedNodeIds(new Set(insideNodes.map((n) => n.id)));
        setSelectedNodeId(insideNodes[0].id);
        showToast(`已选中组内 ${insideNodes.length} 张卡片`);
      } else {
        showToast("该分组内暂无卡片");
      }
      setContextMenu(null);
    },
    [latestDataRef, setSelectedNodeIds, setSelectedNodeId, showToast, setContextMenu],
  );

  const handleFitGroupSize = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodes = currentData.nodes.filter(
        (n) => n.id !== groupNode.id && isNodeInsideGroup(n, groupNode),
      );
      if (insideNodes.length === 0) {
        showToast("分组内暂无卡片，无需调整");
        setContextMenu(null);
        return;
      }

      const bbox = computeBoundingBox(insideNodes);
      const padX = 24;
      const padTop = 38;
      const padBottom = 24;

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.map((n) =>
          n.id === groupNode.id
            ? {
                ...n,
                x: bbox.minX - padX,
                y: bbox.minY - padTop,
                width: bbox.width + padX * 2,
                height: bbox.height + padTop + padBottom,
              }
            : n,
        ),
      });
      showToast("分组尺寸已贴合内部卡片");
      setContextMenu(null);
    },
    [editable, latestDataRef, pushHistory, showToast, setContextMenu],
  );

  const handleDissolveGroup = useCallback(
    (groupNodeId: string) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => n.id !== groupNodeId),
        edges: currentData.edges.filter(
          (e) => e.fromNode !== groupNodeId && e.toNode !== groupNodeId,
        ),
      });
      if (selectedNodeId === groupNodeId) setSelectedNodeId(null);
      if (selectedNodeIds.has(groupNodeId)) {
        const nextSet = new Set(selectedNodeIds);
        nextSet.delete(groupNodeId);
        setSelectedNodeIds(nextSet);
      }
      showToast("已解散分组（保留内部卡片）");
      setContextMenu(null);
    },
    [
      editable,
      selectedNodeId,
      selectedNodeIds,
      latestDataRef,
      pushHistory,
      setSelectedNodeId,
      setSelectedNodeIds,
      showToast,
      setContextMenu,
    ],
  );

  const handleDeleteGroupWithContents = useCallback(
    (groupNode: CanvasGroupNode) => {
      if (!editable) return;
      const currentData = latestDataRef.current;
      const insideNodeIds = new Set(
        currentData.nodes
          .filter((n) => n.id === groupNode.id || isNodeInsideGroup(n, groupNode))
          .map((n) => n.id),
      );

      pushHistory({
        ...currentData,
        nodes: currentData.nodes.filter((n) => !insideNodeIds.has(n.id)),
        edges: currentData.edges.filter(
          (e) => !insideNodeIds.has(e.fromNode) && !insideNodeIds.has(e.toNode),
        ),
      });
      setSelectedNodeIds(new Set());
      setSelectedNodeId(null);
      showToast(`已删除分组容器及内部 ${insideNodeIds.size - 1} 张卡片`);
      setContextMenu(null);
    },
    [
      editable,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedNodeId,
      showToast,
      setContextMenu,
    ],
  );

  const handleAlignToGrid = useCallback(() => {
    if (!editable) return;
    const currentData = latestDataRef.current;
    const GRID = 20;
    pushHistory({
      ...currentData,
      nodes: currentData.nodes.map((n) => ({
        ...n,
        x: Math.round(n.x / GRID) * GRID,
        y: Math.round(n.y / GRID) * GRID,
      })),
    });
    showToast("已将所有卡片对齐到 20px 网格");
    setContextMenu(null);
  }, [editable, latestDataRef, pushHistory, showToast, setContextMenu]);

  return {
    handleAddTextCard,
    handleAddFileCard,
    handleAddGroup,
    handleDeleteNode,
    handleDeleteSelected,
    handleDuplicateNode,
    handleDuplicateSelected,
    handleSelectAll,
    handleBatchColorChange,
    handleBringToFront,
    handleSendToBack,
    handleAlignSelected,
    handleGroupSelectedNodes,
    handleResetNodeSize,
    handleCopyNodeText,
    handleCopyNodeWikilink,
    handleExtractCardToNote,
    handleSelectGroupNodes,
    handleFitGroupSize,
    handleDissolveGroup,
    handleDeleteGroupWithContents,
    handleAlignToGrid,
  };
}
