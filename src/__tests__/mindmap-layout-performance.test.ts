import { describe, it, expect } from "vitest";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { MINDMAP_LAYOUT_LIST, layoutMindmap } from "../services/mindmapLayout";

/**
 * What a large map costs to lay out.
 *
 * The plan's risk table has one line that was never checked: "大图（>500 节点）
 * 需实测". This is that measurement.
 *
 * The bound below is deliberately loose. It is not a performance target; it is
 * here so that a change that turns the layouts from something to be measured
 * into something quadratic — which is easy to do by accident, since every layout
 * walks the tree more than once — fails loudly instead of being discovered by a
 * reader with a big document.
 *
 * The measured numbers are printed, so the next session compares against fact
 * rather than against this comment.
 */

/** 40 first-level branches of 20 children each: 840 nodes, and three levels deep. */
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
const BUDGET_MS = 2000;
/**
 * A chain is the worst case, not a target: 600 levels is far deeper than any
 * document, so a generous bound is the honest one here. What it catches is the
 * shape of the cost changing, not a slow machine.
 */
const DEEP_BUDGET_MS = 4000;

describe("大图布局的性能", () => {
  it(`${NODE_COUNT} 个节点的宽而浅的图在预算内排完五种布局`, () => {
    const tree = parseMarkdownToMindmapTree(largeSource(), "压测");
    const collapsed = new Set<string>();

    const measured: string[] = [];
    for (const option of MINDMAP_LAYOUT_LIST) {
      // One warm-up run, so the first layout does not pay for everything JIT.
      layoutMindmap(tree, collapsed, option.id);

      const started = Date.now();
      const layout = layoutMindmap(tree, collapsed, option.id);
      const elapsed = Date.now() - started;
      measured.push(`${option.id}: ${elapsed}ms`);

      expect(layout.nodes.length, `${option.id} 少排了节点`).toBe(NODE_COUNT);
      expect(elapsed, `${option.id} 超出预算`).toBeLessThan(BUDGET_MS);
    }

    console.log(`[宽 841 节点 / 3 层] ${measured.join("  |  ")}`);
  });

  it(`${DEEP_NODE_COUNT} 个节点的深链也在预算内`, () => {
    // The worst case for the measure pass, and the reason this is measured
    // rather than assumed: every layout asks "how tall is this subtree" and gets
    // the answer by walking it, so a chain of depth d costs d squared visits.
    // A wide tree hides that completely; a chain does not.
    const tree = parseMarkdownToMindmapTree(deepSource(), "压测");
    const collapsed = new Set<string>();

    const measured: string[] = [];
    for (const option of MINDMAP_LAYOUT_LIST) {
      layoutMindmap(tree, collapsed, option.id);

      const started = Date.now();
      const layout = layoutMindmap(tree, collapsed, option.id);
      const elapsed = Date.now() - started;
      measured.push(`${option.id}: ${elapsed}ms`);

      expect(layout.nodes.length, `${option.id} 少排了节点`).toBe(DEEP_NODE_COUNT);
      expect(elapsed, `${option.id} 超出深链预算`).toBeLessThan(DEEP_BUDGET_MS);
    }

    console.log(`[深 601 节点 / 600 层] ${measured.join("  |  ")}`);
  });
});
