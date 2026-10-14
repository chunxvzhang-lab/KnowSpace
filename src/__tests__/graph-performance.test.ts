import { describe, expect, it } from "vitest";
import {
  LARGE_GRAPH_NODE_COUNT,
  MIN_LARGE_GRAPH_ITERATIONS,
  buildGraphDataFromIndex,
  computeOrganicGraphPositions,
  filterGraphData,
  layoutIterationsFor,
  type GraphData,
  type GraphNodeData,
} from "../services/graphService";
import {
  EXACT_REPULSION_MAX_NODES,
  applyRepulsion,
  createRepulsionTree,
  fitViewportToPositions,
} from "../services/graphLayout";
import type { BookManifest } from "../core/types";

/**
 * The graph performance work's two contracts.
 *
 * Both changes replaced a slower way of computing something with a faster one,
 * and a faster one that computes something *slightly different* is not an
 * optimisation — it is a silent change to the graph the user sees. So:
 *
 *   1. The path-alias lookup that used to be an O(n²) scan must return exactly
 *      what the scan returned, for every vault shape — including the odd ones
 *      the scan's raw `endsWith` produced. `referenceCanonicalLookup` below is a
 *      verbatim copy of the original algorithm, kept as the oracle.
 *   2. The Barnes-Hut repulsion must be a pure speed change for small graphs
 *      (bit-identical to brute force, which is what actually runs below the
 *      threshold) and a usable approximation above it.
 */

// ── Oracle: the ORIGINAL canonical-id scan, verbatim ────────────────────────

const stripDocExt = (str: string) => str.replace(/\.(md|markdown|canvas)$/i, "");

/** The exact body of the pre-optimisation `buildGraphDataFromIndex`. */
function referenceBuild(manifest: BookManifest | null, index: any, currentDocId?: string | null) {
  const nodesMap = new Map<string, GraphNodeData>();
  const normTitleToId = new Map<string, string>();
  const normPathToId = new Map<string, string>();

  const registerNode = (node: GraphNodeData) => {
    nodesMap.set(node.id, node);
    normTitleToId.set(node.id, node.id);
    if (node.normTitle) normTitleToId.set(node.normTitle, node.id);
    if (node.path) {
      const p = node.path.trim().toLowerCase().replace(/\\/g, "/");
      normPathToId.set(p, node.id);
      const filename = stripDocExt(p.split("/").pop() || "");
      if (filename) {
        normTitleToId.set(filename, node.id);
        normPathToId.set(filename, node.id);
      }
    }
  };

  const isMatchCurrent = (id: string, path?: string, title?: string): boolean => {
    if (!currentDocId) return false;
    let cur = currentDocId.trim().toLowerCase();
    try {
      if (cur.includes("%")) cur = decodeURIComponent(cur).toLowerCase();
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

  const getExistingCanonicalId = (id: string, path?: string, title?: string): string | null => {
    if (nodesMap.has(id)) return id;
    const norm = stripDocExt((title || "").trim().toLowerCase());
    if (norm && normTitleToId.has(norm)) return normTitleToId.get(norm)!;
    if (path) {
      const p = path.trim().toLowerCase().replace(/\\/g, "/");
      if (normPathToId.has(p)) return normPathToId.get(p)!;
      const filename = stripDocExt(p.split("/").pop() || "");
      if (filename && normTitleToId.has(filename)) return normTitleToId.get(filename)!;
      for (const [np, existingId] of normPathToId.entries()) {
        if (p.endsWith(np) || np.endsWith(p)) return existingId;
      }
    }
    return null;
  };

  const extractFolderGroup = (path?: string, type?: string) => {
    if (type === "space") return "闪念 Space";
    if (!path) return "根目录";
    const parts = path.replace(/\\/g, "/").trim().split("/").filter(Boolean);
    return parts.length <= 1 ? "根目录" : parts[0];
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
      registerNode({
        id: ch.id,
        label: ch.title,
        path: ch.src,
        type: isSpace ? "space" : "chapter",
        inDegree: 0,
        outDegree: 0,
        isCurrent: isMatchCurrent(ch.id, ch.src, ch.title),
        normTitle: norm,
        folderGroup: extractFolderGroup(ch.src, isSpace ? "space" : "chapter"),
      });
    }
  }

  for (const [docId, doc] of index.documents.entries()) {
    const existingId = getExistingCanonicalId(docId, doc.path, doc.title);
    if (existingId) {
      normTitleToId.set(docId, existingId);
      const norm = stripDocExt(doc.title.trim().toLowerCase());
      if (norm) normTitleToId.set(norm, existingId);
      if (isMatchCurrent(docId, doc.path, doc.title)) {
        const n = nodesMap.get(existingId);
        if (n) n.isCurrent = true;
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
    registerNode({
      id: docId,
      label: doc.title,
      path: doc.path,
      type: isSpace ? "space" : "chapter",
      inDegree: 0,
      outDegree: 0,
      isCurrent: isMatchCurrent(docId, doc.path, doc.title),
      normTitle: norm,
      folderGroup: extractFolderGroup(doc.path, isSpace ? "space" : "chapter"),
    });
  }

  const edges: any[] = [];
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
        const sf = sourceNode.folderGroup || extractFolderGroup(sourceNode.path, sourceNode.type);
        const tf = targetNode
          ? targetNode.folderGroup || extractFolderGroup(targetNode.path, targetNode.type)
          : undefined;
        edges.push({
          id: edgeKey,
          source: canonicalSourceId,
          target: canonicalTargetId,
          isCrossFolder: Boolean(sf && tf && sf !== tf),
          sourceDir: sf,
          targetDir: tf,
        });
        sourceNode.outDegree += 1;
        if (targetNode) targetNode.inDegree += 1;
      }
    }
  }

  return { nodes: Array.from(nodesMap.values()), edges };
}

