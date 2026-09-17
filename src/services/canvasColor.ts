/**
 * Canvas colour: palette resolution and per-source edge colour assignment.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type { CanvasNode, CanvasEdge, CanvasGroupNode } from "../types/canvasTypes";
import {
  CANVAS_COLOR_PALETTES,
  findContainerForNode,
  isNodeInsideGroup,
} from "./canvasPrimitives";
import { getLoopEdgeIdsCached } from "./canvasGraph";

/**
 * Resolves a palette key ("1".."12") or hex string to normalized lowercase hex "#rrggbb".
 */
export function normalizeHexColor(col?: string): string | undefined {
  if (!col) return undefined;
  const trimmed = col.trim().toLowerCase();
  if (CANVAS_COLOR_PALETTES[trimmed]) {
    return CANVAS_COLOR_PALETTES[trimmed].stroke.toLowerCase();
  }
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      // #rgb -> #rrggbb
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    if (trimmed.length === 7) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Checks whether two colors are perceptually similar (e.g. same color family / hue).
 * Returns true if exact match, or RGB distance < 90, or both have hue difference < 28 deg with sufficient saturation.
 */
export function isColorSimilar(c1?: string, c2?: string): boolean {
  if (!c1 || !c2) return false;
  if (c1.trim().toLowerCase() === c2.trim().toLowerCase()) return true;

  const hex1 = normalizeHexColor(c1);
  const hex2 = normalizeHexColor(c2);
  if (!hex1 || !hex2) return false;
  if (hex1 === hex2) return true;

  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  const distSq = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
  if (distSq < 90 * 90) return true;

  // HSL / HSV Hue calculation
  const toHueAndSat = (r: number, g: number, b: number) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      if (max === rn) {
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      } else if (max === gn) {
        h = ((bn - rn) / d + 2) * 60;
      } else {
        h = ((rn - gn) / d + 4) * 60;
      }
    }
    return { h, s, v };
  };

  const c1Info = toHueAndSat(r1, g1, b1);
  const c2Info = toHueAndSat(r2, g2, b2);

  if (c1Info.s > 0.15 && c2Info.s > 0.15 && c1Info.v > 0.15 && c2Info.v > 0.15) {
    const diff = Math.abs(c1Info.h - c2Info.h);
    const hueDiff = Math.min(diff, 360 - diff);
    if (hueDiff < 28) return true;
  }

  return false;
}

/**
 * Checks if a color is identical or similar to any color in an iterable collection of colors.
 */
export function isColorSimilarToAny(color: string, colorsSet: Iterable<string>): boolean {
  for (const c of colorsSet) {
    if (isColorSimilar(color, c)) return true;
  }
  return false;
}

/**
 * Finds loop component information for a source node, including member nodes,
 * member edges, and all colors associated with the loop.
 */
export function getLoopComponentInfo(
  sourceId: string,
  edges: CanvasEdge[],
  allNodes?: CanvasNode[]
): {
  isSourceInLoop: boolean;
  loopNodeIds: Set<string>;
  loopEdgeIds: Set<string>;
  ringColors: Set<string>;
} {
  const allLoopEdgeIds = getLoopEdgeIdsCached(edges);
  if (allLoopEdgeIds.size === 0) {
    return {
      isSourceInLoop: false,
      loopNodeIds: new Set(),
      loopEdgeIds: new Set(),
      ringColors: new Set(),
    };
  }

  const parent = new Map<string, string>();
  const findRoot = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur)!)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of edges) {
    if (!allLoopEdgeIds.has(e.id)) continue;
    if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
    if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
    union(e.fromNode, e.toNode);
  }

  if (!parent.has(sourceId)) {
    return {
      isSourceInLoop: false,
      loopNodeIds: new Set(),
      loopEdgeIds: new Set(),
      ringColors: new Set(),
    };
  }

  const sourceRoot = findRoot(sourceId);
  const loopNodeIds = new Set<string>();
  const loopEdgeIds = new Set<string>();
  const ringColors = new Set<string>();

  for (const e of edges) {
    if (!allLoopEdgeIds.has(e.id)) continue;
    if (findRoot(e.fromNode) === sourceRoot) {
      loopEdgeIds.add(e.id);
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
      if (e.color) ringColors.add(e.color);
    }
  }

  if (allNodes) {
    for (const n of allNodes) {
      if (loopNodeIds.has(n.id) && n.color) {
        ringColors.add(n.color);
      }
    }
  }

  return {
    isSourceInLoop: true,
    loopNodeIds,
    loopEdgeIds,
    ringColors,
  };
}

