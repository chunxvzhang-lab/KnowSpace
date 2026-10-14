import type { BookManifest } from "../core/types";
import type { BacklinkIndexData } from "./backlinkIndex";
import { applyRepulsion, createRepulsionTree } from "./graphLayout";

export type GraphNodeType = "chapter" | "space";

export type GraphNodeData = {
  id: string;
  label: string;
  path?: string;
  type: GraphNodeType;
  inDegree: number;
  outDegree: number;
  isCurrent?: boolean;
  normTitle: string;
  folderGroup?: string;
  clusterColor?: string;
};

export type GraphEdgeData = {
  id: string;
  source: string;
  target: string;
  label?: string;
  isCrossFolder?: boolean;
  sourceDir?: string;
  targetDir?: string;
};

export type CytoscapeElement =
  | {
      group: "nodes";
      data: GraphNodeData;
    }
  | {
      group: "edges";
      data: GraphEdgeData;
    };

export type GraphData = {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
};

/**
 * `GraphData` plus what a filter did to it.
 *
 * `filterGraphData` returns this instead of a bare `GraphData` so the pane can
 * tell the user when it is showing a subset — the node cap is a degradation, and
 * a silent one would be indistinguishable from a bug. Every existing consumer
 * reads `.nodes`/`.edges` and is unaffected; the two counts are additive.
 *
 * `totalNodeCount` is the size of the base set the filters ran on (after any
 * hop-depth extraction, before the cap), so `totalNodeCount - nodes.length` is
 * the number the filters excluded and `omittedNodeCount` is specifically the
 * number the cap dropped. The header reports the latter.
 */
export type FilteredGraphData = GraphData & {
  /** Size of the pre-cap candidate set. */
  totalNodeCount: number;
  /** Nodes the cap excluded. 0 when the cap did not bind. */
  omittedNodeCount: number;
};

const stripDocExt = (str: string): string => str.replace(/\.(md|markdown|canvas)$/i, "");

export function extractFolderGroup(path?: string, type?: GraphNodeType): string {
  if (type === "space") return "闪念 Space";
  if (!path) return "根目录";
  const normalized = path.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "根目录";
  }
  return parts[0];
}

