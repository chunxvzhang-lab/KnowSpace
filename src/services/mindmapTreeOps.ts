import type {
  MindmapNode,
  MindmapNodeShape,
  MindmapLineStyle,
  MindmapTextAlign,
} from "../core/types";

/*
 * Pure tree operations for the mindmap: cloning and lookup, structural edits
 * (add / delete / retext / restyle), clipboard and drag-and-drop moves, and
 * search. Everything here is immutable in spirit — mutations happen on a clone
 * and the original tree is returned untouched on refusal.
 */

export function cloneTree(node: MindmapNode): MindmapNode {
  return {
    ...node,
    children: node.children ? node.children.map(cloneTree) : [],
  };
}

export function findNode(tree: MindmapNode, id: string): MindmapNode | null {
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(tree: MindmapNode, id: string): MindmapNode | null {
  if (tree.id === id) return null;
  if (tree.children) {
    for (const child of tree.children) {
      if (child.id === id) return tree;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findSibling(tree: MindmapNode, id: string, delta: number): MindmapNode | null {
  const parent = findParent(tree, id);
  if (!parent || !parent.children) return null;
  const idx = parent.children.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const targetIdx = idx + delta;
  if (targetIdx >= 0 && targetIdx < parent.children.length) {
    return parent.children[targetIdx];
  }
  return null;
}

export function addChildNode(
  tree: MindmapNode,
  parentId: string,
  text = "新建子主题",
): { nextTree: MindmapNode; newNodeId: string } {
  const nextTree = cloneTree(tree);
  const target = findNode(nextTree, parentId);
  const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newNode: MindmapNode = {
    id: newNodeId,
    text,
    level: (target?.level ?? 0) + 1,
    children: [],
  };

  if (target) {
    if (!target.children) target.children = [];
    target.children.push(newNode);
  } else {
    nextTree.children.push(newNode);
  }

  return { nextTree, newNodeId };
}

export function addSiblingNode(
  tree: MindmapNode,
  targetId: string,
  text = "新建主题",
): { nextTree: MindmapNode; newNodeId: string } {
  const nextTree = cloneTree(tree);
  const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // If target is root, add as child of root
  if (targetId === nextTree.id || targetId === "root-mindmap-node") {
    return addChildNode(tree, nextTree.id, text);
  }

  const parent = findParent(nextTree, targetId);
  if (!parent || !parent.children) {
    return addChildNode(tree, nextTree.id, text);
  }

  const idx = parent.children.findIndex((c) => c.id === targetId);
  const newNode: MindmapNode = {
    id: newNodeId,
    text,
    level: parent.level + 1,
    children: [],
  };

  if (idx === -1) {
    parent.children.push(newNode);
  } else {
    parent.children.splice(idx + 1, 0, newNode);
  }

  return { nextTree, newNodeId };
}

export function deleteNode(
  tree: MindmapNode,
  nodeId: string,
): { nextTree: MindmapNode; fallbackSelectedId: string } {
  // Root node cannot be deleted
  if (nodeId === tree.id || nodeId === "root-mindmap-node") {
    return { nextTree: tree, fallbackSelectedId: tree.id };
  }

  const nextTree = cloneTree(tree);
  const parent = findParent(nextTree, nodeId);
  if (!parent || !parent.children) {
    return { nextTree, fallbackSelectedId: nextTree.id };
  }

  const idx = parent.children.findIndex((c) => c.id === nodeId);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
  }

  return { nextTree, fallbackSelectedId: parent.id };
}

export function updateNodeText(tree: MindmapNode, nodeId: string, newText: string): MindmapNode {
  const nextTree = cloneTree(tree);
  const node = findNode(nextTree, nodeId);
  if (node) {
    node.text = newText.trim() || "未命名主题";
  }
  return nextTree;
}

export function updateNodeStyle(
  tree: MindmapNode,
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
): MindmapNode {
  return updateNodesStyle(tree, [nodeId], styles);
}

export function updateNodesStyle(
  tree: MindmapNode,
  nodeIds: string[],
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
): MindmapNode {
  const nextTree = cloneTree(tree);
  const idSet = new Set(nodeIds);

  function applyStyles(node: MindmapNode) {
    if (idSet.has(node.id)) {
      if ("color" in styles) node.color = styles.color || undefined;
      if ("shape" in styles) node.shape = styles.shape || undefined;
      if ("lineColor" in styles) node.lineColor = styles.lineColor || undefined;
      if ("lineStyle" in styles) node.lineStyle = styles.lineStyle || undefined;
      if ("fontSize" in styles) node.fontSize = styles.fontSize || undefined;
      if ("fontWeight" in styles) node.fontWeight = styles.fontWeight || undefined;
      if ("textColor" in styles) node.textColor = styles.textColor || undefined;
      if ("borderColor" in styles) node.borderColor = styles.borderColor || undefined;
      if ("textAlign" in styles) node.textAlign = styles.textAlign || undefined;
      if ("customWidth" in styles) {
        node.customWidth =
          styles.customWidth && styles.customWidth > 0 ? Math.round(styles.customWidth) : undefined;
      }
      if ("customHeight" in styles) {
        node.customHeight =
          styles.customHeight && styles.customHeight > 0
            ? Math.round(styles.customHeight)
            : undefined;
      }
    }
    if (node.children) {
      for (const child of node.children) {
        applyStyles(child);
      }
    }
  }

  applyStyles(nextTree);
  return nextTree;
}

/**
 * Copies a branch for later pasting, with fresh ids.
 *
 * Ids are regenerated rather than carried over. Node ids here are derived from
 * a document's structure — `node-<path>-<index>` — so pasting a copy that kept
 * its ids would produce two nodes claiming the same one, and every lookup by id
 * would find whichever came first. Regenerating at copy time rather than paste
 * time also means the same clipboard contents can be pasted repeatedly without
 * the second paste colliding with the first.
 *
 * Styles come along, because a copied branch that lost its colours would be a
 * worse answer than no copy at all.
 */
export function copySubtree(tree: MindmapNode, nodeId: string): MindmapNode | null {
  const source = findNode(tree, nodeId);
  if (!source) return null;

  const stamp = (node: MindmapNode, level: number): MindmapNode => ({
    ...node,
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    children: (node.children ?? []).map((child) => stamp(child, level + 1)),
  });

  // The clipboard copy is detached: it is data, not part of the tree, and
  // nothing should be able to mutate one through the other.
  return stamp(JSON.parse(JSON.stringify(source)) as MindmapNode, source.level);
}

/**
 * Attaches a copied branch under a node.
 *
 * Returns null when there is nothing to paste. The parent falls back to the
 * root, so a paste with an empty selection still lands somewhere sensible
 * instead of being silently dropped.
 */
export function pasteSubtree(
  tree: MindmapNode,
  parentId: string | undefined,
  subtree: MindmapNode,
): { nextTree: MindmapNode; newNodeId: string } | null {
  if (!subtree) return null;

  const nextTree = cloneTree(tree);
  const parent = (parentId ? findNode(nextTree, parentId) : null) ?? nextTree;

  const restamp = (node: MindmapNode, level: number): MindmapNode => ({
    ...node,
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    children: (node.children ?? []).map((child) => restamp(child, level + 1)),
  });

  const attached = restamp(subtree, parent.level + 1);
  if (!parent.children) parent.children = [];
  parent.children.push(attached);

  return { nextTree, newNodeId: attached.id };
}

/**
 * Where a dragged node should land when it is dropped on another one.
 *
 * Returns the parent to attach it to and the position among that parent's
 * children, or null when the move means nothing — onto itself, or onto one of
 * its own descendants, which reparentNode would refuse anyway.
 *
 * Lives here rather than in the view so the arithmetic can be tested without a
 * rendered canvas. Two subtleties it exists to get right:
 *
 * - Dropping "after" the node below itself still lands in the right place,
 *   because detaching the node shifts everything after it down by one. The
 *   index is corrected before it is returned.
 * - The root has no siblings, so a before/after drop on it is meaningless and
 *   returns null; the caller falls back to a child drop.
 */
export function planDrop(
  tree: MindmapNode,
  movingNodeId: string,
  targetId: string,
  position: "before" | "after" | "child",
): { parentId: string; index: number } | null {
  if (movingNodeId === targetId) return null;

  const moving = findNode(tree, movingNodeId);
  if (moving && findNode(moving, targetId)) return null;

  if (position === "child") {
    const target = findNode(tree, targetId);
    return { parentId: targetId, index: target?.children?.length ?? 0 };
  }

  const parent = findParent(tree, targetId);
  if (!parent) return null;

  const siblings = parent.children ?? [];
  const targetIndex = siblings.findIndex((child) => child.id === targetId);
  if (targetIndex === -1) return null;

  const movingIndex = siblings.findIndex((child) => child.id === movingNodeId);
  let index = position === "before" ? targetIndex : targetIndex + 1;
  if (movingIndex !== -1 && movingIndex < index) index -= 1;

  return { parentId: parent.id, index };
}

/**
 * Moves a node towards the front or the back among its own siblings.
 *
 * `delta` is -1 or +1. Returns the tree it was given when the node is already
 * at that end, so a caller can tell a no-op from a move — which matters because
 * a move pushes an undo entry and a no-op must not.
 *
 * Built on planDrop rather than reimplementing the index arithmetic: moving a
 * node down and dropping it after the sibling it passes are the same problem,
 * including the shift correction, and having one implementation means the two
 * cannot disagree.
 */
export function moveWithinSiblings(tree: MindmapNode, nodeId: string, delta: number): MindmapNode {
  const parent = findParent(tree, nodeId);
  if (!parent) return tree;

  const siblings = parent.children ?? [];
  const index = siblings.findIndex((child) => child.id === nodeId);
  if (index === -1) return tree;

  const target = index + delta;
  if (target < 0 || target >= siblings.length) return tree;

  const plan = planDrop(tree, nodeId, siblings[target].id, delta < 0 ? "before" : "after");
  if (!plan) return tree;
  return reparentNode(tree, nodeId, plan.parentId, plan.index);
}

/**
 * Moves a node (and all its descendants) to become a child of newParentId,
 * or reorders it among newParent's children.
 * Includes cycle prevention (cannot move a node into itself or any of its descendants).
 */
export function reparentNode(
  root: MindmapNode,
  movingNodeId: string,
  newParentId: string,
  targetIndex?: number,
): MindmapNode {
  // Root node cannot be moved, and cannot move node to itself
  if (movingNodeId === root.id || movingNodeId === newParentId) {
    return root;
  }

  const clone = cloneTree(root);

  // Helper: find node by id
  const findNode = (n: MindmapNode, id: string): MindmapNode | null => {
    if (n.id === id) return n;
    for (const child of n.children) {
      const res = findNode(child, id);
      if (res) return res;
    }
    return null;
  };

  // Helper: check if targetId is inside node's subtree (cycle prevention)
  const isDescendant = (parent: MindmapNode, targetId: string): boolean => {
    for (const child of parent.children) {
      if (child.id === targetId) return true;
      if (isDescendant(child, targetId)) return true;
    }
    return false;
  };

  const movingNode = findNode(clone, movingNodeId);
  if (!movingNode) return root;

  // Prevent dragging into own descendant (would cause loop)
  if (isDescendant(movingNode, newParentId)) {
    return root;
  }

  const newParent = findNode(clone, newParentId);
  if (!newParent) return root;

  // Remove movingNode from its old parent
  const removeNode = (parent: MindmapNode, id: string): MindmapNode | null => {
    const idx = parent.children.findIndex((c) => c.id === id);
    if (idx !== -1) {
      return parent.children.splice(idx, 1)[0];
    }
    for (const child of parent.children) {
      const found = removeNode(child, id);
      if (found) return found;
    }
    return null;
  };

  const detachedNode = removeNode(clone, movingNodeId);
  if (!detachedNode) return root;

  // Update level of detachedNode and its descendants
  const updateLevels = (node: MindmapNode, level: number) => {
    node.level = level;
    for (const child of node.children) {
      updateLevels(child, level + 1);
    }
  };
  updateLevels(detachedNode, newParent.level + 1);

  // Insert into newParent's children
  if (
    typeof targetIndex === "number" &&
    targetIndex >= 0 &&
    targetIndex <= newParent.children.length
  ) {
    newParent.children.splice(targetIndex, 0, detachedNode);
  } else {
    newParent.children.push(detachedNode);
  }

  return clone;
}

/**
 * Finds all node IDs that contain the search query
 *
 * `describeExtra` is for what a node carries that its text does not say — the icon,
 * which lives in the companion file. Searching 「待办」 and getting every node marked
 * that way is half the reason to mark them, and the answer has to come from the
 * caller, which is the only side that knows the companion file. Omitted, the
 * behaviour is exactly what it was: node text, and nothing else.
 */
export function searchMindmapNodes(
  root: MindmapNode,
  query: string,
  describeExtra?: (nodeId: string) => string,
): string[] {
  const clean = (query || "").trim().toLowerCase();
  if (!clean) return [];

  const matches: string[] = [];
  const traverse = (node: MindmapNode) => {
    const extra = describeExtra ? describeExtra(node.id) : "";
    if (`${node.text} ${extra}`.toLowerCase().includes(clean)) {
      matches.push(node.id);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  traverse(root);
  return matches;
}
