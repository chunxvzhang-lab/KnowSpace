import type { RenderedBlock } from "../core/types";

/*
 * Reader block virtualization - the pure half (phase 2, wave 2-2).
 *
 * The 100k-character acceptance says the article may not hold 6,842 DOM
 * nodes: at most a window around the viewport, plus a handful of
 * source-line *anchors* (one every K blocks) and two residual spacers,
 * sized from a content-addressed height table so the scroll geometry
 * still matches the whole document. The pieces that need a DOM (the
 * reconcile, the scroll listener, the jump/ensure contract) live in
 * `src/components/reader/ReaderVirtualDom.ts`; this module is everything
 * that can be computed from numbers alone and unit-tested without one.
 *
 * Three properties the rest of the wave is built on, each pinned by
 * reader-virtual.test.ts:
 *
 *  1. Geometry by *advance*, not offsetHeight. A materialized block's
 *     stored height is the distance from its top to the next block's top
 *     (`rect(next).top - rect(this).top`), which folds the collapsed
 *     inter-block margins in exactly once. `offsetHeight + margins` would
 *     double-count where siblings collapse and leave a phantom gap per
 *     boundary. The LAST materialized block in a run has no following
 *     sibling to diff against, so it falls back to offsetHeight plus its
 *     own bottom margin - a constant ~one-margin error at the window
 *     edges that self-corrects when that edge later materializes.
 *  2. The mapping never goes catastrophic. Spacers and anchors carry
 *     `data-source-line` (see buildSurfacePlan), so useSyncScroll's
 *     keyframe query keeps working with only a fraction of the blocks
 *     materialized: between anchors the mapping is piecewise-linear,
 *     accurate to within K blocks' heights - the accuracy/memory dial K
 *     buys (R7 red line: scroll-sync/search-jump/restore stay accurate
 *     at block-boundary granularity).
 *  3. A keystroke costs one block. Heights are content-addressed by
 *     blockKey (source range + FNV of the sanitized html), so an
 *     unchanged block keeps its measured height across the re-render
 *     that replaces its neighbour, and a window whose [start,end) and
 *     segment identities are unchanged performs zero DOM work.
 */

/* ── Tuning constants ─────────────────────────────────────────────────── */

/**
 * Short-document floor. Below this many top-level blocks the anchor/spacer
 * machinery is pure overhead: the document renders today's full path,
 * byte-for-byte unchanged. 300 is set so the K=40 tiling only engages where
 * it pays off (the 100k perf corpus is 2,282 blocks); the overwhelming
 * majority of notes are far below it.
 */
export const VIRTUAL_MIN_BLOCKS = 300;

/**
 * Anchor stride: one anchor div every K materialized-absent blocks. K is the
 * accuracy/memory dial - fewer anchors (larger K) is less DOM and a coarser
 * [data-source-line] mapping. Chosen at 64: at the 100k corpus's 3.0 elements
 * per block, K=40 (57 anchors) plus the window overshot the <200 node budget,
 * while K=64 (36 anchors) leaves room for the window under the hard cap - the
 * mapping stays accurate to within 64 blocks' heights, anchored on
 * [data-source-line] so it degrades gracefully between anchors, never
 * catastrophically (R7).
 */
export const ANCHOR_STRIDE_K = 64;

/**
 * Viewports of buffer materialized above and below the visible window. 1.0
 * (not the design's 1.5) because the block cap below binds on the harness
 * viewport anyway, and a leaner buffer means less DOM churn per window move
 * during the split-mode scroll (2-2's new risk surface).
 */
export const BUFFER_VIEWPORTS = 1.0;

/** Height assumed before anything has been measured, in px. */
export const DEFAULT_BLOCK_HEIGHT = 48;

/** How many recent measured advances feed the median estimate. */
const MEASURED_SAMPLE_WINDOW = 50;

/** A rendered segment's height is rewritten only when it drifts by more. */
export const HEIGHT_UPDATE_EPSILON_PX = 4;

