/**
 * Canvas graph: cycle detection and topology-driven loop geometry.
 *
 * The cycle scan is memoised on an FNV-1a fingerprint of the edge topology —
 * dragging only moves coordinates, never the topology, so the O(E x (V+E))
 * scan is skipped on every drag frame. The cache lives here rather than in the
 * colour module that also consults it, so the dependency stays one-way.
 *
 * The layout-sync routines (syncGridEdges / syncRingEdges /
 * syncLoopEdgeGeometry) live here too: they are direct consumers of the cycle
 * scan, stamping/clearing loop-edge geometry metadata as the cards move.
 *
 * Extracted from canvasService during the R2 split — see
 * the R2 canvas split. Split out of canvasGraph during the phase-1 size split;
 * the code is byte-identical to the original. See canvasGraph.ts for the
 * import surface.
 */

import type { CanvasNode, CanvasEdge } from "../types/canvasTypes";
import { computeGridLayout, computeRingLayout } from "./canvasGeometry";

/**
 * Determines whether a directed edge participates in a closed ring of at
 * least 3 nodes. Implemented as a BFS from the edge's target node back to
 * its source, skipping the edge under test.
 *
 * The return path must be at least 2 hops long so that a mere two-way pair
 * (A->B together with B->A, i.e. a bidirectional arrow) is NOT treated as a
 * ring — those should stay free to reuse any palette color.
 */
function isEdgeOnCycle(edge: CanvasEdge, outgoing: Map<string, CanvasEdge[]>): boolean {
  const start = edge.toNode;
  const target = edge.fromNode;
  if (start === target) return true; // self-loop

  const visited = new Set<string>([start]);
  // Track hop distance so we can require a return path of >= 2 edges
  const queue: Array<{ node: string; dist: number }> = [{ node: start, dist: 0 }];

  while (queue.length > 0) {
    const { node, dist } = queue.shift()!;
    const outs = outgoing.get(node);
    if (!outs) continue;
    for (const e of outs) {
      if (e.id === edge.id) continue; // skip the edge being tested
      const nextDist = dist + 1;
      if (e.toNode === target && nextDist >= 2) return true;
      if (!visited.has(e.toNode)) {
        visited.add(e.toNode);
        queue.push({ node: e.toNode, dist: nextDist });
      }
    }
  }

  return false;
}

/**
 * Returns the ids of every edge that participates in a closed ring of at
 * least 3 nodes. See isEdgeOnCycle for the detailed rules.
 */
export function getLoopEdgeIds(edges: CanvasEdge[]): Set<string> {
  const ids = new Set<string>();
  if (!edges || edges.length === 0) return ids;

  const outgoing = new Map<string, CanvasEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.fromNode);
    if (list) list.push(e);
    else outgoing.set(e.fromNode, [e]);
  }

  for (const e of edges) {
    if (isEdgeOnCycle(e, outgoing)) ids.add(e.id);
  }

  return ids;
}

/**
 * Order-independent FNV-1a fingerprint of the edge topology (ids + endpoints).
 *
 * Card coordinates change on every drag frame, but the topology does not, so
 * this lets us skip the O(E×(V+E)) cycle scan while a card is being dragged —
 * otherwise every frame would re-run a BFS per edge.
 */
function edgeTopologyFingerprint(edges: CanvasEdge[]): number {
  let hash = 2166136261;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const key = `${e.id}\u0000${e.fromNode}\u0000${e.toNode}`;
    for (let j = 0; j < key.length; j += 1) {
      hash ^= key.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
  }
  // Fold the edge count in as well to make collisions even less likely.
  hash ^= edges.length;
  return hash >>> 0;
}

let cachedTopologyHash = -1;

let cachedLoopEdgeIds: Set<string> | null = null;

/**
 * Memoised `getLoopEdgeIds`. Cache is module-level but purely an optimisation:
 * identical input always produces the identical set, so callers cannot observe
 * a behavioural difference.
 */