function normalize(graph: any) {
  const byId = (a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    nodes: graph.nodes.map((n: any) => ({ ...n })).sort(byId),
    edges: graph.edges.map((e: any) => ({ ...e })).sort(byId),
  };
}

/** Deterministic PRNG so a failure is reproducible from its seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A vault whose paths deliberately collide on suffixes, and whose manifest ids
 * deliberately differ from index ids — that combination is what reaches the
 * suffix branch of the canonical lookup.
 */
function randomVault(seed: number, count: number) {
  const rnd = mulberry32(seed);
  const names = ["readme", "me", "index", "note", "a", "guide", "docs", "topic"];
  const folders = ["", "docs/", "docs/sub/", "notes/", "space/", "deep/deeper/"];
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

  const chapters: any[] = [];
  const documents = new Map<string, any>();
  const backlinks = new Map<string, any[]>();
  const forwardLinks = new Map<string, Set<string>>();
  const usedPaths = new Set<string>();

  for (let i = 0; i < count; i++) {
    const ext = pick([".md", ".markdown", ".canvas", ""]);
    let path = `${pick(folders)}${pick(names)}${i % 7 === 0 ? "-" + i : ""}${ext}`;
    if (usedPaths.has(path)) path = `${pick(folders)}${pick(names)}-${i}${ext}`;
    usedPaths.add(path);

    const title = pick(names) + (i % 5 === 0 ? " " + i : "");
    const chapId = `chap-${i}`;
    // 40% of documents share the manifest's id; the rest do not, which forces
    // the path/title branches.
    const docId = rnd() < 0.4 ? chapId : `uploaded-${i}`;
    chapters.push({ id: chapId, title, src: path });

    const targets: string[] = [];
    for (let k = 0; k < 3; k++) {
      const t = Math.floor(rnd() * count);
      if (t !== i) targets.push(`[[${pick(names)}${t % 7 === 0 ? "-" + t : ""}]]`);
    }
    const content = targets.join(" ");
    documents.set(docId, { id: docId, title, path, content });

    const fwd = new Set<string>();
    for (const m of content.matchAll(/\[\[([^\]\n|]+)\]\]/g)) {
      const norm = m[1].trim().toLowerCase();
      fwd.add(norm);
      const refs = backlinks.get(norm) || [];
      refs.push({
        sourceId: docId,
        sourceTitle: title,
        sourcePath: path,
        line: 1,
        snippet: "",
        target: m[1],
      });
      backlinks.set(norm, refs);
    }
    forwardLinks.set(docId, fwd);
  }

  return {
    manifest: { id: "b", title: "b", chapters } as BookManifest,
    index: { documents, backlinks, forwardLinks } as any,
  };
}