/**
 * Hard backstop on materialized block count - this is what GUARANTEES the
 * <200 DOM-node budget (R7 red line), not the viewport buffer: the cap times
 * the corpus's average elements-per-block plus the anchor count stays under
 * 200 even if the reader is on a huge monitor or every block were a one-line
 * paragraph. Sized from the corpus arithmetic 3*W + blocks/K + 2 < 200 with
 * headroom. The buffer can't fill past it; when it binds, the window is kept
 * centered on the viewport (computeWindow).
 */
export const MAX_MATERIALIZED_BLOCKS = 48;

/* ── Block identity ───────────────────────────────────────────────────── */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(value: string): number {
  let hash = FNV_OFFSET >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Identity of one block: where it came from plus what it now contains.
 * Content-addressed, so an unchanged block survives a re-render under the
 * same key - the sanitize cache (services/markdownBlocks) and the height
 * table both key off this. (Moved here from ReaderPane so the virtualizer
 * and the reconcile speak the same identity; one source of truth.)
 */
export function blockKeyOf(block: RenderedBlock): string {
  return `${block.sourceStart}-${block.sourceEnd}:${fnv1a(block.html).toString(36)}`;
}

/* ── Height table (content-addressed, per theme+scale) ────────────────── */

/**
 * Module-level because heights are a property of the *content* (plus the
 * two metrics that change it), not of a mounted component: re-opening a
 * document, or remounting the pane, must not re-measure a document the
 * reader already scrolled through. Keyed by theme + fontScale + blockKey.
 */
const measuredHeights = new Map<string, number>();
const recentMeasurements: number[] = [];
let medianDirty = true;
let medianCache = DEFAULT_BLOCK_HEIGHT;

/** The metric context heights are a function of. */
export type HeightContext = { theme: string; fontScale: number };

export function heightContextKey(context: HeightContext, blockKey: string): string {
  return `${context.theme}|${context.fontScale}|${blockKey}`;
}

/** True once anything has been measured - estimates are then the median. */
export function hasMeasuredHeights(): boolean {
  return recentMeasurements.length > 0;
}

function recomputeMedian(): void {
  if (recentMeasurements.length === 0) {
    medianCache = DEFAULT_BLOCK_HEIGHT;
    medianDirty = false;
    return;
  }
  const sorted = [...recentMeasurements].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  medianCache = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  medianDirty = false;
}

/**
 * The estimate for a block never measured in this context: the running
 * median of the last 50 measured advances (robust to code fences and
 * images, unlike a mean), or the floor until anything is measured.
 */
export function estimatedHeight(): number {
  if (medianDirty) recomputeMedian();
  return medianCache;
}

export function getMeasuredHeight(key: string): number | undefined {
  return measuredHeights.get(key);
}

/**
 * Record one measured advance. Heights at or below zero are rejected:
 * layout-free engines (jsdom) report 0, and a 0 into the table would
 * collapse the geometry to nothing. Recording feeds the median sample.
 */
export function setMeasuredHeight(key: string, height: number): boolean {
  if (!(height > 0)) return false;
  const rounded = Math.round(height);
  const previous = measuredHeights.get(key);
  if (previous === rounded) return false;
  measuredHeights.set(key, rounded);
  recentMeasurements.push(rounded);
  if (recentMeasurements.length > MEASURED_SAMPLE_WINDOW) recentMeasurements.shift();
  medianDirty = true;
  return true;
}

/** Test seam: clear the module-level tables. Not used by the app path. */
export function __resetHeightTables(): void {
  measuredHeights.clear();
  recentMeasurements.length = 0;
  medianDirty = true;
}

/**
 * Resolve one block's advance from its identity alone: measured for this
 * context, else the estimate. Takes precomputed keys because deriving them
 * is the expensive half (FNV over the block's whole html) - the controller
 * already keys every block once per content change and must not rehash the
 * entire document on every measurement-correction pass (the 2-4 profile:
 * 165ms of re-hashing 2,282 blocks per scroll burst).
 */
export function resolveHeightsFromKeys(keys: readonly string[], context: HeightContext): number[] {
  const fallback = estimatedHeight();
  const heights = new Array<number>(keys.length);
  for (let i = 0; i < keys.length; i += 1) {
    const hit = measuredHeights.get(heightContextKey(context, keys[i]));
    heights[i] = hit ?? fallback;
  }
  return heights;
}

/** Resolve one block's advance: measured for this context, else estimate. */
export function resolveHeights(blocks: readonly RenderedBlock[], context: HeightContext): number[] {
  return resolveHeightsFromKeys(blocks.map(blockKeyOf), context);
}

/* ── Cumulative geometry ──────────────────────────────────────────────── */

/** Prefix sums: `cumulative[i]` = px top of block i; length n+1. */
export function buildCumulative(heights: readonly number[]): number[] {
  const cumulative = new Array<number>(heights.length + 1);
  cumulative[0] = 0;
  for (let i = 0; i < heights.length; i += 1) {
    cumulative[i + 1] = cumulative[i] + heights[i];
  }
  return cumulative;
}

/** Largest index `i` with `cumulative[i] <= y` (cumulative is non-decreasing). */
export function blockIndexAtY(cumulative: readonly number[], y: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (cumulative[mid] <= y) low = mid;
    else high = mid - 1;
  }
  return low;
}

