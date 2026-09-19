import type { MindmapNode } from "./types";

/**
 * Outline numbers for a map's branches.
 *
 * A view decoration and nothing else: the numbers are drawn beside the nodes and
 * never folded into the text they number. That is not a small distinction. The
 * tree is what gets written back to the document, so numbering it would prefix
 * the reader's own prose with numbers they never typed; and a node's box is
 * measured from the text it holds, so a number inside the text would have to be
 * inside the measurement too — which is the layout engine's business, and its
 * golden snapshots exist to notice exactly that kind of change.
 *
 * What is left is a function from a tree to labels, which is also why the rules
 * below can be tested without a canvas in sight.
 */

/**
 * The number for every node that has one, by node id.
 *
 * The root is the document's title rather than a branch, so it goes unnumbered.
 * A branch is numbered by its parent's number and its own position: 1, then 1.2,
 * then 1.2.3.
 *
 * Positions are counted over all children rather than over the visible ones, so
 * folding a branch cannot renumber its siblings — a map whose numbers changed
 * depending on what happened to be open would be worse than no numbers.
 */
export function numberingFor(root: MindmapNode): Record<string, string> {
  const numbers: Record<string, string> = {};

  const walk = (node: MindmapNode, prefix: string) => {
    node.children.forEach((child, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      numbers[child.id] = number;
      walk(child, number);
    });
  };

  walk(root, "");
  return numbers;
}
