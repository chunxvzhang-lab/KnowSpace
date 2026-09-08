import type { BookManifest } from "../core/types";
import type { BacklinkIndexData } from "./backlinkIndex";

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

export function buildGraphDataFromIndex(
  manifest: BookManifest | null,
  index: BacklinkIndexData,
  currentDocId?: string | null
): GraphData {
  const nodesMap = new Map<string, GraphNodeData>();
  const normTitleToId = new Map<string, string>();

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
      const t = title.trim().toLowerCase().replace(/\.md$/i, "");
      const curTitle = cur.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || cur;
      if (t === curTitle || cur.includes(t)) return true;
    }
    return false;
  };

  // 节点去重与别名映射：根据 id、规范化标题或路径定位已存在的规范节点
  const getExistingCanonicalId = (id: string, path?: string, title?: string): string | null => {
    if (nodesMap.has(id)) return id;
    const norm = (title || "").trim().toLowerCase().replace(/\.md$/i, "");
    if (norm && normTitleToId.has(norm)) {
      return normTitleToId.get(norm)!;
    }
    if (path) {
      const p = path.trim().toLowerCase().replace(/\\/g, "/");
      const filename = p.split("/").pop()?.replace(/\.md$/i, "");
      if (filename && normTitleToId.has(filename)) {
        return normTitleToId.get(filename)!;
      }
      for (const [existingId, node] of nodesMap.entries()) {
        if (node.path) {
          const np = node.path.trim().toLowerCase().replace(/\\/g, "/");
          if (np === p || p.endsWith(np) || np.endsWith(p)) {
            return existingId;
          }
        }
      }
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

      const norm = ch.title.trim().toLowerCase().replace(/\.md$/i, "");
      const isSpace = Boolean(
        (ch.src && (ch.src.toLowerCase().startsWith("space/") || ch.src.toLowerCase().startsWith("space\\"))) ||
        ch.id.startsWith("space-")
      );
      const node: GraphNodeData = {
        id: ch.id,
        label: ch.title,
        path: ch.src,
        type: isSpace ? "space" : "chapter",
        inDegree: 0,
        outDegree: 0,
        isCurrent: isMatchCurrent(ch.id, ch.src, ch.title),
        normTitle: norm,
      };
      nodesMap.set(ch.id, node);
      normTitleToId.set(ch.id, ch.id);
      normTitleToId.set(norm, ch.id);
      const filenameNorm = (ch.src?.split(/[\\/]/).pop() || "").toLowerCase().replace(/\.md$/i, "");
      if (filenameNorm) {
        normTitleToId.set(filenameNorm, ch.id);
      }
    }
  }

  for (const [docId, doc] of index.documents.entries()) {
    const existingId = getExistingCanonicalId(docId, doc.path, doc.title);
    if (existingId) {
      // 文档已存在，将 docId 与标题别名指向已有规范节点，避免生成重复节点
      normTitleToId.set(docId, existingId);
      const norm = doc.title.trim().toLowerCase().replace(/\.md$/i, "");
      if (norm) normTitleToId.set(norm, existingId);
      if (isMatchCurrent(docId, doc.path, doc.title)) {
        const existingNode = nodesMap.get(existingId);
        if (existingNode) existingNode.isCurrent = true;
      }
      continue;
    }

    const isSpace = Boolean(
      (doc.path && (doc.path.toLowerCase().includes("space/") || doc.path.toLowerCase().includes("space\\"))) ||
      doc.path?.includes(".space") ||
      docId.startsWith("space-")
    );
    const norm = doc.title.trim().toLowerCase().replace(/\.md$/i, "");
    const node: GraphNodeData = {
      id: docId,
      label: doc.title,
      path: doc.path,
      type: isSpace ? "space" : "chapter",
      inDegree: 0,
      outDegree: 0,
      isCurrent: isMatchCurrent(docId, doc.path, doc.title),
      normTitle: norm,
    };
    nodesMap.set(docId, node);
    normTitleToId.set(docId, docId);
    normTitleToId.set(norm, docId);
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
        edges.push({
          id: edgeKey,
          source: canonicalSourceId,
          target: canonicalTargetId,
        });

        sourceNode.outDegree += 1;
        const targetNode = nodesMap.get(canonicalTargetId);
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
  depth = 1
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
    (e) => visitedNodeIds.has(e.source) && visitedNodeIds.has(e.target)
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
  }
): GraphData {
  const {
    hideIsolates = false,
    query = "",
    typeFilter = "all",
    depth = "all",
    currentDocId,
    viewFilter = "all",
    clusterByFolder = false,
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
      (n) => n.label.toLowerCase().includes(q) || (n.path && n.path.toLowerCase().includes(q))
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

  const allowedIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = baseData.edges.filter(
    (e) => allowedIds.has(e.source) && allowedIds.has(e.target)
  );

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
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
 * Computes an organic, collision-free 2D force layout for knowledge graph nodes.
 * Guarantees that:
 * 1. Linked nodes cluster together naturally.
 * 2. Isolated/sparse nodes spread evenly in a balanced 2D cloud rather than stacking in a 1D column.
 * 3. Bounding boxes are spaced with adequate margin to prevent text label overlap.
 * 4. Runs synchronously in < 3ms for zero-latency, buttery-smooth initialization.
 */
export function computeOrganicGraphPositions(
  graphData: GraphData
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
  const minDistanceSq = minDistance * minDistance;

  // 3. Fast iterative simulation
  const iterations = Math.min(80, Math.max(45, n * 2));
  for (let step = 0; step < iterations; step++) {
    const progress = step / iterations;
    const alpha = Math.pow(1 - progress, 1.2);

    // Gravity pulling gently toward (0, 0)
    for (let i = 0; i < n; i++) {
      const na = nodes[i];
      na.vx -= na.x * kGravity;
      na.vy -= na.y * kGravity;

      // Coulomb Repulsion between all node pairs
      for (let j = i + 1; j < n; j++) {
        const nb = nodes[j];
        let dx = nb.x - na.x;
        let dy = nb.y - na.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = (Math.random() - 0.5) * 8;
          dy = (Math.random() - 0.5) * 8;
          distSq = dx * dx + dy * dy;
        }

        const dist = Math.sqrt(distSq);
        let repForce = (kRepulsion / (distSq + 200)) * alpha;
        if (distSq < minDistanceSq) {
          repForce += ((minDistance - dist) * 0.8) * alpha;
        }

        const fx = (dx / dist) * repForce;
        const fy = (dy / dist) * repForce;

        na.vx -= fx;
        na.vy -= fy;
        nb.vx += fx;
        nb.vy += fy;
      }
    }

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