/* ── Window computation ───────────────────────────────────────────────── */

export type VirtualWindow = {
  /** First materialized block index. */
  start: number;
  /** One past the last materialized block index. */
  end: number;
};

export type WindowInput = {
  scrollTop: number;
  /** The scroller's viewport height in px. */
  viewport: number;
  /** Px top of the article's content (block 0) inside the scroller. */
  contentTop: number;
  count: number;
};

/**
 * The materialized slice for a scroll position: what the viewport shows,
 * plus BUFFER_VIEWPORTS above and below, clamped by MAX_MATERIALIZED_BLOCKS.
 *
 * Purely positional: two calls with the same input and the same table
 * return the same window - which is what lets the DOM layer skip all work
 * when the window has not moved.
 */
export function computeWindow(cumulative: readonly number[], input: WindowInput): VirtualWindow {
  const count = input.count;
  if (count <= 0) return { start: 0, end: 0 };
  const buffer = Math.max(0, input.viewport) * BUFFER_VIEWPORTS;
  const top = Math.max(0, input.scrollTop - input.contentTop - buffer);
  const bottom = top + Math.max(0, input.viewport) + buffer * 2;
  // Block i spans [cum[i], cum[i+1]); include it when that range intersects
  // [top, bottom). The first is the block whose own top is the last one at or
  // above `top` (its range reaches into it); the same holds at the bottom.
  const start = Math.min(count - 1, blockIndexAtY(cumulative, top));
  const end = Math.min(count, blockIndexAtY(cumulative, bottom) + 1);
  const window: VirtualWindow = { start, end: Math.max(start + 1, end) };
  if (window.end - window.start > MAX_MATERIALIZED_BLOCKS) {
    // Center the cap on the viewport's own slice so a capped window still
    // contains what is on screen: find the viewport-first block, then take
    // 1/4 of the cap above it.
    const visible = blockIndexAtY(cumulative, Math.max(0, input.scrollTop - input.contentTop));
    const above = Math.floor(MAX_MATERIALIZED_BLOCKS / 4);
    const cappedStart = Math.max(
      0,
      Math.min(visible, window.end - MAX_MATERIALIZED_BLOCKS + above),
    );
    return { start: cappedStart, end: Math.min(count, cappedStart + MAX_MATERIALIZED_BLOCKS) };
  }
  return window;
}

/* ── Surface plan ─────────────────────────────────────────────────────── */

/**
 * One non-materialized region of the document, as the DOM layer must render
 * it. `sourceLine` goes on the node as `data-source-line` (the keyframe
 * mapping), `height` as its inline px height, `from`/`to` as the block
 * range it stands for (the identity half of the reconcile key).
 */
