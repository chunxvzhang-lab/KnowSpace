/**
 * The graph's repulsion pass, as a pure function over positions and velocities.
 *
 * `computeOrganicGraphPositions` used to evaluate the Coulomb sum by brute
 * force: one inner loop over all other nodes, for every node, for every
 * iteration. Measured on this machine, that is 80 iterations of n²/2 pair
 * evaluations, and it dominates everything else the graph pane does:
 *
 *      nodes   pairs/iter    layout
 *         50        1,225     14.5 ms
 *        200       19,900     29.5 ms
 *        800      319,600    405.1 ms
 *       1600    1,279,200  1,794.3 ms
 *       3200    5,118,400 10,413.5 ms
 *
 * The layout runs synchronously inside the Cytoscape init effect, so at 3,200
 * nodes opening the graph pane blocks the main thread for ten seconds — the
 * whole app is frozen, not just the pane. A real vault reaches that size; the
 * 2,000-note case is already a quarter of a second of frozen UI on every filter
 * change, because each change produces a new `filteredData` identity and
 * re-runs the init effect.
 *
 * Barnes-Hut makes the far field cheap: bodies that are far away are treated as
 * one aggregate mass at their centre of mass, which is what the 1/dist² term
 * converges to anyway. Near cells are still evaluated exactly, one body at a
 * time, so close-range behaviour — including the hard `minDistance` separation
 * the layout relies on to keep labels from overlapping — is unchanged.
 *
 * The switch is by size: at or below `EXACT_REPULSION_MAX_NODES` the original
 * brute-force loop runs verbatim, so small graphs (the local 1-hop subgraph, a
 * small vault) keep bit-identical layout and pay no tree-building cost. Above
 * it, the quadtree takes over. Both paths apply the same force law:
 *
 *     repForce = kRepulsion / (distSq + 200) * alpha          (far field)
 *     repForce += (minDistance - dist) * 0.8 * alpha          (when closer
 *                                                              than minDistance)
 *
 * Pure domain code: no React, no DOM, no globals (L2 in the capability plan's
 * layering).
 */

/** A body the solver moves. Mutated in place, like the original node records. */
export type LayoutBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/**
 * Above this node count the quadtree is used. Chosen where brute force is still
 * comfortably inside a frame budget (192² / 2 × 80 ≈ 1.5M pair evaluations,
 * ≈ 35 ms measured) and where the tree's own build cost is negligible.
 */
export const EXACT_REPULSION_MAX_NODES = 192;

/**
 * Barnes-Hut opening angle. A cell is treated as a single mass when its width
 * is less than `THETA` times the distance to the body being pushed. 0.9 is the
 * usual choice: it keeps the far field approximate and the near field exact.
 */
const THETA = 0.9;
const THETA_SQ = THETA * THETA;

/**
 * Hard cap on tree depth. Cells halve on every split, so IEEE-754 doubles run
 * out of resolution around depth 52; this stops short of that. It only binds
 * when bodies are exactly coincident, which is the one case splitting cannot
 * resolve.
 */
const MAX_DEPTH = 48;

/** Matches the `+ 200` softening the original loop used. */
const SOFTENING = 200;
/** The original's short-range separation weight. */
const SEPARATION_WEIGHT = 0.8;

/**
 * Deterministic stand-in for the original's `Math.random()` jitter.
 *
 * The original nudged exactly-coincident nodes apart with random offsets. Two
 * nodes at the same coordinates are a real case (a duplicated document, two
 * notes with identical positions after a filter), but randomness made the
 * layout differ between runs of the same data — re-opening the pane, or
 * toggling a filter and toggling it back, moved the nodes. This is a
 * deterministic function of the node index instead, so the same graph lays out
 * the same way every time.
 */
function coincidentJitter(index: number): { dx: number; dy: number } {
  const a = Math.sin(index * 12.9898) * 43758.5453;
  const b = Math.sin(index * 78.233) * 12345.6789;
  return { dx: (a - Math.floor(a) - 0.5) * 8, dy: (b - Math.floor(b) - 0.5) * 8 };
}

