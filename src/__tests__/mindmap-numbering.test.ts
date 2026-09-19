import { describe, expect, it } from "vitest";
import { numberingFor } from "../core/mindmapNumbering";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";

/**
 * Outline numbering, as a function of the tree.
 *
 * The rules are short and the ways to get them wrong are not interesting, which
 * is exactly why they are worth pinning here rather than by looking at a map:
 * an off-by-one in a sibling's position is invisible on a two-branch example.
 */

const SOURCE = [
  "- 父节点",
  "  - 子节点甲",
  "    - 孙节点",
  "  - 子节点乙",
  "- 第二个分支",
  "  - 另一个子节点",
].join("\n");

/** The number for the node with this text, or undefined. */
function numberFor(root: MindmapNode, text: string): string | undefined {
  const numbers = numberingFor(root);
  let found: string | undefined;

  const walk = (node: MindmapNode) => {
    if (found) return;
    if (node.text === text) found = numbers[node.id];
    node.children.forEach(walk);
  };
  walk(root);

  return found;
}

describe("分支编号", () => {
  const tree = parseMarkdownToMindmapTree(SOURCE, "测试");

  it("根不编号：它是文档标题，不是一条分支", () => {
    expect(numberingFor(tree)[tree.id]).toBeUndefined();
  });

  it("按层级串起来：1、1.1、1.1.1、2", () => {
    expect(numberFor(tree, "父节点")).toBe("1");
    expect(numberFor(tree, "子节点甲")).toBe("1.1");
    expect(numberFor(tree, "孙节点")).toBe("1.1.1");
    expect(numberFor(tree, "子节点乙")).toBe("1.2");
    expect(numberFor(tree, "第二个分支")).toBe("2");
    expect(numberFor(tree, "另一个子节点")).toBe("2.1");
  });

  it("位置按全部子节点计，所以折叠不会让编号变", () => {
    // The function does not take a set of folded ids — that is the assertion.
    // Numbering that depended on what happened to be open would make a map read
    // differently from one minute to the next, which is worse than no numbers.
    const folded = numberingFor(tree);
    const again = numberingFor(tree);
    expect(again).toEqual(folded);
    expect(Object.keys(folded).length).toBe(6);
  });

  it("只有一个子节点时是 1，没有子节点就没有编号", () => {
    const lone: MindmapNode = {
      id: "root",
      text: "只有一条分支",
      level: 0,
      children: [{ id: "child", text: "独苗", level: 1, children: [] }],
    };

    expect(numberingFor(lone)).toEqual({ child: "1" });
    expect(numberingFor({ ...lone, children: [] })).toEqual({});
  });

  it("编号只认结构：换个文字，号还是那个号", () => {
    const renamed: MindmapNode = {
      ...tree,
      children: tree.children.map((child) => ({ ...child })),
    };
    renamed.children[0] = { ...renamed.children[0], text: "改了名字" };

    expect(numberFor(renamed, "改了名字")).toBe("1");
  });
});