export type VirtualSegment = {
  kind: "anchor" | "spacer-top" | "spacer-bottom";
  /** Stable reconcile identity: grid run start (anchors), else the region edge. */
  slot: string;
  from: number;
  to: number;
  /** 1-based source line the segment begins at; -1 when unannotated. */
  sourceLine: number;
  height: number;
};

export type VirtualSurface = {
  window: VirtualWindow;
  /** Segments before the window (document order), then the window, then after. */
  segments: VirtualSegment[];
};

/**
 * The document as DOM: [above anchors][top residual spacer][window][bottom
 * residual spacer][below anchors].
 *
 * Anchors sit on the *global* K grid - a segment starting at block `g`
 * exists for every multiple of K outside the window - so sliding the window
 * one block changes at most two segments' sizes, never the identity of a
 * segment that stayed outside it. The two spacers carry the partial grid
 * runs the window edge cuts through; when the edge sits exactly on a grid
 * boundary the spacer is zero-height and omitted.
 *
 * `sourceLineAt` maps block index -> 1-based source line (-1 for blocks the
 * renderer could not annotate; such a segment simply carries no
 * data-source-line and the mapping interpolates across it).
 */
export function buildSurfacePlan(
  cumulative: readonly number[],
  sourceLineAt: (index: number) => number,
  window: VirtualWindow,
  stride: number = ANCHOR_STRIDE_K,
): VirtualSurface {
  const count = cumulative.length - 1;
  const segments: VirtualSegment[] = [];
  const push = (kind: VirtualSegment["kind"], from: number, to: number, slot: string): void => {
    if (to <= from) return;
    segments.push({
      kind,
      from,
      to,
      slot,
      sourceLine: sourceLineAt(from),
      height: cumulative[to] - cumulative[from],
    });
  };

  // Above the window: full grid runs [0, edge) as anchors, then the window
  // edge's partial run as the top spacer.
  const edge = Math.floor(window.start / stride) * stride;
  for (let g = 0; g + stride <= edge; g += stride) {
    push("anchor", g, g + stride, `a${g}`);
  }
  push("spacer-top", edge, window.start, "st");

  // Window blocks are materialized between the segment halves.

  // Below the window: the edge run's remainder as the bottom spacer, then
  // full grid runs through the end of the document (the last clamped).
  const firstGridRun = Math.min(count, Math.ceil(window.end / stride) * stride);
  push("spacer-bottom", window.end, firstGridRun, "sb");
  for (let g = firstGridRun; g < count; g += stride) {
    push("anchor", g, Math.min(g + stride, count), `a${g}`);
  }

  return { window, segments };
}

/* ── Source-line lookup ───────────────────────────────────────────────── */

/**
 * The block covering a 1-based source line, or the block whose start is
 * nearest before it. Blocks are document-ordered; unannotated blocks
 * (sourceStart <= 0) inherit the previous annotation for ordering purposes.
 * Linear fallback kept simple: binary search on the effective starts.
 */
export function findBlockForSourceLine(
  blocks: readonly RenderedBlock[],
  sourceLine: number,
): number {
  const effective = new Array<number>(blocks.length);
  let last = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const start = blocks[i].sourceStart;
    if (start > 0) last = start;
    effective[i] = last;
  }
  let low = 0;
  let high = blocks.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (effective[mid] <= sourceLine) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** Px top of a block inside the article's content, from the cumulative table. */
export function scrollTopForBlock(
  cumulative: readonly number[],
  contentTop: number,
  blockIndex: number,
  viewport: number,
  align: "start" | "center",
): number {
  const top = contentTop + cumulative[blockIndex];
  if (align === "center") {
    const height = cumulative[blockIndex + 1] - cumulative[blockIndex];
    return Math.max(0, top - (viewport - height) / 2);
  }
  return Math.max(0, top - 32);
}