/** The original brute-force pass, verbatim, for graphs small enough to afford it. */
function applyExactRepulsion(
  nodes: LayoutBody[],
  alpha: number,
  kRepulsion: number,
  minDistance: number,
): void {
  const n = nodes.length;
  const minDistanceSq = minDistance * minDistance;

  for (let i = 0; i < n; i++) {
    const na = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const nb = nodes[j];
      let dx = nb.x - na.x;
      let dy = nb.y - na.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) {
        const jitter = coincidentJitter(i * n + j);
        dx = jitter.dx;
        dy = jitter.dy;
        distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
      }

      const dist = Math.sqrt(distSq);
      let repForce = (kRepulsion / (distSq + SOFTENING)) * alpha;
      if (distSq < minDistanceSq) {
        repForce += (minDistance - dist) * SEPARATION_WEIGHT * alpha;
      }

      const fx = (dx / dist) * repForce;
      const fy = (dy / dist) * repForce;

      na.vx -= fx;
      na.vy -= fy;
      nb.vx += fx;
      nb.vy += fy;
    }
  }
}

/**
 * A quadtree over the current body positions, in flat typed arrays.
 *
 * Flat arrays rather than objects on purpose: this is rebuilt on every
 * iteration (80 times per layout), and an object per cell would hand the GC
 * ~10⁵ short-lived objects per layout at 3,200 nodes. The arrays are allocated
 * once per layout and reset between iterations.
 *
 * Capacity: an incrementally built quadtree that splits a leaf only when a
 * second body arrives has at most n-1 internal cells (every internal cell holds
 * at least two bodies, so the non-empty leaves number exactly n) and four
 * children per internal cell, hence at most 4n-3 cells in total. 4n+8 covers
 * it with room to spare.
 */
class QuadTree {
  private readonly child: Int32Array;
  private readonly body: Int32Array;
  private readonly mass: Float64Array;
  private readonly comX: Float64Array;
  private readonly comY: Float64Array;
  private readonly x0: Float64Array;
  private readonly y0: Float64Array;
  private readonly x1: Float64Array;
  private readonly y1: Float64Array;
  private readonly stack: Int32Array;
  private used = 0;

  constructor(private readonly capacity: number) {
    this.child = new Int32Array(capacity * 4);
    this.body = new Int32Array(capacity);
    this.mass = new Float64Array(capacity);
    this.comX = new Float64Array(capacity);
    this.comY = new Float64Array(capacity);
    this.x0 = new Float64Array(capacity);
    this.y0 = new Float64Array(capacity);
    this.x1 = new Float64Array(capacity);
    this.y1 = new Float64Array(capacity);
    // Depth-first traversal stack; a quadtree over n points is O(log n) deep,
    // and 64 levels already means 2^64 leaves.
    // Traversal stack, sized from the tree's own depth bound rather than a
    // guess. A cell halves on every split, so with IEEE-754 doubles depth is
    // capped near 52 + log2(size) — call it 64. A DFS that pushes four children
    // and pops one nets +3 pending entries per level, so 1 + 3 × 64 = 193 is the
    // worst case. Writing past the end of a typed array is silently ignored, so
    // an undersized stack would not throw — it would quietly stop visiting
    // cells and bias the forces. 512 leaves room and is 2 KB.
    this.stack = new Int32Array(512);
  }

  /** Discards the previous tree and allocates a root covering the square bounds. */
  reset(minX: number, minY: number, size: number): void {
    // Only the root needs clearing: `newNode` initialises every other slot it
    // hands out, so filling the whole `child` array here would be 4 × capacity
    // writes per iteration for no gain.
    this.body[0] = -1;
    this.mass[0] = 0;
    this.child[0] = -1;
    this.child[1] = -1;
    this.child[2] = -1;
    this.child[3] = -1;
    this.x0[0] = minX;
    this.y0[0] = minY;
    this.x1[0] = minX + size;
    this.y1[0] = minY + size;
    this.used = 1;
  }

