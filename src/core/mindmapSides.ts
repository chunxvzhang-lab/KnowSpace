/**
 * Which side of the root a topic hangs on, in the two-sided layout.
 *
 * The layout's own answer used to be the only answer: a first-level branch went to
 * whichever side was currently shorter, which balances the picture and leaves the reader
 * no say in it. Balance is a good default and a poor rule — 「先做的一半放左边」 is a
 * thing people want from a mind map, and the only way to get it was to add branches in an
 * order that happened to produce it, then never add another.
 *
 * So a side is something the reader can state, and it lives in the document's companion
 * file like every other thing a document cannot say. It is a **position**, not a
 * decoration: the outline is unchanged by it, and a document opened somewhere else still
 * has all of its topics.
 *
 * Only first-level branches have one. Deeper topics belong to the branch they are under,
 * and follow it.
 */
export type MindmapSide = "left" | "right";

export function isMindmapSide(value: unknown): value is MindmapSide {
  return value === "left" || value === "right";
}

export function oppositeSide(side: MindmapSide): MindmapSide {
  return side === "left" ? "right" : "left";
}
