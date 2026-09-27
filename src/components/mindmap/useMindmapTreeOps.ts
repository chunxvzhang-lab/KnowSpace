import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../../core/types";
import { oppositeSide, type MindmapSide } from "../../core/mindmapSides";
import {
  addChildNode,
  addSiblingNode,
  copySubtree,
  deleteNode,
  findNode,
  findParent,
  findSibling,
  moveWithinSiblings,
  parseMarkdownToMindmapTree,
  pasteSubtree,
  syncMindmapToDocument,
  updateNodeText,
  updateNodesStyle,
} from "../../services/mindmapService";
import { loadMindmapCollapsed, saveMindmapCollapsed } from "../../services/storage";
import { layoutMindmap, type MindmapLayoutId } from "../../services/mindmapLayout";
import {
  setNodeSide,
  type MindmapSidecar,
  type SidecarSection,
} from "../../services/mindmapSidecar";
import type { MindmapContextMenu } from "./useMindmapAnnotations";

type UseMindmapTreeOpsParams = {
  /**
   * Identifies the document whose folds are persisted.
   *
   * A path, from the caller that has one. Omitted means folds are not
   * persisted for this mind map, which is the right behaviour for a preview
   * with no file behind it.
   */
  documentKey?: string;
  /** The document's Markdown, re-parsed by the sync and the external-change effect. */
  source?: string;
  /** The document title — the fallback root text when the source is re-parsed. */
  title: string;
  /** Writes the synced Markdown back to the document; absent means syncing is off. */
  onSourceChange?: (newSource: string) => void;
  /** Whether the map may be edited at all; every CRUD handler guards on it. */
  editable: boolean;
  /**
   * The one sidecar writer, from `useMindmapSidecar`.
   *
   * `handleAddChild` and `handleMoveToSide` write both the tree and the companion
   * file — a branch's side is sidecar data, recorded before the render that draws
   * it — so the writer is threaded in rather than rebuilt here, and every tree
   * edit that touches a side shares the single debounce and merge contract.
   */
  applySidecarEdit: (
    sections: SidecarSection[],
    edit: (current: MindmapSidecar) => MindmapSidecar,
  ) => void;
  /**
   * The tree and its writer.
   *
   * Held by the view rather than by this hook, deliberately: `useMindmapAppearance`
   * derives the outline numbering from the tree and must run before this hook can
   * (the layout below needs the appearance hook's `activeLayoutId`), so the state
   * has to exist above both. Threading it down is the only acyclic order.
   */
  tree: MindmapNode;
  setTree: Dispatch<SetStateAction<MindmapNode>>;
  /** Whether the map has edits the document does not know about yet. */
  hasUnsyncedChanges: boolean;
  setHasUnsyncedChanges: Dispatch<SetStateAction<boolean>>;
  /** The layout the reader picked, from `useMindmapAppearance`. */
  activeLayoutId: MindmapLayoutId;
  /** Which side each placed branch hangs on, read out of the companion file. */
  statedSides: Record<string, MindmapSide> | undefined;
  /** The pan & zoom transform; `handleAddChild` positions the side question with it. */
  transform: { x: number; y: number; scale: number };
  /** The scrollable container, measured to keep the side question on screen. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The node selection — what the CRUD and clipboard handlers act on. */
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  /** The primary (last) selection; single-target actions fall back to it. */
  primarySelectedId: string | null;
  /** The one inline editor's node and text, shared with the annotation editors. */
  editingNodeId: string | null;
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  editingText: string;
  setEditingText: Dispatch<SetStateAction<string>>;
  /** The view's context-menu writer; creating, renaming and deleting close it. */
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenu | null>>;
  /** The inline editor's textarea; focused and selected when editing starts. */
  editInputRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The tree domain of the mindmap: the Markdown synchronisation, the undo/redo
 * stacks, the clipboard, every create/rename/delete/style/navigation handler,
 * the node collapse state and its persistence, the two-sided layout's
 * "which side does this branch go on" question, and the layout coordinates
 * everything downstream reads.
 *
 * Extracted from MindmapView (batch 3, wave 2c of the decomposition). A verbatim
 * move: the echo guard on re-parsing, the root guards, the undo-stack shape and
 * the collapse-persistence keying are the contract, not implementation detail.
 *
 * Ordering: the view calls this after `useMindmapAppearance` (the layout needs
 * `activeLayoutId`) and before `useMindmapViewport` (the pan handlers need the
 * tree callbacks and the layout). Its effects keep the relative order they have
 * always run in — source-sync, then the fold restore, then the fold save, then
 * the edit-input focus — so moving them together preserves what they do relative
 * to one another; the hooks they now run ahead of (the appearance loads) touch
 * disjoint state.
 *
 * The dep arrays below are the originals, verbatim and in order, plus the
 * identities the bodies touch that now arrive as params — every one a stable
 * React setter or ref, so the additions change when a callback identity
 * refreshes and nothing else. The one exception is documented at the
 * fold-restore effect, where adding the missing dep would be a behaviour
 * change and the original keying is kept instead.
 */
export function useMindmapTreeOps({
  documentKey,
  source,
  title,
  onSourceChange,
  editable,
  applySidecarEdit,
  tree,
  setTree,
  hasUnsyncedChanges,
  setHasUnsyncedChanges,
  activeLayoutId,
  statedSides,
  transform,
  containerRef,
  selectedNodeIds,
  setSelectedNodeIds,
  primarySelectedId,
  editingNodeId,
  setEditingNodeId,
  editingText,
  setEditingText,
  setContextMenu,
  editInputRef,
}: UseMindmapTreeOpsParams) {
  const lastEmittedSourceRef = useRef<string>("");

  /**
   * Which side of the root a first-level branch hangs on, in the two-sided layout.
   *
   * Null hands it back to the layout's own rule — whichever side is shorter — which is what
   * a branch nobody has placed does.
   */
  const handleSideChange = useCallback(
    (nodeId: string, side: MindmapSide | null) =>
      applySidecarEdit(["sides"], (current) => setNodeSide(current, nodeId, side)),
    [applySidecarEdit],
  );

  /**
   * The question asked when a branch is about to be created in the two-sided layout.
   *
   * Held in state rather than answered after the fact: the answer is what decides where the
   * branch is drawn, and it is positioned where the branch's parent is on screen so that
   * the question appears next to the thing it is about.
   */
  const [sideChooser, setSideChooser] = useState<{ parentId: string; x: number; y: number } | null>(
    null,
  );

  // Keep tree in sync if external document structure changes, while protecting active unsynced mindmap edits
  useEffect(() => {
    if (source && source.trim() && source !== lastEmittedSourceRef.current) {
      if (!hasUnsyncedChanges) {
        setTree(parseMarkdownToMindmapTree(source, title));
      }
    }
  }, [source, title, hasUnsyncedChanges, setTree]);

  // Undo / Redo history stacks (retained for keyboard shortcuts Ctrl+Z / Ctrl+Y)
  const undoStackRef = useRef<MindmapNode[]>([]);
  const redoStackRef = useRef<MindmapNode[]>([]);

  // Node collapse state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  /**
   * The document whose folds are currently in `collapsedIds`.
   *
   * Guards the save below. Without it, opening a second document would write
   * the first document's folds under the second one's key: the save effect runs
   * once with the previous set still in state, before the restore has landed.
   */
  const collapsedKeyRef = useRef<string | undefined>(undefined);

  // Restore this document's folds when the document changes.
  useEffect(() => {
    if (!documentKey) {
      collapsedKeyRef.current = undefined;
      return;
    }

    // Ids for nodes that no longer exist are dropped. The document may have
    // been edited since the folds were saved, and a stale id would otherwise
    // sit in storage forever without ever being read back.
    const present = new Set<string>();
    const collect = (node: MindmapNode) => {
      present.add(node.id);
      for (const child of node.children ?? []) collect(child);
    };
    collect(tree);

    const restored = loadMindmapCollapsed(documentKey).filter((id) => present.has(id));
    collapsedKeyRef.current = documentKey;
    setCollapsedIds(new Set(restored));
    // Deliberately keyed on documentKey alone: re-running when the tree changes
    // would re-apply the stored folds over ones the reader has just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tree` is read only to drop ids that no longer exist; adding it would re-run the restore on every tree edit, which is exactly what the comment above rules out.
  }, [documentKey]);

  // Save folds as they change. Folding is a discrete click rather than a
  // per-frame drag, so unlike the pane widths there is nothing to gain by
  // deferring the write.
  useEffect(() => {
    if (!documentKey || collapsedKeyRef.current !== documentKey) return;
    saveMindmapCollapsed(documentKey, [...collapsedIds]);
  }, [collapsedIds, documentKey]);

  // Compute 2D layout coordinates
  const layout = useMemo(() => {
    return layoutMindmap(tree, collapsedIds, activeLayoutId, statedSides ?? {});
  }, [tree, collapsedIds, activeLayoutId, statedSides]);

  // Tree mutation & Non-destructive Markdown synchronization
  const applyTreeChange = useCallback(
    (nextTree: MindmapNode) => {
      undoStackRef.current.push(tree);
      redoStackRef.current = [];
      setTree(nextTree);
      setHasUnsyncedChanges(true);
    },
    [tree, setTree, setHasUnsyncedChanges],
  );

  /**
   * Reorders the selected node among its siblings; Alt+↑ and Alt+↓.
   *
   * Only the first selected node moves, and never the root — it has no siblings
   * to move among. A move that would run off either end returns the same tree
   * and is skipped, so it does not push an undo entry that undoes nothing.
   */
  const handleMoveSibling = useCallback(
    (delta: number) => {
      const nodeId = [...selectedNodeIds][0];
      if (!nodeId || nodeId === tree.id) return;

      const nextTree = moveWithinSiblings(tree, nodeId, delta);
      if (nextTree === tree) return;
      applyTreeChange(nextTree);
    },
    [applyTreeChange, selectedNodeIds, tree],
  );

  /**
   * The copied branch.
   *
   * A ref rather than state, deliberately: nothing renders from it, and the
   * paste shortcut reads it at the moment it runs — putting it in state would
   * re-render the whole canvas on every copy for no visible change. It is not
   * the system clipboard either; what is copied is a tree, not text.
   */
  const clipboardRef = useRef<MindmapNode | null>(null);

  /**
   * Whether anything has been copied, in a form React can render from.
   *
   * The tree itself stays in the ref — nothing draws it — but the node menu shows
   * "粘贴为子主题" greyed out until there is something to paste, and a ref cannot tell it
   * when that changes: copying from the menu left the row disabled until some unrelated
   * interaction re-rendered the panel, which reads as the copy having failed.
   */
  const [clipboardReady, setClipboardReady] = useState(false);

  const handleCopyNode = useCallback(
    (explicitNodeId?: string) => {
      const nodeId = explicitNodeId ?? [...selectedNodeIds][0];
      if (!nodeId) return;
      const copied = copySubtree(tree, nodeId);
      if (copied) {
        clipboardRef.current = copied;
        setClipboardReady(true);
      }
    },
    [selectedNodeIds, tree],
  );

  const handleCutNode = useCallback(
    (explicitNodeId?: string) => {
      const nodeId = explicitNodeId ?? [...selectedNodeIds][0];
      // The root is refused: cutting it would leave no tree to paste into.
      if (!nodeId || nodeId === tree.id) return;

      const copied = copySubtree(tree, nodeId);
      if (!copied) return;
      clipboardRef.current = copied;
      setClipboardReady(true);

      // deleteNode returns the tree *and* what to select afterwards, so a cut
      // leaves a sensible selection rather than nothing selected.
      const { nextTree, fallbackSelectedId } = deleteNode(tree, nodeId);
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([fallbackSelectedId]));
    },
    [applyTreeChange, selectedNodeIds, tree, setSelectedNodeIds],
  );

  const handlePasteNode = useCallback(
    (explicitParentId?: string) => {
      const copied = clipboardRef.current;
      if (!copied) return;

      // Pasted under the selection, so a paste into empty space lands on the root
      // rather than doing nothing. The node menu passes the topic it was opened on, so
      // its row can name where the branch will land instead of leaving it to the selection.
      const result = pasteSubtree(tree, explicitParentId ?? [...selectedNodeIds][0], copied);
      if (!result) return;

      applyTreeChange(result.nextTree);
      setSelectedNodeIds(new Set([result.newNodeId]));
    },
    [applyTreeChange, selectedNodeIds, tree, setSelectedNodeIds],
  );

  /**
   * Reaches startEditing, which is declared further down.
   *
   * A ref rather than a direct call because the two are in the other order, and
   * moving either would drag a sixty-line block with it. The same indirection
   * App uses for selectChapter. Assigned in an effect once startEditing exists.
   */
  const startEditingRef = useRef<(nodeId?: string) => void>(() => {});

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(tree);
    setTree(prev);
    setHasUnsyncedChanges(true);
  }, [tree, setTree, setHasUnsyncedChanges]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(tree);
    setTree(next);
    setHasUnsyncedChanges(true);
  }, [tree, setTree, setHasUnsyncedChanges]);

  const handleSyncToDocument = useCallback(() => {
    if (!onSourceChange) return;
    const currentDoc = source || "";
    const syncedMarkdown = syncMindmapToDocument(currentDoc, tree);
    lastEmittedSourceRef.current = syncedMarkdown;
    onSourceChange(syncedMarkdown);
    setHasUnsyncedChanges(false);
  }, [source, tree, onSourceChange, setHasUnsyncedChanges]);

  // Interactive Topic Actions
  /**
   * Moves a first-level branch to the other side of the root.
   *
   * "The other side" is read off the layout rather than off the companion file, because a
   * branch nobody has placed still has a side — the layout chose one — and the branch that
   * moves has to be the one the reader is looking at. Only the two horizontal values are
   * meaningful here; this row is offered by the two-sided layout alone.
   */
  const handleMoveToSide = useCallback(
    (nodeId: string) => {
      const node = layout.nodes.find((entry) => entry.id === nodeId);
      if (!node) return;
      handleSideChange(nodeId, oppositeSide(node.side === "left" ? "left" : "right"));
    },
    [layout, handleSideChange],
  );

  const handleAddChild = useCallback(
    (parentId?: string, side?: MindmapSide) => {
      if (!editable) return;
      const targetId = parentId || primarySelectedId || tree.id;

      // In the two-sided layout a child of the root becomes a first-level branch, and which
      // side it hangs on is the reader's to say — the layout balances branches by height,
      // and 「先做的一半放左边」 has nowhere to be said in that rule. Asking first is also the
      // honest order: a branch that appears on one side and then jumps to the other is worse
      // than one that waits a moment to be told.
      if (side === undefined && activeLayoutId === "bidirectional" && targetId === tree.id) {
        const root = layout.nodes.find((entry) => entry.id === targetId);
        const rect = containerRef.current?.getBoundingClientRect();
        // Just under the branch it is about, and kept inside the canvas: the question is
        // answered by looking at the map, so it belongs next to the thing it asks about and
        // must never land off the edge of the view.
        const rawX = root ? transform.x + (root.x + root.width / 2) * transform.scale : 40;
        const rawY = root ? transform.y + (root.y + root.height) * transform.scale + 8 : 40;
        setSideChooser({
          parentId: targetId,
          x: Math.max(8, Math.min(rawX, (rect?.width ?? 360) - 190)),
          y: Math.max(8, Math.min(rawY, (rect?.height ?? 260) - 110)),
        });
        return;
      }

      // Uncollapse if collapsed
      if (collapsedIds.has(targetId)) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
      const { nextTree, newNodeId } = addChildNode(tree, targetId, "新建子主题");
      applyTreeChange(nextTree);
      // Recorded before the render that draws it: the layout reads the sides out of the
      // companion file, so a branch whose side arrived afterwards would be drawn on the
      // balanced side and then move.
      if (side) handleSideChange(newNodeId, side);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建子主题");
      setContextMenu(null);
      setSideChooser(null);
    },
    // The original array, plus `containerRef` and the setters the body writes
    // through — stable identities this hook receives as params (see header).
    [
      editable,
      primarySelectedId,
      tree,
      collapsedIds,
      applyTreeChange,
      activeLayoutId,
      layout,
      transform,
      handleSideChange,
      containerRef,
      setSelectedNodeIds,
      setEditingNodeId,
      setEditingText,
      setContextMenu,
    ],
  );

  const handleAddSibling = useCallback(
    (targetId?: string) => {
      if (!editable) return;
      const id = targetId || primarySelectedId || tree.id;
      const { nextTree, newNodeId } = addSiblingNode(tree, id, "新建同级主题");
      applyTreeChange(nextTree);
      setSelectedNodeIds(new Set([newNodeId]));
      setEditingNodeId(newNodeId);
      setEditingText("新建同级主题");
      setContextMenu(null);
    },
    [
      editable,
      primarySelectedId,
      tree,
      applyTreeChange,
      setSelectedNodeIds,
      setEditingNodeId,
      setEditingText,
      setContextMenu,
    ],
  );

  const handleDeleteNode = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const targetIds = nodeId ? [nodeId] : Array.from(selectedNodeIds);
      if (targetIds.length === 0) return;

      let currTree = tree;
      let lastFallback: string | null = tree.id;

      for (const id of targetIds) {
        if (id === tree.id || id === "root-mindmap-node") continue;
        const { nextTree, fallbackSelectedId } = deleteNode(currTree, id);
        currTree = nextTree;
        lastFallback = fallbackSelectedId;
      }

      applyTreeChange(currTree);
      setSelectedNodeIds(lastFallback ? new Set([lastFallback]) : new Set());
      setEditingNodeId(null);
      setContextMenu(null);
    },
    [
      editable,
      selectedNodeIds,
      tree,
      applyTreeChange,
      setSelectedNodeIds,
      setEditingNodeId,
      setContextMenu,
    ],
  );

  const startEditing = useCallback(
    (nodeId?: string) => {
      if (!editable) return;
      const id = nodeId || primarySelectedId || tree.id;
      const node = findNode(tree, id);
      if (node) {
        setSelectedNodeIds(new Set([id]));
        setEditingNodeId(id);
        setEditingText(node.text);
        setContextMenu(null);
      }
    },
    [
      editable,
      primarySelectedId,
      tree,
      setSelectedNodeIds,
      setEditingNodeId,
      setEditingText,
      setContextMenu,
    ],
  );

  // Keeps the indirection above pointing at the current startEditing. Assigning
  // during render is safe here because nothing reads it until the next
  // interaction, which is always after this line has run.
  startEditingRef.current = startEditing;

  const handleCommitEdit = useCallback(() => {
    if (!editingNodeId) return;
    if (editingText.trim()) {
      const nextTree = updateNodeText(tree, editingNodeId, editingText.trim());
      applyTreeChange(nextTree);
    }
    setEditingNodeId(null);
  }, [editingNodeId, editingText, tree, applyTreeChange, setEditingNodeId]);

  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null);
  }, [setEditingNodeId]);

  // Update Appearance & Typography Styles (Batch-updates all selected nodes if multiple nodes are selected!)
  const handleUpdateStyle = useCallback(
    (
      nodeId: string,
      styles: {
        color?: string;
        shape?: MindmapNodeShape;
        lineColor?: string;
        lineStyle?: MindmapLineStyle;
        fontSize?: number;
        fontWeight?: "normal" | "bold";
        textColor?: string;
        borderColor?: string;
        textAlign?: MindmapTextAlign;
        customWidth?: number;
        customHeight?: number;
      },
    ) => {
      // If multiple nodes are selected, apply to ALL selected nodes at once!
      const targetIds = selectedNodeIds.size > 1 ? Array.from(selectedNodeIds) : [nodeId];

      const nextTree = updateNodesStyle(tree, targetIds, styles);
      applyTreeChange(nextTree);
    },
    [tree, selectedNodeIds, applyTreeChange],
  );

  // Keyboard navigation
  const handleNavigate = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const currId = primarySelectedId || tree.id;
      if (direction === "left") {
        const parent = findParent(tree, currId);
        if (parent) setSelectedNodeIds(new Set([parent.id]));
      } else if (direction === "right") {
        const curr = findNode(tree, currId);
        if (curr?.children && curr.children.length > 0) {
          setSelectedNodeIds(new Set([curr.children[0].id]));
        }
      } else if (direction === "up") {
        const prev = findSibling(tree, currId, -1);
        if (prev) setSelectedNodeIds(new Set([prev.id]));
      } else if (direction === "down") {
        const next = findSibling(tree, currId, 1);
        if (next) setSelectedNodeIds(new Set([next.id]));
      }
    },
    [primarySelectedId, tree, setSelectedNodeIds],
  );

  // Toggle collapse for a specific node
  const handleToggleCollapse = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all nodes
  const handleExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  // Collapse to Level 2
  const handleCollapseToLevel2 = useCallback(() => {
    const toCollapse = new Set<string>();
    for (const n of layout.nodes) {
      if (n.level >= 2 && n.hasChildren) {
        toCollapse.add(n.id);
      }
    }
    setCollapsedIds(toCollapse);
  }, [layout.nodes]);

  // Focus and select input on entering edit mode
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId, editInputRef]);

  return {
    // The derived layout, shared with the viewport, the exports and the editors.
    layout,
    // Collapse state (the handlers below are its only other writers).
    collapsedIds,
    handleToggleCollapse,
    handleExpandAll,
    handleCollapseToLevel2,
    // The side question and the handler that asks it.
    sideChooser,
    setSideChooser,
    handleAddChild,
    handleAddSibling,
    handleMoveToSide,
    // Mutation, history and sync.
    applyTreeChange,
    handleUndo,
    handleRedo,
    handleSyncToDocument,
    handleMoveSibling,
    // Clipboard.
    clipboardRef,
    clipboardReady,
    handleCopyNode,
    handleCutNode,
    handlePasteNode,
    // Editing.
    startEditing,
    startEditingRef,
    handleCommitEdit,
    handleCancelEdit,
    handleUpdateStyle,
    handleNavigate,
    handleDeleteNode,
  };
}