  private newNode(x0: number, y0: number, x1: number, y1: number): number {
    const slot = this.used++;
    this.body[slot] = -1;
    this.mass[slot] = 0;
    this.x0[slot] = x0;
    this.y0[slot] = y0;
    this.x1[slot] = x1;
    this.y1[slot] = y1;
    const base = slot * 4;
    this.child[base] = -1;
    this.child[base + 1] = -1;
    this.child[base + 2] = -1;
    this.child[base + 3] = -1;
    return slot;
  }

  /** Child quadrant index for a point: 0 = NW, 1 = NE, 2 = SW, 3 = SE. */
  private quadrant(slot: number, x: number, y: number): number {
    const mx = (this.x0[slot] + this.x1[slot]) / 2;
    const my = (this.y0[slot] + this.y1[slot]) / 2;
    return (x >= mx ? 1 : 0) + (y >= my ? 2 : 0);
  }

  private childBounds(slot: number, q: number, out: Float64Array): void {
    const mx = (this.x0[slot] + this.x1[slot]) / 2;
    const my = (this.y0[slot] + this.y1[slot]) / 2;
    const left = (q & 1) === 0;
    const top = (q & 2) === 0;
    out[0] = left ? this.x0[slot] : mx;
    out[1] = top ? this.y0[slot] : my;
    out[2] = left ? mx : this.x1[slot];
    out[3] = top ? my : this.y1[slot];
  }

  /** Inserts one body, splitting leaves as needed, and folds it into every mass. */
  insert(bodyIndex: number, x: number, y: number, nodes: LayoutBody[]): void {
    let slot = 0;
    let depth = 0;
    const bounds = new Float64Array(4);

    for (;;) {
      // Every cell on the path absorbs the body into its aggregate.
      const m = this.mass[slot] + 1;
      this.comX[slot] = (this.comX[slot] * this.mass[slot] + x) / m;
      this.comY[slot] = (this.comY[slot] * this.mass[slot] + y) / m;
      this.mass[slot] = m;

      if (this.body[slot] === -1 && this.child[slot * 4] === -1) {
        // Empty leaf: the body settles here.
        this.body[slot] = bodyIndex;
        return;
      }

      // Depth cap. Two bodies at exactly the same coordinates can never be
      // separated by splitting, so without this the descent would run until the
      // capacity guard fired. The body's mass is already folded into this cell's
      // aggregate, which is all the far field needs; stopping here leaves the
      // cell holding several bodies (mass > 1) and the approximation degrades
      // gracefully instead of the tree silently losing the body.
      if (depth >= MAX_DEPTH) return;

      if (this.body[slot] !== -1) {
        // Leaf holding one body: split it and push the incumbent down first.
        const incumbent = this.body[slot];
        this.body[slot] = -1;
        const base = slot * 4;
        for (let q = 0; q < 4; q++) {
          if (this.used >= this.capacity) return; // capacity bound is proven; belt and braces
          this.childBounds(slot, q, bounds);
          this.child[base + q] = this.newNode(bounds[0], bounds[1], bounds[2], bounds[3]);
        }
        const inc = nodes[incumbent];
        const incQ = this.quadrant(slot, inc.x, inc.y);
        const incChild = this.child[base + incQ];
        this.body[incChild] = incumbent;
        this.mass[incChild] = 1;
        this.comX[incChild] = inc.x;
        this.comY[incChild] = inc.y;
      }

      const q = this.quadrant(slot, x, y);
      const next = this.child[slot * 4 + q];
      if (next === -1) {
        // Leaf that was split for the incumbent but is empty for this body.
        if (this.used >= this.capacity) return;
        this.childBounds(slot, q, bounds);
        const created = this.newNode(bounds[0], bounds[1], bounds[2], bounds[3]);
        this.child[slot * 4 + q] = created;
        this.body[created] = bodyIndex;
        this.mass[created] = 1;
        this.comX[created] = x;
        this.comY[created] = y;
        return;
      }
      slot = next;
      depth++;
    }
  }