export function buildGraphDataFromIndex(
  manifest: BookManifest | null,
  index: BacklinkIndexData,
  currentDocId?: string | null,
): GraphData {
  const nodesMap = new Map<string, GraphNodeData>();
  const normTitleToId = new Map<string, string>();
  const normPathToId = new Map<string, string>();

  /**
   * The path-alias map's "is there already a node whose path is a suffix of
   * this one, or that this one is a suffix of?" question, answered by index
   * instead of by a scan.
   *
   * `getExistingCanonicalId` used to answer it with
   * `for (const [np, existingId] of normPathToId.entries())` — one walk of the
   * whole alias map per candidate node, i.e. O(n²) per build. A CPU profile of
   * an 8,000-node vault attributed 94.8% of the build's self time (3.5 s of
   * 3.5 s) to that single loop, because it is reached on every manifest chapter
   * whose id is not yet known — which is all of them.
   *
   * The predicate is a pair of raw `endsWith` tests, and both directions are
   * answerable from an index built once, in O(path length) per lookup:
   *   - old `p.endsWith(np)` — np is a suffix of p. Enumerate p's suffixes and
   *     ask which of them are registered keys (`pathKeyOrder`).
   *   - old `np.endsWith(p)` — p is a suffix of np. Ask `suffixOrder`, which
   *     maps every suffix of every registered key to the earliest key having it.
   *
   * Equivalence, not just similarity: the old loop returned the FIRST match in
   * `Map` insertion order, so the lookup resolves the smallest-order candidate
   * across both directions. An alias key keeps its original order when a later
   * `set` overwrites its value (which is what `Map.set` does to the map this
   * mirrors), and the id is re-read from `normPathToId` at lookup time rather
   * than captured, so an overwritten value is seen exactly as the scan saw it.
   * Suffixes are enumerated per character, not per `/`-aligned segment, because
   * the old test was a raw `endsWith` and narrowing it would silently change
   * which documents deduplicate. `graph-canonical-index.test.ts` pins this
   * against a reference implementation of the original scan.
   */
  const pathKeyOrder = new Map<string, number>();
  const orderToKey = new Map<number, string>();
  const suffixOrder = new Map<string, number>();
  let pathKeyCounter = 0;

  /** Every non-empty suffix of `path`, including `path` itself, shortest last. */
  const allSuffixes = (path: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < path.length; i++) out.push(path.slice(i));
    return out;
  };

  /** Mirrors one `normPathToId.set` into the order map and the suffix index. */
  const registerPathAlias = (key: string) => {
    let order = pathKeyOrder.get(key);
    if (order === undefined) {
      order = pathKeyCounter++;
      pathKeyOrder.set(key, order);
      orderToKey.set(order, key);
    }
    for (const suffix of allSuffixes(key)) {
      const current = suffixOrder.get(suffix);
      if (current === undefined || order < current) {
        suffixOrder.set(suffix, order);
      }
    }
  };

  const findAliasByPathSuffix = (p: string): string | null => {
    let bestOrder = Infinity;

    // (A) a registered alias that is a suffix of p.
    for (const suffix of allSuffixes(p)) {
      const order = pathKeyOrder.get(suffix);
      if (order !== undefined && order < bestOrder) {
        bestOrder = order;
      }
    }

    // (B) a registered alias that has p as a suffix.
    const orderB = suffixOrder.get(p);
    if (orderB !== undefined && orderB < bestOrder) {
      bestOrder = orderB;
    }

    if (bestOrder === Infinity) return null;
    const key = orderToKey.get(bestOrder);
    return key === undefined ? null : (normPathToId.get(key) ?? null);
  };

  const registerNode = (node: GraphNodeData) => {
    nodesMap.set(node.id, node);
    normTitleToId.set(node.id, node.id);
    if (node.normTitle) {
      normTitleToId.set(node.normTitle, node.id);
    }
    if (node.path) {
      const p = node.path.trim().toLowerCase().replace(/\\/g, "/");
      normPathToId.set(p, node.id);
      registerPathAlias(p);
      const filename = stripDocExt(p.split("/").pop() || "");
      if (filename) {
        normTitleToId.set(filename, node.id);
        normPathToId.set(filename, node.id);
        registerPathAlias(filename);
      }
    }
  };

  const isMatchCurrent = (id: string, path?: string, title?: string): boolean => {
    if (!currentDocId) return false;
    let cur = currentDocId.trim().toLowerCase();
    try {
      if (cur.includes("%")) {
        cur = decodeURIComponent(cur).toLowerCase();
      }
    } catch {}

    if (id.toLowerCase() === cur) return true;
    if (path) {
      const p = path.trim().toLowerCase();
      if (p === cur || cur.endsWith(p) || p.endsWith(cur) || cur.includes(p)) return true;
    }
    if (title) {
      const t = stripDocExt(title.trim().toLowerCase());
      const curTitle = stripDocExt(cur.split(/[\\/]/).pop() || "") || cur;
      if (t === curTitle || cur.includes(t)) return true;
    }
    return false;
  };

  // 节点去重与别名映射：根据 id、规范化标题或路径定位已存在的规范节点
  const getExistingCanonicalId = (id: string, path?: string, title?: string): string | null => {
    if (nodesMap.has(id)) return id;
    const norm = stripDocExt((title || "").trim().toLowerCase());
    if (norm && normTitleToId.has(norm)) {
      return normTitleToId.get(norm)!;
    }
    if (path) {
      const p = path.trim().toLowerCase().replace(/\\/g, "/");
      if (normPathToId.has(p)) {
        return normPathToId.get(p)!;
      }
      const filename = stripDocExt(p.split("/").pop() || "");
      if (filename && normTitleToId.has(filename)) {
        return normTitleToId.get(filename)!;
      }
      // Both directions of the old `p.endsWith(np) || np.endsWith(p)` scan,
      // answered from the suffix index in O(path segments) and still returning
      // the earliest-registered match the scan would have returned.
      const aliased = findAliasByPathSuffix(p);
      if (aliased) return aliased;
    }
    return null;
  };

  if (manifest?.chapters) {
    for (const ch of manifest.chapters) {
      const existingId = getExistingCanonicalId(ch.id, ch.src, ch.title);
      if (existingId) {
        normTitleToId.set(ch.id, existingId);
        continue;
      }

      const norm = stripDocExt(ch.title.trim().toLowerCase());
      const isSpace = Boolean(
        (ch.src &&
          (ch.src.toLowerCase().startsWith("space/") ||
            ch.src.toLowerCase().startsWith("space\\"))) ||
        ch.id.startsWith("space-"),
      );
      const folder = extractFolderGroup(ch.src, isSpace ? "space" : "chapter");
      const node: GraphNodeData = {
        id: ch.id,
        label: ch.title,
        path: ch.src,
        type: isSpace ? "space" : "chapter",
        inDegree: 0,
        outDegree: 0,
        isCurrent: isMatchCurrent(ch.id, ch.src, ch.title),
        normTitle: norm,
        folderGroup: folder,
      };
      registerNode(node);
    }
  }

  for (const [docId, doc] of index.documents.entries()) {
    const existingId = getExistingCanonicalId(docId, doc.path, doc.title);
    if (existingId) {
      // 文档已存在，将 docId 与标题别名指向已有规范节点，避免生成重复节点
      normTitleToId.set(docId, existingId);
      const norm = stripDocExt(doc.title.trim().toLowerCase());
      if (norm) normTitleToId.set(norm, existingId);
      if (isMatchCurrent(docId, doc.path, doc.title)) {
        const existingNode = nodesMap.get(existingId);
        if (existingNode) existingNode.isCurrent = true;
      }
      continue;
    }

    const isSpace = Boolean(
      (doc.path &&
        (doc.path.toLowerCase().includes("space/") ||
          doc.path.toLowerCase().includes("space\\"))) ||
      doc.path?.includes(".space") ||
      docId.startsWith("space-"),
    );
    const norm = stripDocExt(doc.title.trim().toLowerCase());
    const folder = extractFolderGroup(doc.path, isSpace ? "space" : "chapter");
    const node: GraphNodeData = {
      id: docId,
      label: doc.title,
      path: doc.path,
      type: isSpace ? "space" : "chapter",
      inDegree: 0,
      outDegree: 0,
      isCurrent: isMatchCurrent(docId, doc.path, doc.title),
      normTitle: norm,
      folderGroup: folder,
    };
    registerNode(node);
  }

  const edges: GraphEdgeData[] = [];
  const edgeSet = new Set<string>();

  for (const [sourceId, targets] of index.forwardLinks.entries()) {
    const canonicalSourceId = normTitleToId.get(sourceId) || sourceId;
    const sourceNode = nodesMap.get(canonicalSourceId);
    if (!sourceNode) continue;

    for (const targetNorm of targets) {
      const canonicalTargetId = normTitleToId.get(targetNorm);
      if (!canonicalTargetId || canonicalTargetId === canonicalSourceId) continue;

      const edgeKey = `${canonicalSourceId}->${canonicalTargetId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        const targetNode = nodesMap.get(canonicalTargetId);
        const sourceFolder =
          sourceNode.folderGroup || extractFolderGroup(sourceNode.path, sourceNode.type);
        const targetFolder = targetNode
          ? targetNode.folderGroup || extractFolderGroup(targetNode.path, targetNode.type)
          : undefined;
        const isCrossFolder = Boolean(
          sourceFolder && targetFolder && sourceFolder !== targetFolder,
        );

        edges.push({
          id: edgeKey,
          source: canonicalSourceId,
          target: canonicalTargetId,
          isCrossFolder,
          sourceDir: sourceFolder,
          targetDir: targetFolder,
        });

        sourceNode.outDegree += 1;
        if (targetNode) {
          targetNode.inDegree += 1;
        }
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

export function extractLocalSubgraph(
  graphData: GraphData,
  centerDocId: string,
  depth = 1,
): GraphData {
  // Resiliently resolve the exact node ID in graphData
  let resolvedCenterId = centerDocId;
  const direct = graphData.nodes.find((n) => n.id === centerDocId);
  if (!direct) {
    const byCurrent = graphData.nodes.find((n) => n.isCurrent);
    if (byCurrent) {
      resolvedCenterId = byCurrent.id;
    } else {
      const norm = centerDocId.trim().toLowerCase();
      const byMatch = graphData.nodes.find((n) => {
        const nid = n.id.toLowerCase();
        const p = (n.path || "").toLowerCase();
        const l = n.label.toLowerCase();
        return nid === norm || p === norm || norm.endsWith(p) || p.endsWith(norm) || l === norm;
      });
      if (byMatch) {
        resolvedCenterId = byMatch.id;
      }
    }
  }

  const visitedNodeIds = new Set<string>();
  visitedNodeIds.add(resolvedCenterId);

  let currentLevel = new Set<string>([resolvedCenterId]);

  for (let d = 0; d < depth; d++) {
    const nextLevel = new Set<string>();
    for (const edge of graphData.edges) {
      if (currentLevel.has(edge.source) && !visitedNodeIds.has(edge.target)) {
        visitedNodeIds.add(edge.target);
        nextLevel.add(edge.target);
      }
      if (currentLevel.has(edge.target) && !visitedNodeIds.has(edge.source)) {
        visitedNodeIds.add(edge.source);
        nextLevel.add(edge.source);
      }
    }
    currentLevel = nextLevel;
    if (currentLevel.size === 0) break;
  }

  const subNodes = graphData.nodes
    .filter((n) => visitedNodeIds.has(n.id))
    .map((n) => ({
      ...n,
      isCurrent: n.id === centerDocId,
    }));

  const subEdges = graphData.edges.filter(
    (e) => visitedNodeIds.has(e.source) && visitedNodeIds.has(e.target),
  );

  return {
    nodes: subNodes,
    edges: subEdges,
  };
}

export const CLUSTER_PALETTE = [
  "#38bdf8", // Sky blue
  "#818cf8", // Indigo
  "#34d399", // Emerald
  "#f472b6", // Pink
  "#fb923c", // Orange
  "#a78bfa", // Purple
  "#facc15", // Amber
  "#4ade80", // Green
  "#2dd4bf", // Teal
  "#e879f9", // Fuchsia
  "#94a3b8", // Slate
];

export function computeDirectoryClusterColors(nodes: GraphNodeData[]): Map<string, string> {
  const groupToColor = new Map<string, string>();
  let colorIdx = 0;

  for (const node of nodes) {
    const group = node.folderGroup || extractFolderGroup(node.path, node.type);
    if (!groupToColor.has(group)) {
      if (group === "根目录") {
        groupToColor.set(group, "#94a3b8");
      } else if (group === "闪念 Space") {
        groupToColor.set(group, "#f59e0b");
      } else {
        const color = CLUSTER_PALETTE[colorIdx % CLUSTER_PALETTE.length];
        colorIdx++;
        groupToColor.set(group, color);
      }
    }
  }

  return groupToColor;
}

export function filterGraphData(
  graphData: GraphData,
  options: {
    hideIsolates?: boolean;
    query?: string;
    typeFilter?: "all" | "chapter" | "space";
    depth?: "all" | 1 | 2;
    currentDocId?: string | null;
    viewFilter?: "all" | "hubs" | "orphans";
    clusterByFolder?: boolean;
    crossFolderOnly?: boolean;
    /**
     * Ceiling on rendered nodes. Omit (or pass `undefined`) for no cap — the
     * default, so every existing caller keeps its exact previous behaviour.
     */
    maxNodes?: number;
  },
): FilteredGraphData {
  const {
    hideIsolates = false,
    query = "",
    typeFilter = "all",
    depth = "all",
    currentDocId,
    viewFilter = "all",
    clusterByFolder = false,
    crossFolderOnly = false,
  } = options;

  let baseData = graphData;
  if ((depth === 1 || depth === 2) && currentDocId) {
    baseData = extractLocalSubgraph(graphData, currentDocId, depth);
  }

  let filteredNodes = baseData.nodes;

  if (typeFilter !== "all") {
    filteredNodes = filteredNodes.filter((n) => n.type === typeFilter);
  }

  if (viewFilter === "hubs") {
    filteredNodes = filteredNodes.filter((n) => n.inDegree + n.outDegree >= 3);
  } else if (viewFilter === "orphans") {
    filteredNodes = filteredNodes.filter((n) => n.inDegree + n.outDegree === 0);
  } else if (hideIsolates) {
    filteredNodes = filteredNodes.filter((n) => n.inDegree + n.outDegree > 0 || n.isCurrent);
  }

  const q = query.trim().toLowerCase();
  if (q) {
    filteredNodes = filteredNodes.filter(
      (n) => n.label.toLowerCase().includes(q) || (n.path && n.path.toLowerCase().includes(q)),
    );
  }

  if (clusterByFolder) {
    const clusterMap = computeDirectoryClusterColors(filteredNodes);
    filteredNodes = filteredNodes.map((n) => {
      const group = extractFolderGroup(n.path, n.type);
      return {
        ...n,
        folderGroup: group,
        clusterColor: clusterMap.get(group),
      };
    });
  }

  // ── Node cap ──────────────────────────────────────────────────────────────
  // A graph the user cannot interact with is worse than a graph that says what
  // it left out, so above `maxNodes` the pane renders the most connected nodes
  // and reports the omission in the header rather than hanging.
  //
  // The order is deterministic and total: degree descending, then id ascending.
  // Degree is the informative ranking (a hub is what a map is for), and the id
  // tiebreak means the same vault always yields the same subset — a cap that
  // reshuffles on every rebuild would be indistinguishable from a rendering bug.
  // The active document is always kept, because every filter path in this
  // function already treats it as pinned and dropping it would break "focus the
  // current document".
  let omittedNodeCount = 0;
  if (typeof options.maxNodes === "number" && filteredNodes.length > options.maxNodes) {
    const cap = Math.max(1, Math.floor(options.maxNodes));
    const ranked = filteredNodes
      .map((node, index) => ({ node, index }))
      .sort((a, b) => {
        const da = a.node.inDegree + a.node.outDegree;
        const db = b.node.inDegree + b.node.outDegree;
        if (da !== db) return db - da;
        const ia = a.node.id;
        const ib = b.node.id;
        if (ia !== ib) return ia < ib ? -1 : 1;
        return a.index - b.index;
      });

    const kept: { node: GraphNodeData; index: number }[] = [];
    const keptIds = new Set<string>();
    for (const entry of ranked) {
      if (kept.length >= cap) break;
      kept.push(entry);
      keptIds.add(entry.node.id);
    }
    // Pin the active document even if it did not make the cut, displacing the
    // lowest-ranked kept node so the cap is still honoured exactly.
    for (let i = 0; i < filteredNodes.length; i++) {
      const node = filteredNodes[i];
      if (node.isCurrent && !keptIds.has(node.id)) {
        const displaced = kept.pop();
        if (displaced) keptIds.delete(displaced.node.id);
        kept.push({ node, index: i });
        keptIds.add(node.id);
      }
    }

    omittedNodeCount = filteredNodes.length - kept.length;
    // Restore the original order by the recorded index — a stable, O(k log k)
    // sort, not an `indexOf` lookup per comparison (which would be O(k² log k)).
    kept.sort((a, b) => a.index - b.index);
    filteredNodes = kept.map((entry) => entry.node);
  }

  const allowedIds = new Set(filteredNodes.map((n) => n.id));
  let filteredEdges = baseData.edges.filter(
    (e) => allowedIds.has(e.source) && allowedIds.has(e.target),
  );

  if (crossFolderOnly) {
    filteredEdges = filteredEdges.filter((e) => e.isCrossFolder);
    const connectedNodeIds = new Set<string>();
    for (const e of filteredEdges) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    }
    filteredNodes = filteredNodes.filter((n) => connectedNodeIds.has(n.id) || n.isCurrent);
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    totalNodeCount: baseData.nodes.length,
    omittedNodeCount,
  };
}

export function toCytoscapeElements(graphData: GraphData): CytoscapeElement[] {
  const elements: CytoscapeElement[] = [];

  for (const node of graphData.nodes) {
    elements.push({
      group: "nodes",
      data: node,
    });
  }

  for (const edge of graphData.edges) {
    elements.push({
      group: "edges",
      data: edge,
    });
  }

  return elements;
}

/**
 * How many solver iterations a graph of `nodeCount` gets.
 *
 * The rule used to be `min(80, max(45, n * 2))`, which is 80 for every graph of
 * 40 or more nodes — i.e. 80 for every graph the pane ever renders. With the
 * Barnes-Hut repulsion that is now affordable, but not free: at 3,200 nodes one
 * layout is still ~1.1 s, and the layout runs synchronously inside the
 * Cytoscape init effect, so a filter change freezes the app for that long.
 *
 * The large-graph budget is therefore spent where it buys something. Small
 * graphs keep the original 80 — their layout is a couple of milliseconds and
 * there is no reason to change what users already see. Above
 * `LARGE_GRAPH_NODE_COUNT` the count tapers to `MIN_LARGE_GRAPH_ITERATIONS`,
 * which the layout-quality measurement in `graph-performance.test.ts` shows is
 * where the mean edge-length deviation stops improving materially.
 */
export function layoutIterationsFor(nodeCount: number): number {
  if (nodeCount <= LARGE_GRAPH_NODE_COUNT) {
    return Math.min(80, Math.max(45, nodeCount * 2));
  }
  // Linear taper from 80 down to the floor as the graph grows past the knee.
  const t = Math.min(1, (nodeCount - LARGE_GRAPH_NODE_COUNT) / (LARGE_GRAPH_NODE_COUNT * 2));
  return Math.round(80 - t * (80 - MIN_LARGE_GRAPH_ITERATIONS));
}

/**
 * Above this node count the iteration budget starts tapering.
 *
 * 400 is where the layout first becomes noticeable (77.9 ms measured, i.e.
 * several dropped frames) while still being small enough that the taper's
 * quality cost is invisible — a 400-node graph is close to settled well before
 * 80 iterations.
 */
export const LARGE_GRAPH_NODE_COUNT = 400;

/**
 * The floor the taper approaches.
 *
 * Measured (`iter-quality` probe, same machine) on the mean edge-length
 * deviation from the ideal 110px, and on the minimum node separation — the
 * layout's legibility contract, since a node's dot is up to 18px across:
 *
 *     n=1500   80 iters  246 ms   dev 5.94   minSep 47.4
 *              60 iters  191 ms   dev 6.21   minSep 33.5   (+4.6% dev)
 *              45 iters  141 ms   dev 6.48   minSep 30.9   (+9.1% dev)
 *              30 iters   91 ms   dev 6.98   minSep 23.5   (+17.7% dev)
 *              12 iters   37 ms   dev 8.51   minSep  3.2   (+43.4% dev, overlapping)
 *
 * 45 is the knee: it halves the layout time against 80 while keeping the
 * separation comfortably above the ~20px where dots start touching. Below it
 * the deviation climbs steeply for the time it buys, and at 12 the nodes
 * visibly overlap — a faster layout that produces an unreadable graph is not an
 * optimisation. `graph-performance.test.ts` pins the separation floor.
 */
export const MIN_LARGE_GRAPH_ITERATIONS = 45;

/**
 * Computes an organic, collision-free 2D force layout for knowledge graph nodes.
 * Guarantees that:
 * 1. Linked nodes cluster together naturally.
 * 2. Isolated/sparse nodes spread evenly in a balanced 2D cloud rather than stacking in a 1D column.
 * 3. Bounding boxes are spaced with adequate margin to prevent text label overlap.
 * 4. Is deterministic: the same graph lays out the same way on every call.
 *
 * Repulsion is exact below `EXACT_REPULSION_MAX_NODES` and Barnes-Hut above it;
 * the iteration budget tapers for large graphs. See `graphLayout.ts` for the
 * solver and the measurements behind both thresholds.
 *
 * @param iterationsOverride Test-only: run exactly this many iterations. Omit in
 *   product code so the size-derived budget applies.
 */
export function computeOrganicGraphPositions(
  graphData: GraphData,
  iterationsOverride?: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const n = graphData.nodes.length;
  if (n === 0) return positions;

  if (n === 1) {
    positions.set(graphData.nodes[0].id, { x: 0, y: 0 });
    return positions;
  }

  // 1. Initial 2D Golden Ratio Spiral placement to avoid any collinear 1D initialization
  const nodes = graphData.nodes.map((node, i) => {
    const angle = i * 2.3999632; // Golden ratio angle (~137.5 deg)
    const radius = 90 + 38 * Math.sqrt(i + 1);
    return {
      id: node.id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map<string, (typeof nodes)[0]>();
  for (const item of nodes) {
    nodeMap.set(item.id, item);
  }

  // 2. Physics simulation parameters
  const kRepulsion = 160000;
  const kSpring = 0.045;
  const idealEdgeLength = 110;
  const kGravity = 0.005;
  const minDistance = 95;

  // The quadtree is allocated once for the whole layout, not once per iteration:
  // 80 iterations × 3,200 nodes would otherwise hand the GC ~10⁵ short-lived
  // typed arrays. It is null (and never touched) for graphs small enough to
  // evaluate repulsion exactly.
  const repulsionTree = createRepulsionTree(n);

  // 3. Fast iterative simulation
  const iterations =
    iterationsOverride !== undefined
      ? Math.max(1, Math.floor(iterationsOverride))
      : layoutIterationsFor(n);
  for (let step = 0; step < iterations; step++) {
    const progress = step / iterations;
    const alpha = Math.pow(1 - progress, 1.2);

    // Gravity pulling gently toward (0, 0)
    for (let i = 0; i < n; i++) {
      const na = nodes[i];
      na.vx -= na.x * kGravity;
      na.vy -= na.y * kGravity;
    }

    // Coulomb repulsion. Brute force below EXACT_REPULSION_MAX_NODES (the
    // original O(n²) loop, unchanged); Barnes-Hut quadtree above it, which is
    // what keeps a 3,200-node vault from freezing the app for ten seconds.
    applyRepulsion(nodes, alpha, kRepulsion, minDistance, repulsionTree);

    // Hooke Springs pulling along edges
    for (const edge of graphData.edges) {
      const na = nodeMap.get(edge.source);
      const nb = nodeMap.get(edge.target);
      if (!na || !nb) continue;

      const dx = nb.x - na.x;
      const dy = nb.y - na.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const springForce = (dist - idealEdgeLength) * kSpring * alpha;

      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      na.vx += fx;
      na.vy += fy;
      nb.vx -= fx;
      nb.vy -= fy;
    }

    // Apply velocities with damping
    for (let i = 0; i < n; i++) {
      const na = nodes[i];
      na.x += na.vx * 0.5;
      na.y += na.vy * 0.5;
      na.vx *= 0.65;
      na.vy *= 0.65;
    }
  }

  // 4. Center coordinates around (0, 0)
  let sumX = 0;
  let sumY = 0;
  for (const n of nodes) {
    sumX += n.x;
    sumY += n.y;
  }
  const avgX = sumX / n;
  const avgY = sumY / n;

  for (const n of nodes) {
    positions.set(n.id, {
      x: Math.round(n.x - avgX),
      y: Math.round(n.y - avgY),
    });
  }

  return positions;
}