/**
 * Determines the consistent edge color for a given source node.
 * Rules:
 * 1. If the node has an explicit color assigned (node.color), use it (unless
 *    the node is in a loop making an external connection and the color conflicts with the loop).
 * 2. If the node already has existing outgoing edges, reuse that edge's color
 *    so all lines from the same card / anchor stay strictly identical in color.
 * 3. If it is a new source node, automatically assign the next palette color
 *    based on the number of distinct source nodes already connected, so different
 *    cards in the same container/canvas are clearly distinguished.
 */
export function getSourceNodeEdgeColor(
  source: CanvasNode | string,
  existingEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  target?: CanvasNode | string
): string {
  const sourceId = typeof source === "string" ? source : source.id;
  const targetId = target ? (typeof target === "string" ? target : target.id) : undefined;
  const sourceNode =
    typeof source !== "string"
      ? source
      : allNodes?.find((n) => n.id === sourceId);
  const explicitColor = sourceNode?.color;
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);

  // Check if source participates in a closed ring/loop
  const loopInfo = getLoopComponentInfo(sourceId, existingEdges, allNodes);
  const isSourceInLoop = loopInfo.isSourceInLoop;
  const isTargetInSameLoop = targetId ? loopInfo.loopNodeIds.has(targetId) : false;

  // An edge is considered an external connection originating from a loop node if:
  // 1. sourceId is in a loop, AND
  // 2. Either target is explicitly specified and not in the same loop, OR
  //    target is not specified and sourceId already has an outgoing loop edge in existingEdges.
  const isExternalFromLoop =
    isSourceInLoop &&
    (targetId
      ? !isTargetInSameLoop
      : existingEdges.some((e) => e.fromNode === sourceId && loopInfo.loopEdgeIds.has(e.id)));

  if (isExternalFromLoop) {
    // ── Ring-Isolated Outgoing Edge Coloring (Scheme A) ───────────────────
    // External edges originating from a loop card must NEVER use the ring's
    // internal color or colors similar to the ring, preserving visual boundary
    // of the closed loop.
    const ringColors = loopInfo.ringColors;
    const isRingConflict = (col?: string) => (col ? isColorSimilarToAny(col, ringColors) : false);

    // 1. All external outgoing edges from the same card share the same external color
    // Reject any existing external edges whose color conflicts with the ring!
    const existingExternalEdge = existingEdges.find(
      (e) =>
        e.fromNode === sourceId &&
        !loopInfo.loopEdgeIds.has(e.id) &&
        (targetId ? e.toNode !== targetId : true) &&
        e.color &&
        (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#")) &&
        !isRingConflict(e.color)
    );
    if (existingExternalEdge && existingExternalEdge.color) {
      return existingExternalEdge.color;
    }

    // Collect all colors already used by other source cards across the entire canvas,
    // plus the ring's colors so they are strictly avoided.
    const usedAllSourceColors = new Set<string>(ringColors);
    for (const edge of existingEdges) {
      if (
        edge.fromNode &&
        edge.fromNode !== sourceId &&
        edge.color &&
        (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
      ) {
        usedAllSourceColors.add(edge.color);
      }
    }

    const candidatePalettes = paletteKeys.filter((k) => !isRingConflict(k));

    // Container-aware external source coloring:
    if (sourceNode && allNodes && allNodes.length > 0) {
      const container = findContainerForNode(sourceNode, allNodes);
      if (container) {
        const siblingCards = allNodes.filter(
          (n) => n.id !== container.id && n.type !== "group" && isNodeInsideGroup(n, container)
        );
        const otherSiblings = siblingCards.filter((s) => s.id !== sourceId);

        const usedSiblingColors = new Set<string>(ringColors);
        for (const sib of otherSiblings) {
          const outgoingEdges = existingEdges.filter(
            (e) =>
              e.fromNode === sib.id &&
              e.color &&
              (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
          );
          for (const edge of outgoingEdges) {
            if (edge.color) usedSiblingColors.add(edge.color);
          }
        }

        if (
          explicitColor &&
          (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
          !isRingConflict(explicitColor) &&
          !usedSiblingColors.has(explicitColor) &&
          !usedAllSourceColors.has(explicitColor)
        ) {
          return explicitColor;
        }

        const idealColor = candidatePalettes.find(
          (k) => !usedSiblingColors.has(k) && !usedAllSourceColors.has(k)
        );
        if (idealColor) return idealColor;

        const siblingAvailable = candidatePalettes.find(
          (k) => !usedSiblingColors.has(k)
        );
        if (siblingAvailable) return siblingAvailable;

        if (candidatePalettes.length > 0) {
          const otherActiveSiblings = otherSiblings.filter((s) =>
            existingEdges.some((e) => e.fromNode === s.id)
          );
          return candidatePalettes[otherActiveSiblings.length % candidatePalettes.length];
        }
      }
    }

    // Non-container / global external source coloring:
    if (
      explicitColor &&
      (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
      !isRingConflict(explicitColor) &&
      !usedAllSourceColors.has(explicitColor)
    ) {
      return explicitColor;
    }

    const canvasAvailable = candidatePalettes.find(
      (k) => !usedAllSourceColors.has(k)
    );
    if (canvasAvailable) return canvasAvailable;

    if (candidatePalettes.length > 0) {
      const otherSources = Array.from(
        new Set(existingEdges.map((e) => e.fromNode).filter((id) => id && id !== sourceId))
      );
      return candidatePalettes[otherSources.length % candidatePalettes.length];
    }
  }

  // 1. Maintain identical color for all outgoing edges from the same card
  const existingEdge = existingEdges.find(
    (e) =>
      e.fromNode === sourceId &&
      e.color &&
      (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
  );
  if (existingEdge && existingEdge.color) {
    return existingEdge.color;
  }

  // Collect all colors already used by other source cards across the entire canvas
  const usedAllSourceColors = new Set<string>();
  for (const edge of existingEdges) {
    if (
      edge.fromNode &&
      edge.fromNode !== sourceId &&
      edge.color &&
      (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
    ) {
      usedAllSourceColors.add(edge.color);
    }
  }

  // 2. Container-aware source coloring:
  if (sourceNode && allNodes && allNodes.length > 0) {
    const container = findContainerForNode(sourceNode, allNodes);
    if (container) {
      const siblingCards = allNodes.filter(
        (n) => n.id !== container.id && n.type !== "group" && isNodeInsideGroup(n, container)
      );
      const otherSiblings = siblingCards.filter((s) => s.id !== sourceId);

      // Collect all colors used by outgoing edges from other sibling cards in this container
      const usedSiblingColors = new Set<string>();
      for (const sib of otherSiblings) {
        const outgoingEdges = existingEdges.filter(
          (e) =>
            e.fromNode === sib.id &&
            e.color &&
            (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))
        );
        for (const edge of outgoingEdges) {
          if (edge.color) usedSiblingColors.add(edge.color);
        }
      }

      // If card has an explicit color and it does not collide with siblings or active sources, respect it
      if (
        explicitColor &&
        (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
        !usedSiblingColors.has(explicitColor) &&
        !usedAllSourceColors.has(explicitColor)
      ) {
        return explicitColor;
      }

      // First priority: pick color unused by siblings in container AND unused across canvas
      const idealColor = paletteKeys.find(
        (k) => !usedSiblingColors.has(k) && !usedAllSourceColors.has(k)
      );
      if (idealColor) {
        return idealColor;
      }

      // Second priority: pick color unused by siblings in this container
      const siblingAvailable = paletteKeys.find((k) => !usedSiblingColors.has(k));
      if (siblingAvailable) {
        return siblingAvailable;
      }

      // Fallback: cycle among container siblings with outgoing edges
      const otherActiveSiblings = otherSiblings.filter((s) =>
        existingEdges.some((e) => e.fromNode === s.id)
      );
      return paletteKeys[otherActiveSiblings.length % paletteKeys.length];
    }
  }

  // 3. Non-container / global source coloring:
  if (
    explicitColor &&
    (CANVAS_COLOR_PALETTES[explicitColor] || explicitColor.startsWith("#")) &&
    !usedAllSourceColors.has(explicitColor)
  ) {
    return explicitColor;
  }

  // Pick first palette color not used by any other source card on the canvas
  const canvasAvailable = paletteKeys.find((k) => !usedAllSourceColors.has(k));
  if (canvasAvailable) {
    return canvasAvailable;
  }

  // Fallback: cycle across all distinct source cards on the canvas
  const otherSources = Array.from(
    new Set(existingEdges.map((e) => e.fromNode).filter((id) => id && id !== sourceId))
  );
  return paletteKeys[otherSources.length % paletteKeys.length];
}

/**
 * Returns the next edge color for a source node, ensuring all outgoing lines from
 * the same card share the same color while different source cards get different colors.
 */
export function getNextEdgeColorForSource(
  sourceNodeId: string,
  existingEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  targetNodeId?: string
): string {
  return getSourceNodeEdgeColor(sourceNodeId, existingEdges, allNodes, targetNodeId);
}

/**
 * Resolves the effective color key ("1".."12" or "#rrggbb") for rendering or exporting an edge.
 * Rules:
 * 1. If edge is a loop edge, it uses the edge's color or the ring display color.
 * 2. If edge is an external edge originating from a loop node (Scheme A):
 *    Its color MUST NOT conflict with (or be visually similar to) the ring's colors.
 *    If edge.color is missing or conflicts with the ring, it dynamically computes a
 *    clean, decoupled external color for that source node via getSourceNodeEdgeColor.
 * 3. Otherwise, normal edge: edge.color || sourceDisplayColorMap.get(edge.fromNode).
 */
export function getEffectiveEdgeColorKey(
  edge: CanvasEdge,
  allEdges: CanvasEdge[],
  allNodes?: CanvasNode[],
  sourceDisplayColorMap?: Map<string, string>
): string | undefined {
  if (!edge.fromNode) {
    return edge.color;
  }

  const loopInfo = getLoopComponentInfo(edge.fromNode, allEdges, allNodes);
  const isLoopEdge = loopInfo.loopEdgeIds.has(edge.id);

  if (isLoopEdge) {
    return (
      edge.color ||
      (sourceDisplayColorMap ? sourceDisplayColorMap.get(edge.fromNode) : undefined)
    );
  }

  if (loopInfo.isSourceInLoop) {
    const ringColors = new Set<string>(loopInfo.ringColors);
    if (sourceDisplayColorMap) {
      const ringDisplayCol = sourceDisplayColorMap.get(edge.fromNode);
      if (ringDisplayCol) ringColors.add(ringDisplayCol);
    }

    const isRingConflict = (col?: string) => (col ? isColorSimilarToAny(col, ringColors) : true);

    // Scheme A: external edges originating from loop nodes MUST NOT have the ring's color
    if (!edge.color || isRingConflict(edge.color)) {
      return getSourceNodeEdgeColor(edge.fromNode, allEdges, allNodes, edge.toNode);
    }
    return edge.color;
  }

  return (
    edge.color ||
    (sourceDisplayColorMap ? sourceDisplayColorMap.get(edge.fromNode) : undefined)
  );
}

/**
 * Computes a globally consistent, source-aware color map for all nodes that
 * initiate connections in the canvas. This is the single source of truth used
 * by both the on-screen renderer and SVG/PNG export so that colors stay
 * strictly identical between the two pipelines.
 *
 * Rules:
 * 1. If a source node already has a saved outgoing edge color in the palette,
 *    prefer it.
 * 2. If the source node has an explicit `color` and that color is not yet
 *    used by another sibling in the same container, use it.
 * 3. Otherwise, pick the first unused palette color within the container, then
 *    across the whole canvas, finally cycling as last resort.
 */
export function computeSourceDisplayColorMap(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): Map<string, string> {
  const map = new Map<string, string>();
  const paletteKeys = Object.keys(CANVAS_COLOR_PALETTES);
  const usedColors = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // ── Ring groups take absolute precedence ────────────────────────────────
  // Every node participating in the same closed ring must resolve to ONE
  // identical color. Without this, the generic "one distinct color per source
  // node" logic below would split a ring into a rainbow of segments, which is
  // exactly what a merged source card must not do.
  const loopEdgeIds = getLoopEdgeIdsCached(edges);
  if (loopEdgeIds.size > 0) {
    // Union-Find over the ring edges so that each connected ring is one group
    const parent = new Map<string, string>();
    const findRoot = (x: string): string => {
      let cur = x;
      while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
        parent.set(cur, parent.get(parent.get(cur)!)!);
        cur = parent.get(cur)!;
      }
      return cur;
    };
    const union = (a: string, b: string) => {
      const ra = findRoot(a);
      const rb = findRoot(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // First pass: build the connectivity
    for (const e of edges) {
      if (!loopEdgeIds.has(e.id)) continue;
      if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
      if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
      union(e.fromNode, e.toNode);
    }

    // Second pass: collect member nodes and the ring's single color
    const groupNodes = new Map<string, Set<string>>();
    const groupColor = new Map<string, string>();
    for (const e of edges) {
      if (!loopEdgeIds.has(e.id)) continue;
      const root = findRoot(e.fromNode);
      let set = groupNodes.get(root);
      if (!set) {
        set = new Set<string>();
        groupNodes.set(root, set);
      }
      set.add(e.fromNode);
      set.add(e.toNode);
      if (!groupColor.has(root) && e.color && (CANVAS_COLOR_PALETTES[e.color] || e.color.startsWith("#"))) {
        groupColor.set(root, e.color);
      }
    }

    for (const [root, nodeIds] of groupNodes.entries()) {
      const color =
        groupColor.get(root) ??
        paletteKeys.find((k) => !usedColors.has(k)) ??
        paletteKeys[usedColors.size % paletteKeys.length];
      for (const nid of nodeIds) map.set(nid, color);
      usedColors.add(color);
    }
  }

  const sourceIds = new Set<string>();
  // Indexed in a single pass instead of scanning `edges` inside the per-source
  // loops below: that used to make the whole function O(sources × edges) and
  // it runs on every geometry change, including each drag frame.
  const sourceExistingColor = new Map<string, string>();
  for (const edge of edges) {
    if (!edge.fromNode || !nodeMap.has(edge.fromNode)) continue;
    sourceIds.add(edge.fromNode);
    if (
      !sourceExistingColor.has(edge.fromNode) &&
      edge.color &&
      (CANVAS_COLOR_PALETTES[edge.color] || edge.color.startsWith("#"))
    ) {
      sourceExistingColor.set(edge.fromNode, edge.color);
    }
  }

  const containerSourceMap = new Map<string, string[]>();
  const rootSources: string[] = [];

  // Groups are extracted and sorted once here. Calling findContainerForNode()
  // per source re-filtered and re-sorted `nodes` every time, making this loop
  // O(sources × nodes); running on every drag frame made that noticeable.
  // Sorted smallest-first so the first hit is still the tightest container,
  // which is exactly findContainerForNode's contract.
  const groupsByArea = nodes
    .filter((n): n is CanvasGroupNode => n.type === "group")
    .sort((a, b) => a.width * a.height - b.width * b.height);
  const findContainerFast = (node: CanvasNode): CanvasGroupNode | undefined => {
    if (node.type === "group") return undefined;
    for (const g of groupsByArea) {
      if (isNodeInsideGroup(node, g)) return g;
    }
    return undefined;
  };

  for (const sourceId of sourceIds) {
    const node = nodeMap.get(sourceId);
    if (!node) continue;
    const container = findContainerFast(node);
    if (container) {
      const list = containerSourceMap.get(container.id) || [];
      list.push(sourceId);
      containerSourceMap.set(container.id, list);
    } else {
      rootSources.push(sourceId);
    }
  }

  for (const [, sourceIdsInContainer] of containerSourceMap.entries()) {
    const containerUsed = new Set<string>();
    for (const sId of sourceIdsInContainer) {
      // Node already resolved by a ring group — keep the ring's unified color
      if (map.has(sId)) {
        containerUsed.add(map.get(sId)!);
        continue;
      }
      const sNode = nodeMap.get(sId);
      const existingColor = sourceExistingColor.get(sId);
      let preferredColor = existingColor || sNode?.color;

      if (!preferredColor || containerUsed.has(preferredColor) || !CANVAS_COLOR_PALETTES[preferredColor]) {
        preferredColor =
          paletteKeys.find((k) => !containerUsed.has(k) && !usedColors.has(k)) ||
          paletteKeys.find((k) => !containerUsed.has(k)) ||
          paletteKeys[containerUsed.size % paletteKeys.length];
      }

      containerUsed.add(preferredColor);
      usedColors.add(preferredColor);
      map.set(sId, preferredColor);
    }
  }

  for (const sId of rootSources) {
    // Node already resolved by a ring group — keep the ring's unified color
    if (map.has(sId)) continue;
    const sNode = nodeMap.get(sId);
    const existingColor = sourceExistingColor.get(sId);
    let preferredColor = existingColor || sNode?.color;
    if (!preferredColor || usedColors.has(preferredColor) || !CANVAS_COLOR_PALETTES[preferredColor]) {
      preferredColor =
        paletteKeys.find((k) => !usedColors.has(k)) ||
        paletteKeys[usedColors.size % paletteKeys.length];
    }
    usedColors.add(preferredColor);
    map.set(sId, preferredColor);
  }

  return map;
}