  /**
   * Adds the repulsion this tree exerts on `nodes[bodyIndex]` into its velocity.
   *
   * Three kinds of cell, and conflating them is a correctness bug rather than a
   * loss of precision:
   *
   *   - a single-body leaf (`mass === 1`, no children) is evaluated exactly, one
   *     pair at a time, and skipped when it holds the body being pushed;
   *   - an internal cell is opened when it contains the body being pushed (a
   *     body is by definition within a cell width of that cell's centre of mass,
   *     so the opening-angle test alone would let it push itself) or when it is
   *     too close to approximate;
   *   - an overflow aggregate (`mass > 1`, no children — what a depth-capped
   *     cell holding coincident bodies looks like) has no children to open into
   *     and must still be evaluated, with the pushed body's own share removed
   *     from its mass.
   *
   * The third case was a real bug: testing `body[slot] !== -1` to mean "single
   * body" made a depth-capped cell holding 242 coincident bodies look like a
   * leaf belonging to whichever body was inserted first, so that body skipped
   * the whole cell and received zero impulse while the other 241 were pushed
   * away from it. `graph-performance.test.ts` pins it.
   */
  accumulate(
    bodyIndex: number,
    nodes: LayoutBody[],
    alpha: number,
    kRepulsion: number,
    minDistance: number,
  ): void {
    const node = nodes[bodyIndex];
    const minDistanceSq = minDistance * minDistance;
    let fx = 0;
    let fy = 0;
    let sp = 0;
    this.stack[sp++] = 0;

    while (sp > 0) {
      const slot = this.stack[--sp];
      let mass = this.mass[slot];
      if (mass === 0) continue;

      const base = slot * 4;
      const hasChildren = this.child[base] !== -1;
      const isSingleBody = !hasChildren && mass === 1;

      if (isSingleBody && this.body[slot] === bodyIndex) continue;

      if (hasChildren) {
        const containsSelf =
          node.x >= this.x0[slot] &&
          node.x <= this.x1[slot] &&
          node.y >= this.y0[slot] &&
          node.y <= this.y1[slot];
        const dxc = this.comX[slot] - node.x;
        const dyc = this.comY[slot] - node.y;
        const width = this.x1[slot] - this.x0[slot];
        if (containsSelf || width * width >= THETA_SQ * (dxc * dxc + dyc * dyc)) {
          // Open the cell. Children are pushed only when they exist — a slot of
          // -1 would read mass[0] and pull the root's aggregate back in,
          // double-counting it.
          for (let q = 0; q < 4; q++) {
            const c = this.child[base + q];
            if (c !== -1 && this.mass[c] > 0) this.stack[sp++] = c;
          }
          continue;
        }
      } else if (!isSingleBody) {
        // Overflow aggregate: no children to descend into, so evaluate it and
        // subtract the pushed body's own share of the mass.
        const containsSelf =
          node.x >= this.x0[slot] &&
          node.x <= this.x1[slot] &&
          node.y >= this.y0[slot] &&
          node.y <= this.y1[slot];
        if (containsSelf) {
          mass -= 1;
          if (mass <= 0) continue;
        }
      }

      const dx = this.comX[slot] - node.x;
      const dy = this.comY[slot] - node.y;
      let distSq = dx * dx + dy * dy;

      if (distSq < 1) {
        // Coincident with an aggregate's centre of mass: deterministic nudge.
        const jitter = coincidentJitter(bodyIndex * 31 + slot);
        distSq = jitter.dx * jitter.dx + jitter.dy * jitter.dy;
        if (distSq < 1) distSq = 1;
        const dist = Math.sqrt(distSq);
        const repForce = (kRepulsion / (distSq + SOFTENING)) * alpha * mass;
        fx -= (jitter.dx / dist) * repForce;
        fy -= (jitter.dy / dist) * repForce;
        continue;
      }

      const dist = Math.sqrt(distSq);
      let repForce = (kRepulsion / (distSq + SOFTENING)) * alpha * mass;
      // Short-range separation only makes sense body-to-body; an aggregate is
      // far away by construction, so the term is skipped for it.
      if (isSingleBody && distSq < minDistanceSq) {
        repForce += (minDistance - dist) * SEPARATION_WEIGHT * alpha;
      }

      fx += (dx / dist) * repForce;
      fy += (dy / dist) * repForce;
    }

    node.vx -= fx;
    node.vy -= fy;
  }
}

