/**
 * The pure half of reader virtualization (wave 2-2): window computation over
 * a synthetic block table, the surface plan's anchor/spacer tiling, and the
 * content-addressed height table. No DOM here — these are the numbers the
 * DOM layer spends its budget against.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { RenderedBlock } from "../core/types";
import {
  ANCHOR_STRIDE_K,
  buildCumulative,
  buildSurfacePlan,
  blockIndexAtY,
  blockKeyOf,
  computeWindow,
  estimatedHeight,
  findBlockForSourceLine,
  heightContextKey,
  HEIGHT_UPDATE_EPSILON_PX,
  MAX_MATERIALIZED_BLOCKS,
  resolveHeights,
  scrollTopForBlock,
  setMeasuredHeight,
  VIRTUAL_MIN_BLOCKS,
  __resetHeightTables,
  type HeightContext,
} from "../services/readerVirtual";

function makeBlocks(count: number, per = 1): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  for (let i = 0; i < count; i += 1) {
    blocks.push({
      html: `<p>b${i}</p>`,
      sourceStart: i * per + 1,
      sourceEnd: i * per + 1,
    });
  }
  return blocks;
}

describe("readerVirtual — window computation", () => {
  // 10k blocks, each 40px tall -> doc is 400k px.
  const heights = new Array<number>(10_000).fill(40);
  const cum = buildCumulative(heights);

  it("windows the blocks around a scroll position, bounded by the cap", () => {
    const w = computeWindow(cum, {
      scrollTop: 10_000,
      viewport: 800,
      contentTop: 0,
      count: 10_000,
    });
    expect(w.end).toBeGreaterThan(w.start);
    expect(w.end - w.start).toBeLessThanOrEqual(MAX_MATERIALIZED_BLOCKS);
    // Block at scrollTop=10_000 (40px each) is index 250 — it must be inside.
    expect(w.start).toBeLessThanOrEqual(250);
    expect(w.end).toBeGreaterThan(250);
  });

  it("keeps the window at the document start when scrollTop is 0", () => {
    const w = computeWindow(cum, { scrollTop: 0, viewport: 800, contentTop: 0, count: 10_000 });
    expect(w.start).toBe(0);
  });

  it("keeps the window at the document end when scrolled to the bottom", () => {
    const max = cum[cum.length - 1]; // 400000
    const w = computeWindow(cum, {
      scrollTop: max - 800,
      viewport: 800,
      contentTop: 0,
      count: 10_000,
    });
    expect(w.end).toBe(10_000);
  });

  it("honors the materialized-block cap even for a giant viewport", () => {
    // A 100k-px viewport would ask for every block; the cap holds the line.
    const w = computeWindow(cum, {
      scrollTop: 200_000,
      viewport: 100_000,
      contentTop: 0,
      count: 10_000,
    });
    expect(w.end - w.start).toBe(MAX_MATERIALIZED_BLOCKS);
  });

  it("is purely positional — same input, same window (the zero-work hot path)", () => {
    const a = computeWindow(cum, { scrollTop: 5_000, viewport: 800, contentTop: 0, count: 10_000 });
    const b = computeWindow(cum, { scrollTop: 5_000, viewport: 800, contentTop: 0, count: 10_000 });
    expect(a).toEqual(b);
  });

  it("blockIndexAtY finds the block whose range contains a y", () => {
    expect(blockIndexAtY(cum, 0)).toBe(0);
    expect(blockIndexAtY(cum, 39)).toBe(0);
    expect(blockIndexAtY(cum, 40)).toBe(1);
    expect(blockIndexAtY(cum, 10_000)).toBe(250);
  });
});

describe("readerVirtual — surface plan (anchors + spacers)", () => {
  const heights = new Array<number>(2_282).fill(40);
  const cum = buildCumulative(heights);
  const sourceLineAt = (i: number) => i + 1;

  function totalSegmentHeight(
    plan: ReturnType<typeof buildSurfacePlan>,
    window: { start: number; end: number },
  ) {
    let sum = 0;
    for (const s of plan.segments) sum += s.height;
    return sum + (cum[window.end] - cum[window.start]);
  }

  it("tiles the whole document: segment heights + window = full doc height", () => {
    const window = { start: 500, end: 530 };
    const plan = buildSurfacePlan(cum, sourceLineAt, window);
    expect(totalSegmentHeight(plan, window)).toBeCloseTo(cum[cum.length - 1], 6);
  });

  it("emits an anchor every K blocks outside the window and none inside it", () => {
    const window = { start: 800, end: 810 };
    const plan = buildSurfacePlan(cum, sourceLineAt, window, ANCHOR_STRIDE_K);
    const anchors = plan.segments.filter((s) => s.kind === "anchor");
    // Anchor grid starts are multiples of K and none overlaps the window.
    for (const a of anchors) {
      expect(a.from % ANCHOR_STRIDE_K).toBe(0);
      const insideWindow = a.from < window.end && a.to > window.start;
      expect(insideWindow).toBe(false);
    }
    // Total anchors are ~ doc/K (not doc/1), proving K is the anchor dial.
    expect(anchors.length).toBeLessThanOrEqual(Math.ceil(2282 / ANCHOR_STRIDE_K) + 1);
  });

  it("raises anchors at their first block's source line, monotonic down the document", () => {
    const window = { start: 200, end: 210 };
    const plan = buildSurfacePlan(cum, sourceLineAt, window, 64);
    const lines = plan.segments.map((s) => s.sourceLine);
    for (let i = 1; i < lines.length; i += 1) expect(lines[i]).toBeGreaterThan(lines[i - 1]);
  });

  it("adds a leading spacer for the window edge's partial run, and drops it on a grid boundary", () => {
    // start not on a 64 boundary -> a top spacer covers [floor, start).
    const edge = buildSurfacePlan(cum, sourceLineAt, { start: 70, end: 80 }, 64);
    expect(edge.segments.some((s) => s.kind === "spacer-top")).toBe(true);
    // start exactly on the boundary -> no top spacer.
    const clean = buildSurfacePlan(cum, sourceLineAt, { start: 64, end: 80 }, 64);
    expect(clean.segments.some((s) => s.kind === "spacer-top")).toBe(false);
  });

  it("segment identities are grid-slot keys independent of the window (stable across scrolls)", () => {
    const a = buildSurfacePlan(cum, sourceLineAt, { start: 100, end: 110 }, 64);
    const b = buildSurfacePlan(cum, sourceLineAt, { start: 128, end: 138 }, 64);
    const slotA = new Set(a.segments.map((s) => s.slot));
    // A grid anchor outside BOTH windows keeps its identity.
    expect(slotA.has("a0")).toBe(true);
    expect(b.segments.map((s) => s.slot)).toContain("a0");
  });
});

describe("readerVirtual — heights table (content-addressed, per context)", () => {
  const ctx: HeightContext = { theme: "dark", fontScale: 1 };
  const other: HeightContext = { theme: "light", fontScale: 1 };
  const scaled: HeightContext = { theme: "dark", fontScale: 1.3 };

  beforeEach(() => {
    __resetHeightTables();
  });

  it("keys a height by content (blockKey) + theme + fontScale", () => {
    // Measure four distinct blocks so the median estimate (70) is clearly
    // different from the 120 recorded for `block` under `ctx`.
    const base = makeBlocks(4);
    [40, 60, 80, 120].forEach((h, i) => {
      setMeasuredHeight(heightContextKey(ctx, blockKeyOf(base[i])), h);
    });
    const block = base[3]; // the one measured at 120
    const blocks = [block];
    expect(resolveHeights(blocks, ctx)[0]).toBe(120);
    // Another context has never measured this block's key -> it falls back to
    // the (context-independent) median estimate, NOT this block's 120.
    expect(resolveHeights(blocks, other)[0]).toBe(70);
    expect(resolveHeights(blocks, scaled)[0]).toBe(70);
  });

  it("is content-addressed: changed html is a new identity", () => {
    const a: RenderedBlock = { html: "<p>same</p>", sourceStart: 1, sourceEnd: 1 };
    const b: RenderedBlock = { html: "<p>edited</p>", sourceStart: 1, sourceEnd: 1 };
    expect(blockKeyOf(a)).not.toBe(blockKeyOf(b));
    // Same content is the same key even across documents.
    expect(blockKeyOf(a)).toBe(blockKeyOf({ ...a }));
  });

  it("falls back to the default estimate until anything is measured, then to the median", () => {
    expect(estimatedHeight()).toBe(48);
    // Push 4 measurements: 20, 30, 40, 100 -> median (30 + 40)/2 = 35
    const blocks: RenderedBlock[] = [];
    for (let i = 0; i < 4; i += 1) {
      const b = makeBlocks(4)[i];
      blocks.push(b);
      setMeasuredHeight(heightContextKey(ctx, blockKeyOf(b)), [20, 30, 40, 100][i]);
    }
    expect(estimatedHeight()).toBe(35);
    // A never-measured block in a fresh context resolves to that median.
    const fresh = makeBlocks(1)[0];
    expect(resolveHeights([fresh], other)[0]).toBe(35);
  });

  it("ignores non-positive measurements (a layout-free engine reports 0)", () => {
    const block = makeBlocks(1)[0];
    expect(setMeasuredHeight(heightContextKey(ctx, blockKeyOf(block)), 0)).toBe(false);
    expect(setMeasuredHeight(heightContextKey(ctx, blockKeyOf(block)), -5)).toBe(false);
  });

  it("re-setting the same rounded height is a no-op (no measure churn)", () => {
    const block = makeBlocks(1)[0];
    const addr = heightContextKey(ctx, blockKeyOf(block));
    expect(setMeasuredHeight(addr, 60)).toBe(true);
    expect(setMeasuredHeight(addr, 60)).toBe(false);
  });

  it("findBlockForSourceLine maps a line to the block covering it", () => {
    const blocks = makeBlocks(100, 3); // block i covers line i*3+1
    expect(findBlockForSourceLine(blocks, 1)).toBe(0);
    expect(findBlockForSourceLine(blocks, 31)).toBe(10);
    // A line in the middle of a gap resolves to the nearest block before it.
    expect(findBlockForSourceLine(blocks, 30)).toBe(9);
  });

  it("scrollTopForBlock aligns a block's top (with offset) or center, never negative", () => {
    const cum = buildCumulative(new Array<number>(10).fill(40));
    expect(scrollTopForBlock(cum, 0, 5, 200, "start")).toBe(5 * 40 - 32);
    // center of a 40px block in a 200px viewport: 200 - (200 - 40)/2 = 120.
    expect(scrollTopForBlock(cum, 0, 5, 200, "center")).toBeCloseTo(120, 6);
    // Offsets near the top clamp to 0 rather than a negative scroll.
    expect(scrollTopForBlock(cum, 0, 0, 800, "center")).toBe(0);
  });

  it("the short-document floor is a real, low threshold (300)", () => {
    expect(VIRTUAL_MIN_BLOCKS).toBe(300);
    expect(HEIGHT_UPDATE_EPSILON_PX).toBeGreaterThan(0);
  });
});