// ── 1. The canonical lookup is behaviour-preserving ─────────────────────────

describe("path-alias lookup equals the original scan", () => {
  it("produces byte-identical graphs across randomized vault shapes", () => {
    const mismatches: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const count = 5 + (seed % 30);
      const { manifest, index } = randomVault(seed, count);
      const currentDocId = seed % 3 === 0 ? "docs/readme.md" : undefined;

      const actual = JSON.stringify(
        normalize(buildGraphDataFromIndex(manifest, index, currentDocId)),
      );
      const expected = JSON.stringify(normalize(referenceBuild(manifest, index, currentDocId)));
      if (actual !== expected) mismatches.push(`seed ${seed} (n=${count})`);
    }
    expect(mismatches, `这些随机仓库上新旧结果不一致：${mismatches.join(", ")}`).toEqual([]);
  });

  it("still resolves a document whose manifest id differs from its index id", () => {
    // The dedup case the suffix branch exists for: the same file appears in the
    // manifest under one id and in the index under another. It must collapse to
    // one node, and the manifest's id must win (it is registered first).
    const manifest: BookManifest = {
      id: "book",
      title: "Book",
      chapters: [{ id: "chapter-0", title: "USER_MANUAL", src: "docs/USER_MANUAL.md" }],
    };
    const index = {
      documents: new Map([
        [
          "uploaded-0",
          {
            id: "uploaded-0",
            title: "USER_MANUAL",
            path: "docs/USER_MANUAL.md",
            content: "",
          },
        ],
      ]),
      backlinks: new Map(),
      forwardLinks: new Map(),
    } as any;

    const graph = buildGraphDataFromIndex(manifest, index, "chapter-0");
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0].id).toBe("chapter-0");
    expect(graph.nodes[0].isCurrent).toBe(true);
  });

  it("keeps the raw-endsWith dedup the original produced, not a tidier rule", () => {
    // The original matched on a bare `endsWith`, so "docs/readme.md" and
    // "readme.md" collapsed even though the shorter is not a `/`-aligned
    // suffix. That is arguably a bug, but changing it would change which
    // documents deduplicate, which is a data change and not this task's. The
    // oracle above would catch a "cleaner" implementation; this pins the
    // concrete case so the intent is on the record.
    const manifest: BookManifest = {
      id: "book",
      title: "Book",
      chapters: [{ id: "a", title: "Readme", src: "docs/readme.md" }],
    };
    const index = {
      documents: new Map([["b", { id: "b", title: "Readme", path: "readme.md", content: "" }]]),
      backlinks: new Map(),
      forwardLinks: new Map(),
    } as any;

    const graph = buildGraphDataFromIndex(manifest, index, "a");
    const reference = referenceBuild(manifest, index, "a");
    expect(graph.nodes.length).toBe(reference.nodes.length);
  });
});

// ── 2. Repulsion: exact below the threshold, approximate above it ────────────