export function getLoopEdgeIdsCached(edges: CanvasEdge[]): Set<string> {
  const hash = edgeTopologyFingerprint(edges);
  if (hash === cachedTopologyHash && cachedLoopEdgeIds) return cachedLoopEdgeIds;
  const ids = getLoopEdgeIds(edges);
  cachedTopologyHash = hash;
  cachedLoopEdgeIds = ids;
  return ids;
}

/**
 * Collects the palette colors already claimed by edges that form a closed
 * loop. This lets newly created rings pick a color that no other ring on the
 * canvas is currently using, so that multiple loops stay visually distinct.
 * Edges that are NOT part of a cycle (chains, one-to-many stars) are ignored
 * so they remain free to use any palette color.
 */
export function getLoopEdgeColors(edges: CanvasEdge[]): Set<string> {
  const colors = new Set<string>();
  if (!edges || edges.length === 0) return colors;

  const loopIds = getLoopEdgeIds(edges);
  for (const e of edges) {
    if (e.color && loopIds.has(e.id)) colors.add(e.color);
  }

  return colors;
}

/**
 * Expands a set of edge ids so that, whenever a selected edge belongs to a
 * closed ring, every other edge of that same ring is included as well.
 *
 * Used by color / stroke mutations so that the "one ring = one color" rule
 * survives partial edits: right-clicking a single segment of a ring will
 * repaint the entire ring instead of breaking it into mixed colors.
 */
export function expandLoopEdgeSelection(
  edges: CanvasEdge[],
  targetIds: Iterable<string>,
): Set<string> {
  const result = new Set<string>(targetIds);
  const loopIds = getLoopEdgeIds(edges);
  if (loopIds.size === 0) return result;

  // Adjacency: node -> ids of ring edges touching it
  const byNode = new Map<string, string[]>();
  for (const e of edges) {
    if (!loopIds.has(e.id)) continue;
    for (const nid of [e.fromNode, e.toNode]) {
      const list = byNode.get(nid);
      if (list) list.push(e.id);
      else byNode.set(nid, [e.id]);
    }
  }

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const queue: string[] = [];
  for (const id of result) {
    if (loopIds.has(id)) queue.push(id);
  }

  const visitedNodes = new Set<string>();
  while (queue.length > 0) {
    const eid = queue.pop()!;
    const edge = edgeById.get(eid);
    if (!edge) continue;
    for (const nid of [edge.fromNode, edge.toNode]) {
      if (visitedNodes.has(nid)) continue;
      visitedNodes.add(nid);
      const neighbours = byNode.get(nid);
      if (!neighbours) continue;
      for (const neighbourId of neighbours) {
        if (!result.has(neighbourId)) {
          result.add(neighbourId);
          queue.push(neighbourId);
        }
      }
    }
  }

  return result;
}

/**
 * Keeps grid straight-line metadata in sync with the layout: when the given
 * cards form a rectangular grid, loop edges between them are flagged as
 * orthogonal straight segments; otherwise the flag is cleared.
 */
