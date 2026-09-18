import { describe, it, expect, vi, afterEach } from "vitest";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { MINDMAP_LAYOUT_LIST, layoutMindmap } from "../services/mindmapLayout";

/**
 * What a large map costs to lay out.
 *
 * The plan's risk table has one line that was never checked: "大图（>500 节点）
 * 需实测". This is that measurement.
 *
 * **The assertion is a count, not a time.** A wall-clock bound was tried first
 * and it did not survive its own suite: the deep chain takes 771ms on its own and
 * 6599ms when all sixty-two files run in parallel, so the bound was measuring how
 * busy the machine was. How many times a node is measured is the same number
 * whatever else is running, and it is what the cost actually consists of.
 *
 * The timings are still printed. They are the interesting half of the answer —
 * a deep chain is the worst case and it is worth knowing it is 80ms rather than
 * 8 seconds — but they are information rather than an assertion.
 */

const counters = vi.hoisted(() => ({ dimensions: 0 }));

vi.mock("../services/mindmapService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/mindmapService")>();
  return {
    ...actual,
    calculateNodeDimensions: ((node: Parameters<typeof actual.calculateNodeDimensions>[0]) => {
      counters.dimensions += 1;
      return actual.calculateNodeDimensions(node);
    }) as typeof actual.calculateNodeDimensions,
  };
});

/** 40 first-level branches of 20 children each: 841 nodes, and three levels deep. */
function largeSource(): string {
  const lines: string[] = [];
  for (let branch = 1; branch <= 40; branch += 1) {
    lines.push(`- 分支 ${branch} 是一个较长的主题名称`);
    for (let child = 1; child <= 20; child += 1) {
      lines.push(`  - 子主题 ${branch}-${child} 也带一些文字`);
    }
  }
  return lines.join("\n");
}

/** One chain 600 levels deep: 600 list items plus the root. */
function deepSource(): string {
  const lines: string[] = [];
  for (let depth = 1; depth <= 600; depth += 1) {
    lines.push(`${"  ".repeat(depth - 1)}- 第 ${depth} 层主题`);
  }
  return lines.join("\n");
}

const NODE_COUNT = 40 * 20 + 40 + 1;
const DEEP_NODE_COUNT = 601;
/**
 * Measuring a node is not free — it wraps its text — so the count is what to
 * watch.
 *
 * The five layouts measure a 841-node, three-level map between 3.9 and 6.9 times
 * per node (radial 841 calls, timeline 3281, vertical 4121, logic 4962,
 * bidirectional 5762). Ten is the ceiling here: it leaves room for a layout that
 * measures a node again while placing it, and a change that walks the whole tree
 * per node — which is what the deep chain does — would be forty times over.
 */
const WIDE_BUDGET = NODE_COUNT * 10;

describe("大图布局的性能", () => {
  afterEach(() => {
    counters.dimensions = 0;
  });

  it(`${NODE_COUNT} 个节点的宽而浅的图：每个节点的度量次数保持常数`, () => {
    const tree = parseMarkdownToMindmapTree(largeSource(), "压测");
    const collapsed = new Set<string>();

    const measured: string[] = [];
    for (const option of MINDMAP_LAYOUT_LIST) {
      layoutMindmap(tree, collapsed, option.id);

      counters.dimensions = 0;
      const started = Date.now();
      const layout = layoutMindmap(tree, collapsed, option.id);
      const elapsed = Date.now() - started;
      const calls = counters.dimensions;
      measured.push(`${option.id}: ${elapsed}ms / ${calls} 次度量`);

      expect(layout.nodes.length, `${option.id} 少排了节点`).toBe(NODE_COUNT);
      expect(calls, `${option.id} 的度量次数不再是每个节点常数次`).toBeLessThan(WIDE_BUDGET);
    }

    console.log(`[宽 841 节点 / 3 层] ${measured.join("  |  ")}`);
  });

  it(`${DEEP_NODE_COUNT} 个节点的深链：正确排完，并记录代价`, () => {
    // The worst case for the measure pass, and the reason this is measured
    // rather than assumed: every layout asks "how tall is this subtree" and gets
    // the answer by walking it, so a chain of depth d costs d squared visits. A
    // wide tree hides that completely; a chain does not.
    //
    // Nothing is asserted about the count here. It is quadratic by construction,
    // and a threshold on it would be a number nobody could justify — the point
    // is that the two rows differ by three orders of magnitude, which is what
    // makes the wide case the one that matters.
    const tree = parseMarkdownToMindmapTree(deepSource(), "压测");
    const collapsed = new Set<string>();

    const measured: string[] = [];
    for (const option of MINDMAP_LAYOUT_LIST) {
      layoutMindmap(tree, collapsed, option.id);

      counters.dimensions = 0;
      const started = Date.now();
      const layout = layoutMindmap(tree, collapsed, option.id);
      const elapsed = Date.now() - started;
      measured.push(`${option.id}: ${elapsed}ms / ${counters.dimensions} 次度量`);

      expect(layout.nodes.length, `${option.id} 少排了节点`).toBe(DEEP_NODE_COUNT);
    }

    console.log(`[深 601 节点 / 600 层] ${measured.join("  |  ")}`);
    // The default five-second timeout assumes a test that is not deliberately
    // heavy. This one lays out a six-hundred-level chain five times: 1.9s on its
    // own, and 7.9s when the whole suite is competing for the machine, which is
    // how it first failed. The room is for the queue, not for the work.
  }, 30_000);
});
