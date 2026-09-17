import { describe, expect, it } from "vitest";
import type { MindmapNode } from "../core/types";
import {
  reparentNode,
  planDrop,
  moveWithinSiblings,
  copySubtree,
  pasteSubtree,
  searchMindmapNodes,
} from "../services/mindmapService";

describe("mindmap reparenting and search algorithms", () => {
  const sampleTree: MindmapNode = {
    id: "root-node",
    text: "中心主题",
    level: 0,
    children: [
      {
        id: "node-a",
        text: "分支A",
        level: 1,
        children: [
          { id: "node-a1", text: "要点A1", level: 2, children: [] },
          { id: "node-a2", text: "要点A2", level: 2, children: [] },
        ],
      },
      {
        id: "node-b",
        text: "分支B",
        level: 1,
        children: [{ id: "node-b1", text: "要点B1", level: 2, children: [] }],
      },
    ],
  };

  it("moves a node to become a child of another branch", () => {
    // Move node-a1 under node-b
    const updated = reparentNode(sampleTree, "node-a1", "node-b");

    const branchA = updated.children.find((c) => c.id === "node-a")!;
    const branchB = updated.children.find((c) => c.id === "node-b")!;

    // branchA should now only have node-a2
    expect(branchA.children.map((c) => c.id)).toEqual(["node-a2"]);

    // branchB should now have node-b1 and node-a1
    expect(branchB.children.map((c) => c.id)).toEqual(["node-b1", "node-a1"]);

    // node-a1 level should be updated to 2
    const movedA1 = branchB.children.find((c) => c.id === "node-a1")!;
    expect(movedA1.level).toBe(2);
  });

  it("prevents circular reparenting (moving a node into its own descendant)", () => {
    // Attempting to move node-a under node-a1 should be blocked
    const updated = reparentNode(sampleTree, "node-a", "node-a1");
    // Tree remains unchanged
    expect(updated).toEqual(sampleTree);
  });

  it("prevents moving the root node", () => {
    const updated = reparentNode(sampleTree, "root-node", "node-a");
    expect(updated).toEqual(sampleTree);
  });

  it("prevents moving a node to itself", () => {
    const updated = reparentNode(sampleTree, "node-a", "node-a");
    expect(updated).toEqual(sampleTree);
  });

  it("searches and finds matching nodes in the tree", () => {
    const resA = searchMindmapNodes(sampleTree, "A");
    expect(resA).toContain("node-a");
    expect(resA).toContain("node-a1");
    expect(resA).toContain("node-a2");
    expect(resA).not.toContain("node-b");

    const resB1 = searchMindmapNodes(sampleTree, "要点B1");
    expect(resB1).toEqual(["node-b1"]);

    const resEmpty = searchMindmapNodes(sampleTree, "不存在的关键词");
    expect(resEmpty).toEqual([]);
  });

  describe("planDrop", () => {
    // node-a holds [node-a1, node-a2]; node-b holds [node-b1].
    it("appends as a child when the drop is on the middle of a node", () => {
      expect(planDrop(sampleTree, "node-a1", "node-b", "child")).toEqual({
        parentId: "node-b",
        index: 1,
      });
    });

    it("inserts at the target's own position when dropping before it", () => {
      expect(planDrop(sampleTree, "node-b", "node-a1", "before")).toEqual({
        parentId: "node-a",
        index: 0,
      });
    });

    it("inserts just after the target when dropping after it", () => {
      expect(planDrop(sampleTree, "node-b", "node-a1", "after")).toEqual({
        parentId: "node-a",
        index: 1,
      });
    });

    it("corrects the index when the node moves down within its own parent", () => {
      // node-a1 sits at index 0 and is dropped after node-a2 at index 1. The
      // naive answer is index 2, but detaching node-a1 first shifts node-a2
      // down, so the landing spot is 1. Getting this wrong is how a node ends
      // up one place too far every time it is dragged downwards.
      expect(planDrop(sampleTree, "node-a1", "node-a2", "after")).toEqual({
        parentId: "node-a",
        index: 1,
      });
    });

    it("does not correct the index when the node moves up", () => {
      // The mirror case: node-a2 at index 1 dropped before node-a1 at index 0.
      // Nothing before it is removed, so the index stands.
      expect(planDrop(sampleTree, "node-a2", "node-a1", "before")).toEqual({
        parentId: "node-a",
        index: 0,
      });
    });

    it("returns an empty list position for a leaf target", () => {
      expect(planDrop(sampleTree, "node-b", "node-a1", "child")).toEqual({
        parentId: "node-a1",
        index: 0,
      });
    });

    it("refuses a drop onto itself", () => {
      expect(planDrop(sampleTree, "node-a", "node-a", "child")).toBeNull();
      expect(planDrop(sampleTree, "node-a", "node-a", "before")).toBeNull();
    });

    it("refuses a drop into the dragged node's own subtree", () => {
      expect(planDrop(sampleTree, "node-a", "node-a1", "before")).toBeNull();
      expect(planDrop(sampleTree, "node-a", "node-a1", "child")).toBeNull();
    });

    it("refuses to reorder the root, which has no siblings", () => {
      expect(planDrop(sampleTree, "node-a", "root-node", "before")).toBeNull();
      expect(planDrop(sampleTree, "node-a", "root-node", "after")).toBeNull();
      // ...but still allows dropping onto it, which makes the node a child.
      expect(planDrop(sampleTree, "node-a", "root-node", "child")).toEqual({
        parentId: "root-node",
        index: 2,
      });
    });

    it("reorders correctly once the plan is handed to reparentNode", () => {
      // The end-to-end check, and the reason the correction above matters: this
      // is the assertion that would fail if the index were off by one.
      const plan = planDrop(sampleTree, "node-a1", "node-a2", "after")!;
      const updated = reparentNode(sampleTree, "node-a1", plan.parentId, plan.index);

      const branchA = updated.children.find((c) => c.id === "node-a")!;
      expect(branchA.children.map((c) => c.id)).toEqual(["node-a2", "node-a1"]);
    });

    it("reparents when the plan targets another branch", () => {
      const plan = planDrop(sampleTree, "node-b1", "node-a1", "after")!;
      const updated = reparentNode(sampleTree, "node-b1", plan.parentId, plan.index);

      const branchA = updated.children.find((c) => c.id === "node-a")!;
      const branchB = updated.children.find((c) => c.id === "node-b")!;
      expect(branchA.children.map((c) => c.id)).toEqual(["node-a1", "node-b1", "node-a2"]);
      expect(branchB.children).toEqual([]);
    });
  });

  describe("moveWithinSiblings", () => {
    const branchAChildren = (tree: MindmapNode) =>
      tree.children.find((c) => c.id === "node-a")!.children ?? [];

    it("moves a node towards the front", () => {
      const updated = moveWithinSiblings(sampleTree, "node-a2", -1);
      expect(branchAChildren(updated).map((c) => c.id)).toEqual(["node-a2", "node-a1"]);
    });

    it("moves a node towards the back", () => {
      const updated = moveWithinSiblings(sampleTree, "node-a1", 1);
      expect(branchAChildren(updated).map((c) => c.id)).toEqual(["node-a2", "node-a1"]);
    });

    it("moves a top-level branch among the root's children", () => {
      const updated = moveWithinSiblings(sampleTree, "node-a", 1);
      expect(updated.children.map((c) => c.id)).toEqual(["node-b", "node-a"]);
    });

    it("copies a branch with fresh ids and keeps the original alone", () => {
      const copied = copySubtree(sampleTree, "node-a")!;

      expect(copied.text).toBe("分支A");
      // Fresh ids are the whole point: node ids are derived from a document's
      // structure, so a copy that kept them would give two nodes the same id
      // and every lookup would find whichever came first.
      expect(copied.id).not.toBe("node-a");
      expect(copied.children.map((c) => c.id)).not.toContain("node-a1");
      expect(copied.children.map((c) => c.text)).toEqual(["要点A1", "要点A2"]);
    });

    it("copies styles so a pasted branch does not lose its colour", () => {
      const styled: MindmapNode = {
        ...sampleTree,
        children: [{ ...sampleTree.children[0], color: "#38bdf8" }],
      };

      const copied = copySubtree(styled, "node-a")!;

      expect(copied.color).toBe("#38bdf8");
    });

    it("returns null when there is nothing to copy", () => {
      expect(copySubtree(sampleTree, "does-not-exist")).toBeNull();
    });

    it("pastes under the given parent and selects the new node", () => {
      const copied = copySubtree(sampleTree, "node-a1")!;
      const result = pasteSubtree(sampleTree, "node-b", copied)!;

      const branchB = result.nextTree.children.find((c) => c.id === "node-b")!;
      expect(branchB.children.map((c) => c.text)).toEqual(["要点B1", "要点A1"]);
      // The id handed back is the one that actually landed in the tree,
      // because that is what the view selects afterwards.
      expect(branchB.children.some((c) => c.id === result.newNodeId)).toBe(true);
    });

    it("pasting twice produces two distinct nodes rather than one duplicated id", () => {
      const copied = copySubtree(sampleTree, "node-a1")!;
      const first = pasteSubtree(sampleTree, "node-b", copied)!;
      const second = pasteSubtree(first.nextTree, "node-b", copied)!;

      const branchB = second.nextTree.children.find((c) => c.id === "node-b")!;
      expect(branchB.children).toHaveLength(3);
      expect(new Set(branchB.children.map((c) => c.id)).size).toBe(3);
    });

    it("pastes onto the root when nothing is selected", () => {
      const copied = copySubtree(sampleTree, "node-b1")!;
      const result = pasteSubtree(sampleTree, undefined, copied)!;

      expect(result.nextTree.children.at(-1)!.text).toBe("要点B1");
    });

    it("recomputes levels so a pasted branch sits at its new depth", () => {
      // Copying a level-2 leaf onto a deep branch would otherwise carry level 2
      // with it, and every indentation afterwards would be wrong.
      const copied = copySubtree(sampleTree, "node-b1")!;
      expect(copied.level).toBe(2);

      const result = pasteSubtree(sampleTree, "node-a1", copied)!;
      const branchA = result.nextTree.children.find((c) => c.id === "node-a")!;
      const pasted = branchA.children[0].children[0];

      expect(pasted.text).toBe("要点B1");
      expect(pasted.level).toBe(3);
    });

    it("leaves the tree it was given untouched", () => {
      const copied = copySubtree(sampleTree, "node-a")!;
      pasteSubtree(sampleTree, "node-b", copied);

      const branchB = sampleTree.children.find((c) => c.id === "node-b")!;
      expect(branchB.children.map((c) => c.id)).toEqual(["node-b1"]);
    });

    it("returns the same tree when the node is already first", () => {
      // Identity, not equality: a no-op must not push an undo entry, and the
      // caller decides that by comparing references.
      expect(moveWithinSiblings(sampleTree, "node-a1", -1)).toBe(sampleTree);
    });

    it("returns the same tree when the node is already last", () => {
      expect(moveWithinSiblings(sampleTree, "node-a2", 1)).toBe(sampleTree);
    });

    it("returns the same tree for the root, which has no siblings", () => {
      expect(moveWithinSiblings(sampleTree, "root-node", -1)).toBe(sampleTree);
      expect(moveWithinSiblings(sampleTree, "root-node", 1)).toBe(sampleTree);
    });

    it("returns the same tree for an unknown node", () => {
      expect(moveWithinSiblings(sampleTree, "does-not-exist", 1)).toBe(sampleTree);
    });

    it("leaves the rest of the tree alone", () => {
      const updated = moveWithinSiblings(sampleTree, "node-a1", 1);
      // Moving a leaf must not disturb the other branch or the levels.
      const branchB = updated.children.find((c) => c.id === "node-b")!;
      expect(branchB.children.map((c) => c.id)).toEqual(["node-b1"]);
      expect(branchAChildren(updated).every((c) => c.level === 2)).toBe(true);
    });
  });
});
