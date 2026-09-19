/**
 * A line between two topics — the one thing an outline cannot express.
 *
 * Not part of the tree, and never written to the document. The tree *is* the
 * document's own structure; a relationship between two of its nodes is something
 * the map adds on top, so it lives in the companion file. A document opened by an
 * app that has never heard of relations loses the lines and nothing else, which
 * is the whole point of the additional layer being separate.
 */

/** Which two topics a line joins. Stored as the pair, in one canonical order. */
export interface MindmapRelation {
  fromId: string;
  toId: string;
}

/** A box on the canvas: as much of a laid-out node as the geometry needs. */
export interface RelationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The pair in canonical order, so that "a relates to b" and "b relates to a" are
 * one relation rather than two.
 *
 * Undirected on purpose. A line between two topics says they are connected, and
 * the direction an arrow would add is not something this build offers — so
 * keeping both orders would let the same line be stored twice, drawn twice, and
 * removed once.
 */
export function relationKey(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/** The canonical relation for two ids, which is what gets stored. */
export function toRelation(a: string, b: string): MindmapRelation {
  const [fromId, toId] = relationKey(a, b);
  return { fromId, toId };
}

/** Whether this relation is the one between these two, whichever way round. */
export function isSameRelation(relation: MindmapRelation, a: string, b: string): boolean {
  const [fromId, toId] = relationKey(a, b);
  return relation.fromId === fromId && relation.toId === toId;
}

/**
 * Where a line from a box towards a point should start or end.
 *
 * A line drawn centre to centre disappears underneath both boxes. This walks
 * from the box's centre towards the other end and stops at the box's own edge,
 * which is why it works whatever the boxes' sizes or positions are.
 *
 * Pure, and tested: the arithmetic is the part of drawing a line that nobody can
 * check by looking at the result.
 */
export function boxEdgePoint(box: RelationBox, towards: { x: number; y: number }): { x: number; y: number } {
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const dx = towards.x - centreX;
  const dy = towards.y - centreY;

  if (dx === 0 && dy === 0) return { x: centreX, y: centreY };

  // How far along the direction the edge is: half the box's extent along that
  // axis, whichever axis the line reaches first. Zero movement along an axis
  // means that axis imposes no limit at all.
  const toVerticalEdge = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
  const toHorizontalEdge = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
  const scale = Math.min(toVerticalEdge, toHorizontalEdge);

  return { x: centreX + dx * scale, y: centreY + dy * scale };
}

/**
 * The curve between two boxes, bowed away from the straight line between them.
 *
 * Bowed rather than straight so a relation reads as a separate thing from the
 * outline's own connectors — and dashed, in the stylesheet, for the same reason.
 */
export function relationPath(from: RelationBox, to: RelationBox): string {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  const start = boxEdgePoint(from, toCentre);
  const end = boxEdgePoint(to, fromCentre);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Long lines get a wider bow, short ones a proportionally smaller one, and
  // neither gets a bow so large that the curve's apex leaves the paper.
  const bow = Math.min(60, length * 0.18);
  const controlX = (start.x + end.x) / 2 - (dy / length) * bow;
  const controlY = (start.y + end.y) / 2 + (dx / length) * bow;

  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}