export function syncGridEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[],
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));
  const scopedIds = new Set(scopedNodes.map((n) => n.id));

  const scopedEdges = edges.filter((e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode));
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  const isGrid = computeGridLayout(loopNodes) !== null;

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (isGrid) {
      if (e.gridPath !== true) {
        changed = true;
        return { ...e, gridPath: true };
      }
      return e;
    }
    if (e.gridPath) {
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Keeps ring edges in sync with the node layout:
 * - when the given nodes form a circle, every loop edge between them is
 *   stamped with the ring centre/radius so it renders as a true arc;
 * - otherwise any stale ring metadata is cleared so the edge falls back to a
 *   normal bezier/step/straight path.
 *
 * Only edges whose BOTH endpoints are inside `scopeNodeIds` are touched, so
 * unrelated loops elsewhere on the canvas (or a manual ring the user built
 * separately) are left alone.
 */
export function syncRingEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[],
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));

  // Ring detection only considers cards that are themselves part of a cycle,
  // so a plain row of cards is never mistaken for a ring.
  const scopedIds = new Set(scopedNodes.map((n) => n.id));
  const scopedEdges = edges.filter((e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode));
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  // A rectangular grid also satisfies the circle test — the four corners of a
  // 2x2 rectangle are exactly equidistant from their centroid — so the grid
  // must take precedence here as well. Otherwise a rectangular loop would be
  // stamped as an arc and stop being a rectangle.
  const isGrid = computeGridLayout(loopNodes) !== null;
  const layout = isGrid ? null : computeRingLayout(loopNodes);

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (layout) {
      if (
        !e.ringCenter ||
        e.ringCenter.x !== layout.center.x ||
        e.ringCenter.y !== layout.center.y ||
        e.ringRadius !== layout.radius
      ) {
        changed = true;
        return { ...e, ringCenter: layout.center, ringRadius: layout.radius };
      }
      return e;
    }
    if (e.ringCenter || e.ringRadius) {
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Re-synchronises the geometric metadata (ring arc / grid straight line) of
 * every loop edge against the current node positions.
 *
 * This is what keeps a closed loop glued to its cards while they are dragged:
 * the ring centre/radius is stored on the edge, so it has to be recomputed
 * whenever the cards move — otherwise the arc keeps pivoting around a stale
 * centre and visibly detaches from the cards.
 *
 * Loops are grouped into independent connected components first, so two
 * unrelated rings on the same canvas never average into each other. Within a
 * component, a rectangular grid takes precedence over a circle (a 2x2
 * rectangle satisfies both tests); failing both, the metadata is cleared so
 * the edge falls back to a plain bezier/step/straight path.
 */
export function syncLoopEdgeGeometry(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasEdge[] {
  // Memoised on the edge topology: this runs on every drag frame, where the
  // topology is unchanged and only the coordinates move.
  const loopIds = getLoopEdgeIdsCached(edges);
  if (loopIds.size === 0) return edges;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const loopEdges = edges.filter((e) => loopIds.has(e.id));

  // Union-Find to isolate independent loops
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) {
      root = parent.get(root) ?? root;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of loopEdges) {
    if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
    if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
    union(e.fromNode, e.toNode);
  }

  const groups = new Map<string, CanvasEdge[]>();
  for (const e of loopEdges) {
    const root = find(e.fromNode);
    const list = groups.get(root) || [];
    list.push(e);
    groups.set(root, list);
  }

  type LoopMeta = { grid: boolean; center?: { x: number; y: number }; radius?: number };
  const meta = new Map<string, LoopMeta>();

  for (const [root, groupEdges] of groups.entries()) {
    const ids = new Set<string>();
    for (const e of groupEdges) {
      ids.add(e.fromNode);
      ids.add(e.toNode);
    }
    const groupNodes = [...ids]
      .map((id) => nodeMap.get(id))
      .filter((n): n is CanvasNode => Boolean(n));

    if (computeGridLayout(groupNodes)) {
      meta.set(root, { grid: true });
      continue;
    }
    const ring = computeRingLayout(groupNodes);
    if (ring) {
      meta.set(root, { grid: false, center: ring.center, radius: ring.radius });
    } else {
      meta.set(root, { grid: false });
    }
  }

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    const info = meta.get(find(e.fromNode));
    if (!info) return e;

    if (info.grid) {
      // Straight orthogonal segment, no arc metadata
      if (e.gridPath === true && !e.ringCenter && e.ringRadius === undefined) return e;
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return { ...rest, gridPath: true } as CanvasEdge;
    }

    if (info.center) {
      // True arc, refreshed against the current card positions
      if (
        e.gridPath === undefined &&
        e.ringCenter?.x === info.center.x &&
        e.ringCenter?.y === info.center.y &&
        e.ringRadius === info.radius
      ) {
        return e;
      }
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return { ...rest, ringCenter: info.center, ringRadius: info.radius } as CanvasEdge;
    }

    // Plain curve
    if (e.gridPath === undefined && !e.ringCenter && e.ringRadius === undefined) return e;
    changed = true;
    const { gridPath: _g, ringCenter: _c, ringRadius: _r, ...rest } = e;
    return rest as CanvasEdge;
  });

  return changed ? next : edges;
}