/** Barnes-Hut pass: O(n log n) per iteration instead of O(n²). */
function applyBarnesHutRepulsion(
  nodes: LayoutBody[],
  alpha: number,
  kRepulsion: number,
  minDistance: number,
  tree: QuadTree,
): void {
  const n = nodes.length;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }

  // A square root cell keeps the opening-angle test meaningful in both axes.
  let size = Math.max(maxX - minX, maxY - minY);
  if (!(size > 0)) size = 1;
  const pad = size * 1e-6;
  size += pad * 2;
  tree.reset(minX - pad, minY - pad, size);

  for (let i = 0; i < n; i++) {
    tree.insert(i, nodes[i].x, nodes[i].y, nodes);
  }
  for (let i = 0; i < n; i++) {
    tree.accumulate(i, nodes, alpha, kRepulsion, minDistance);
  }
}

/**
 * Applies one iteration of pairwise repulsion to every body.
 *
 * Dispatches on size: brute force for small graphs (identical to the original),
 * Barnes-Hut above `EXACT_REPULSION_MAX_NODES`. `tree` is passed in so the
 * caller can allocate it once per layout rather than once per iteration; it may
 * be `null` on the exact path, where it is never touched.
 */
export function applyRepulsion(
  nodes: LayoutBody[],
  alpha: number,
  kRepulsion: number,
  minDistance: number,
  tree: QuadTree | null,
): void {
  const n = nodes.length;
  if (n < 2) return;
  if (n <= EXACT_REPULSION_MAX_NODES || !tree) {
    applyExactRepulsion(nodes, alpha, kRepulsion, minDistance);
    return;
  }
  applyBarnesHutRepulsion(nodes, alpha, kRepulsion, minDistance, tree);
}

/** Allocates the quadtree for a graph of `nodeCount` bodies, or null if unused. */
export function createRepulsionTree(nodeCount: number): QuadTree | null {
  if (nodeCount <= EXACT_REPULSION_MAX_NODES) return null;
  return new QuadTree(nodeCount * 4 + 8);
}

/** A viewport: the zoom level and the pan offset Cytoscape expects. */
export type FittedViewport = { zoom: number; pan: { x: number; y: number } };

/**
 * The viewport that frames `positions` inside a `width` × `height` canvas.
 *
 * This replaces `cy.fit()`, which was the single most expensive call in the
 * data-swap path — instrumented in the real app at ~1,100 nodes it cost ~620ms
 * of a ~900ms long task. The cost is `elements().boundingBox()`, which walks
 * every element and measures its rendered extent (label text included); `fit`
 * then walks it again. Since the caller has just computed the positions, the
 * node bounds are a min/max over an array instead.
 *
 * The node's own drawn extent and the label below it are covered by
 * `nodeExtent` and `padding`; those two numbers are what `fit`'s padding
 * argument was approximating anyway.
 *
 * Pure arithmetic, so the framing is unit-testable without a canvas.
 */
export function fitViewportToPositions(
  positions: Iterable<{ x: number; y: number }>,
  width: number,
  height: number,
  options: { padding?: number; nodeExtent?: number; minZoom?: number; maxZoom?: number } = {},
): FittedViewport | null {
  const { padding = 36, nodeExtent = 18, minZoom = 0.15, maxZoom = 4.5 } = options;

  if (!(width > 0) || !(height > 0)) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const p of positions) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    count++;
  }
  if (count === 0) return null;

  const boxW = Math.max(maxX - minX + nodeExtent * 2, 1);
  const boxH = Math.max(maxY - minY + nodeExtent * 2, 1);
  const usableW = Math.max(width - padding * 2, 1);
  const usableH = Math.max(height - padding * 2, 1);

  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(usableW / boxW, usableH / boxH)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    zoom,
    pan: { x: width / 2 - cx * zoom, y: height / 2 - cy * zoom },
  };
}