describe("graph repulsion", () => {
  const bodies = (n: number, seed = 3) => {
    const rnd = mulberry32(seed);
    return Array.from({ length: n }, () => ({
      x: (rnd() - 0.5) * 900,
      y: (rnd() - 0.5) * 900,
      vx: 0,
      vy: 0,
    }));
  };

  it("is bit-identical to brute force at and below the threshold", () => {
    // Below the threshold the original loop is what runs, so this is really
    // asserting the dispatch: the quadtree path must not be taken early, and
    // the exact path must still be the original arithmetic.
    for (const n of [2, 3, 50, EXACT_REPULSION_MAX_NODES]) {
      const a = bodies(n);
      const b = bodies(n);

      applyRepulsion(a, 0.7, 160000, 95, null);
      applyRepulsion(b, 0.7, 160000, 95, createRepulsionTree(n));

      expect(a, `n=${n}`).toEqual(b);
    }
  });

  it("moves every node and keeps the result finite above the threshold", () => {
    const n = EXACT_REPULSION_MAX_NODES + 300;
    const nodes = bodies(n);
    const tree = createRepulsionTree(n);
    expect(tree, "超过阈值时应当分配四叉树").not.toBeNull();

    applyRepulsion(nodes, 1, 160000, 95, tree);

    for (const [i, node] of nodes.entries()) {
      expect(Number.isFinite(node.vx), `node ${i} vx`).toBe(true);
      expect(Number.isFinite(node.vy), `node ${i} vy`).toBe(true);
      // Repulsion only pushes apart, and every node has at least one
      // neighbour, so no node may be left with a zero impulse.
      expect(Math.abs(node.vx) + Math.abs(node.vy), `node ${i} did not move`).toBeGreaterThan(0);
    }
  });

  it("pushes coincident nodes apart instead of producing NaN", () => {
    // Every node at the origin: the degenerate case the original handled with
    // Math.random(). The tree cannot separate them by splitting, so this also
    // exercises the depth cap.
    const n = EXACT_REPULSION_MAX_NODES + 50;
    const nodes = Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
    applyRepulsion(nodes, 1, 160000, 95, createRepulsionTree(n));

    for (const [i, node] of nodes.entries()) {
      expect(Number.isFinite(node.vx), `node ${i} vx`).toBe(true);
      expect(Number.isFinite(node.vy), `node ${i} vy`).toBe(true);
    }
    const moving = nodes.filter((nd) => Math.abs(nd.vx) + Math.abs(nd.vy) > 0).length;
    expect(moving).toBe(n);
  });

  it("lays out a large graph without collisions and without NaN", () => {
    const n = 900;
    const rnd = mulberry32(11);
    const graph: GraphData = {
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "chapter" as const,
        inDegree: 0,
        outDegree: 0,
        normTitle: `node ${i}`,
      })),
      edges: Array.from({ length: n }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${Math.floor(rnd() * n)}`,
      })),
    };

    const positions = computeOrganicGraphPositions(graph);
    expect(positions.size).toBe(n);

    const points = [...positions.values()];
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }

    // The layout's contract is that nodes do not sit on top of each other, and
    // the Barnes-Hut approximation must not break it. Checking every pair is
    // O(n²) — 400k distance computations for this graph, which timed out under
    // a loaded full-suite run. A uniform grid answers the same question in
    // O(n): two nodes closer than the minimum separation must share a cell or
    // sit in adjacent cells.
    const MIN_SEPARATION = 20;
    const cell = MIN_SEPARATION;
    const grid = new Map<string, number[]>();
    const cellKey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;

    for (let i = 0; i < points.length; i++) {
      const key = cellKey(points[i].x, points[i].y);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    const collisions: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const cx = Math.floor(points[i].x / cell);
      const cy = Math.floor(points[i].y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(`${cx + ox},${cy + oy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
            if (d <= MIN_SEPARATION) {
              collisions.push(`${i}↔${j} = ${d.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(collisions.slice(0, 5), `${collisions.length} 对节点重叠`).toEqual([]);
  });

  it("lays out the same graph identically on every call", () => {
    // The old coincident-node jitter used Math.random(), so re-opening the pane
    // or toggling a filter and toggling it back moved the nodes. The
    // replacement is deterministic on purpose.
    const graph: GraphData = {
      nodes: Array.from({ length: 300 }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "chapter" as const,
        inDegree: 0,
        outDegree: 0,
        normTitle: `node ${i}`,
      })),
      edges: Array.from({ length: 300 }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${(i * 7) % 300}`,
      })),
    };

    const first = [...computeOrganicGraphPositions(graph).entries()];
    const second = [...computeOrganicGraphPositions(graph).entries()];
    expect(second).toEqual(first);
  });
});

// ── 4. The iteration budget ─────────────────────────────────────────────────

describe("layout iteration budget", () => {
  it("keeps the original budget for small graphs", () => {
    // Anything at or below the knee gets exactly what it always got: 80 for
    // every graph of 40+ nodes, and the `n * 2` ramp below that (floored at 45).
    expect(layoutIterationsFor(40)).toBe(80);
    expect(layoutIterationsFor(100)).toBe(80);
    expect(layoutIterationsFor(LARGE_GRAPH_NODE_COUNT)).toBe(80);
    expect(layoutIterationsFor(20)).toBe(45); // 20 * 2 = 40, floored
    expect(layoutIterationsFor(2)).toBe(45);
  });

  it("tapers above the knee without going below the floor", () => {
    const atKnee = layoutIterationsFor(LARGE_GRAPH_NODE_COUNT);
    const doubled = layoutIterationsFor(LARGE_GRAPH_NODE_COUNT * 3);
    const huge = layoutIterationsFor(50_000);

    expect(doubled).toBeLessThan(atKnee);
    expect(doubled).toBeGreaterThanOrEqual(MIN_LARGE_GRAPH_ITERATIONS);
    expect(huge).toBe(MIN_LARGE_GRAPH_ITERATIONS);
  });

  it("never returns a non-positive or fractional count", () => {
    for (const n of [0, 1, 2, 39, 40, 401, 1_000, 100_000]) {
      const iters = layoutIterationsFor(n);
      expect(Number.isInteger(iters), `n=${n} 给了非整数迭代数 ${iters}`).toBe(true);
      expect(iters, `n=${n}`).toBeGreaterThan(0);
    }
  });

  it("still separates nodes at the tapered budget", () => {
    // The floor exists because the layout's legibility contract is that dots do
    // not touch. The measurement behind MIN_LARGE_GRAPH_ITERATIONS showed the
    // minimum separation collapsing at 30 iterations (23.5px at n=1500, and
    // 3.2px at 12), so this asserts the contract holds at the budget the taper
    // actually picks — not at 80, which would pass regardless.
    const n = 900;
    const rnd = mulberry32(5);
    const graph: GraphData = {
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "chapter" as const,
        inDegree: 0,
        outDegree: 0,
        normTitle: `node ${i}`,
      })),
      edges: Array.from({ length: n }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${Math.floor(rnd() * n)}`,
      })),
    };

    const budget = layoutIterationsFor(n);
    const positions = computeOrganicGraphPositions(graph, budget);
    const points = [...positions.values()];

    // Sample-based minimum separation: the full pairwise scan is O(n²).
    let minD = Infinity;
    for (let i = 0; i < points.length; i += 3) {
      for (let j = i + 1; j < points.length; j += 3) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        if (d < minD) minD = d;
      }
    }
    expect(minD, `迭代 ${budget} 次后节点几乎重叠`).toBeGreaterThan(20);
  });
});

// ── 5. The viewport fit ─────────────────────────────────────────────────────

describe("fitViewportToPositions", () => {
  const W = 400;
  const H = 800;

  it("frames the node bounds inside the canvas", () => {
    const positions = [
      { x: -100, y: -50 },
      { x: 100, y: 50 },
    ];
    const fit = fitViewportToPositions(positions, W, H, { padding: 36, nodeExtent: 18 })!;
    expect(fit).not.toBeNull();

    // Both nodes must land inside the canvas once the viewport is applied:
    // rendered = (world * zoom) + pan.
    for (const p of positions) {
      const rx = p.x * fit.zoom + fit.pan.x;
      const ry = p.y * fit.zoom + fit.pan.y;
      expect(rx).toBeGreaterThanOrEqual(0);
      expect(rx).toBeLessThanOrEqual(W);
      expect(ry).toBeGreaterThanOrEqual(0);
      expect(ry).toBeLessThanOrEqual(H);
    }
  });

  it("centres the graph", () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const fit = fitViewportToPositions(positions, W, H)!;
    // The midpoint of the bounds maps to the centre of the canvas.
    const midX = 100 * fit.zoom + fit.pan.x;
    expect(midX).toBeCloseTo(W / 2, 6);
  });

  it("fits the constraining axis, not just one of them", () => {
    // A very wide, very short graph is limited by the width; a very tall, very
    // narrow one by the height. The expected zoom is the MIN of the two axis
    // ratios, so a test that only computes one of them passes for the wrong
    // reason on the other orientation.
    //
    // minZoom is opened up for this case: at these extreme extents the true
    // ratio (≈0.033) is below the instance's 0.15 floor, and the clamp would
    // hide the very comparison being made.
    const opts = { padding: 36, nodeExtent: 18, minZoom: 0.001, maxZoom: 4.5 };
    const wide = fitViewportToPositions(
      [
        { x: -5000, y: 0 },
        { x: 5000, y: 0 },
      ],
      W,
      H,
      opts,
    )!;
    const tall = fitViewportToPositions(
      [
        { x: 0, y: -5000 },
        { x: 0, y: 5000 },
      ],
      W,
      H,
      opts,
    )!;

    const expectedZoom = (half: number, canvas: number) => (canvas - 72) / (half * 2 + 36);
    expect(wide.zoom).toBeCloseTo(Math.min(expectedZoom(5000, W), expectedZoom(0, H)), 6);
    expect(tall.zoom).toBeCloseTo(Math.min(expectedZoom(0, W), expectedZoom(5000, H)), 6);
    // On this canvas the height is the roomier axis, so the wide graph is the
    // width-limited one and must end up more zoomed out.
    expect(wide.zoom).toBeLessThan(tall.zoom);
  });

  it("respects the zoom clamps", () => {
    // A single node is a degenerate box; without a clamp the zoom would be
    // enormous.
    const single = fitViewportToPositions([{ x: 0, y: 0 }], W, H, {
      minZoom: 0.15,
      maxZoom: 4.5,
    })!;
    expect(single.zoom).toBeLessThanOrEqual(4.5);

    const tiny = fitViewportToPositions(
      [
        { x: -100000, y: -100000 },
        { x: 100000, y: 100000 },
      ],
      W,
      H,
      { minZoom: 0.15, maxZoom: 4.5 },
    )!;
    expect(tiny.zoom).toBeGreaterThanOrEqual(0.15);
  });

  it("returns null for an empty graph or an unlaid-out container", () => {
    expect(fitViewportToPositions([], W, H)).toBeNull();
    // The flex split pane reports zero width on its first frame; a fit computed
    // from that would be meaningless, so the caller must be told to skip.
    expect(fitViewportToPositions([{ x: 0, y: 0 }], 0, H)).toBeNull();
    expect(fitViewportToPositions([{ x: 0, y: 0 }], W, 0)).toBeNull();
  });

  it("ignores non-finite positions instead of producing a NaN viewport", () => {
    const fit = fitViewportToPositions(
      [
        { x: Number.NaN, y: 0 },
        { x: 0, y: 0 },
        { x: Number.POSITIVE_INFINITY, y: 10 },
      ],
      W,
      H,
    )!;
    expect(Number.isFinite(fit.zoom)).toBe(true);
    expect(Number.isFinite(fit.pan.x)).toBe(true);
    expect(Number.isFinite(fit.pan.y)).toBe(true);
  });

  it("keeps every node of a real layout on screen", () => {
    // The end-to-end property the fit exists for: after laying out a graph and
    // framing it, no node is outside the canvas.
    //
    // The tolerance is the node's own drawn radius. `fitViewportToPositions`
    // frames the node CENTRES and reserves `nodeExtent` (18px) of slack around
    // the bounds, so a node sitting exactly on the extreme edge can have its
    // circle overhang by up to that radius before the padding absorbs it — the
    // fit is about the graph being visible, not about every disc being fully
    // inscribed. Asserting zero overhang would be asserting a framing the
    // function deliberately does not produce.
    const NODE_RADIUS = 18;
    const n = 300;
    const rnd = mulberry32(17);
    const graph: GraphData = {
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "chapter" as const,
        inDegree: 0,
        outDegree: 0,
        normTitle: `node ${i}`,
      })),
      edges: Array.from({ length: n }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${Math.floor(rnd() * n)}`,
      })),
    };

    const positions = computeOrganicGraphPositions(graph);
    const fit = fitViewportToPositions(positions.values(), W, H, { padding: 36 })!;
    expect(fit).not.toBeNull();

    const offscreen: string[] = [];
    let maxOverhang = 0;
    for (const [id, p] of positions) {
      const rx = p.x * fit.zoom + fit.pan.x;
      const ry = p.y * fit.zoom + fit.pan.y;
      const overhang = Math.max(-rx, rx - W, -ry, ry - H, 0);
      if (overhang > maxOverhang) maxOverhang = overhang;
      if (overhang > NODE_RADIUS) {
        offscreen.push(`${id} @ ${rx.toFixed(1)},${ry.toFixed(1)} (+${overhang.toFixed(1)}px)`);
      }
    }
    expect(offscreen.slice(0, 5), `${offscreen.length} 个节点超出视口超过节点半径`).toEqual([]);
    // And the overhang that does exist stays within the reserved slack, i.e.
    // the graph fills the canvas rather than being framed far too small.
    expect(maxOverhang).toBeLessThanOrEqual(NODE_RADIUS);
  });
});

// ── 3. The node cap ─────────────────────────────────────────────────────────

describe("node cap", () => {
  const graph = (n: number): GraphData => ({
    nodes: Array.from({ length: n }, (_, i) => ({
      id: `n${String(i).padStart(4, "0")}`,
      label: `Node ${i}`,
      type: "chapter" as const,
      // Descending degree: n0000 has the most links, n(n-1) has none.
      inDegree: n - i,
      outDegree: 0,
      normTitle: `node ${i}`,
      isCurrent: i === n - 1, // the LEAST connected node is the active one
    })),
    edges: [],
  });

  it("is off by default, so existing callers are unchanged", () => {
    const result = filterGraphData(graph(50), {});
    expect(result.nodes.length).toBe(50);
    expect(result.omittedNodeCount).toBe(0);
  });

  it("keeps the most connected nodes and reports the rest", () => {
    const result = filterGraphData(graph(100), { maxNodes: 30 });
    expect(result.nodes.length).toBe(30);
    expect(result.omittedNodeCount).toBe(70);
    expect(result.totalNodeCount).toBe(100);

    // Degree ranking fills the cap first: the 30 highest-degree nodes are
    // n0000..n0029 (degrees 100..71). The active document is then pinned, which
    // displaces the lowest-ranked kept node — so the kept set is n0000..n0028
    // plus the active n0099, and the smallest kept degree is the active node's.
    const keptIds = result.nodes.map((n) => n.id);
    for (let i = 0; i <= 28; i++) {
      expect(keptIds, `n${String(i).padStart(4, "0")} 应当入选`).toContain(
        `n${String(i).padStart(4, "0")}`,
      );
    }
    // n0029 (degree 71) is the one the pin displaced.
    expect(keptIds).not.toContain("n0029");
    expect(keptIds).toContain("n0099");

    const keptDegrees = result.nodes.map((n) => n.inDegree).sort((a, b) => b - a);
    expect(keptDegrees[0]).toBe(100);
    expect(keptDegrees[1]).toBe(99);
    expect(keptDegrees.at(-1)).toBe(1); // the pinned active document
  });

  it("always keeps the active document, even when it is the least connected", () => {
    const result = filterGraphData(graph(100), { maxNodes: 30 });
    expect(
      result.nodes.some((n) => n.isCurrent),
      "当前文档被裁掉了",
    ).toBe(true);
    expect(result.nodes.length).toBe(30);
  });

  it("is deterministic: the same vault always yields the same subset", () => {
    const a = filterGraphData(graph(200), { maxNodes: 40 });
    const b = filterGraphData(graph(200), { maxNodes: 40 });
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
  });

  it("drops the edges of omitted nodes rather than leaving them dangling", () => {
    const n = 40;
    const withEdges: GraphData = {
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "chapter" as const,
        inDegree: i === 0 ? 0 : 1,
        outDegree: 0,
        normTitle: `node ${i}`,
        isCurrent: false,
      })),
      // n1..n39 each point at n0, so n0 is the hub and survives the cap.
      edges: Array.from({ length: n - 1 }, (_, i) => ({
        id: `e${i}`,
        source: `n${i + 1}`,
        target: "n0",
      })),
    };

    const result = filterGraphData(withEdges, { maxNodes: 5 });
    const ids = new Set(result.nodes.map((nd) => nd.id));
    for (const edge of result.edges) {
      expect(ids.has(edge.source), `edge ${edge.id} source dropped`).toBe(true);
      expect(ids.has(edge.target), `edge ${edge.id} target dropped`).toBe(true);
    }
  });

  it("preserves the pre-cap node order so nothing downstream sees a reshuffle", () => {
    const full = filterGraphData(graph(60), {});
    const capped = filterGraphData(graph(60), { maxNodes: 60 });
    expect(capped.nodes.map((n) => n.id)).toEqual(full.nodes.map((n) => n.id));
  });
});
