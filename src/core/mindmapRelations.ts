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
  /** What the line says. Empty or absent means it says nothing. */
  label?: string;
  /**
   * Where the arrowheads go, relative to the stored order.
   *
   * Relative to `fromId`/`toId` rather than to a topic, because which of the two
   * ids sorts first is an accident of their spelling — the panel resolves these
   * into the topics' own names and offers both directions, so the reader chooses
   * "甲 → 乙" and the file records it in terms the pair already has.
   */
  arrow?: string;
  /** Line style id from the table below. Absent means the default. */
  style?: string;
  /** A mark colour id. Absent means the line follows the theme. */
  color?: string;
  /** Fields a newer version added, kept as they were read. */
  [field: string]: unknown;
}

/**
 * The arrows a line can carry.
 *
 * `forward` and `backward` are read as "the direction the pair is stored in",
 * and the panel is what turns that into the two topics' names.
 */
export const MINDMAP_RELATION_ARROWS = [
  { id: "none", label: "无" },
  { id: "forward", label: "单向" },
  { id: "backward", label: "单向（反向）" },
  { id: "both", label: "双向" },
] as const;

export const DEFAULT_RELATION_ARROW = MINDMAP_RELATION_ARROWS[0].id;

/**
 * How a line is drawn.
 *
 * Dashed is the default because it is what tells a relation apart from the
 * outline's own connectors at a glance — a solid line here would read as a branch
 * that goes sideways.
 */
export const MINDMAP_RELATION_STYLES = [
  // The default's dash is the stylesheet's own, spelled the same way, because the
  // drawing always writes a dash onto the element: an export has no stylesheet,
  // and a line that arrived solid would be a line the reader did not choose.
  { id: "dashed", label: "虚线", dash: "5 4" },
  { id: "solid", label: "实线", dash: "none" },
  { id: "dotted", label: "点线", dash: "1.5 5" },
] as const;

export const DEFAULT_RELATION_STYLE = MINDMAP_RELATION_STYLES[0];

/** The style for an id. An unknown id draws as the default; the file keeps it. */
export function findRelationStyle(id?: string): (typeof MINDMAP_RELATION_STYLES)[number] {
  return MINDMAP_RELATION_STYLES.find((entry) => entry.id === id) ?? DEFAULT_RELATION_STYLE;
}

/** The arrow for an id, read the same way a style id is. */
export function findRelationArrow(id?: string): (typeof MINDMAP_RELATION_ARROWS)[number] {
  return MINDMAP_RELATION_ARROWS.find((entry) => entry.id === id) ?? MINDMAP_RELATION_ARROWS[0];
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
  return relationGeometry(from, to).path;
}

/**
 * Everything about the line that more than one thing needs: its path, where it
 * starts and ends, where its middle is, and which way it is heading at each end.
 *
 * One function returning all of it rather than several that each redo the bow
 * arithmetic: a label has to sit on the line and an arrowhead has to point along
 * it, and both would otherwise be a second guess at geometry the path already
 * decided. Pure, and tested as properties — an apex off the curve or an arrowhead
 * pointing sideways is not something anyone catches by looking at a screenshot.
 */
export function relationGeometry(
  from: RelationBox,
  to: RelationBox
): {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** The curve's mid-point, which is where a label goes. */
  apex: { x: number; y: number };
  /** The direction of travel at each end, in radians, for an arrowhead. */
  startAngle: number;
  endAngle: number;
} {
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

  return {
    path: `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`,
    start,
    end,
    // A quadratic Bézier at its middle: (start + 2·control + end) / 4.
    apex: {
      x: (start.x + 2 * controlX + end.x) / 4,
      y: (start.y + 2 * controlY + end.y) / 4,
    },
    startAngle: Math.atan2(controlY - start.y, controlX - start.x),
    endAngle: Math.atan2(end.y - controlY, end.x - controlX),
  };
}

/**
 * An arrowhead: a triangle whose tip is at the point it marks.
 *
 * The tip is on the point itself rather than short of it, because the point is
 * where the line met the box — an arrow that stopped short would leave a gap that
 * widens and narrows with the zoom. Drawn as a path rather than with an SVG
 * marker: a marker would have to be defined once per colour, and every relation
 * may carry a different one.
 */
export function arrowHeadPath(
  point: { x: number; y: number },
  angle: number,
  size = 9
): string {
  const back = { x: point.x - Math.cos(angle) * size, y: point.y - Math.sin(angle) * size };
  const normal = { x: -Math.sin(angle) * size * 0.45, y: Math.cos(angle) * size * 0.45 };

  return [
    `M ${point.x} ${point.y}`,
    `L ${back.x + normal.x} ${back.y + normal.y}`,
    `L ${back.x - normal.x} ${back.y - normal.y}`,
    "Z",
  ].join(" ");
}

/** Whether a line with this arrow has a head at its start, and at its end. */
export function arrowEnds(
  arrow: string | undefined
): { atStart: boolean; atEnd: boolean } {
  const id = findRelationArrow(arrow).id;
  return {
    atStart: id === "backward" || id === "both",
    atEnd: id === "forward" || id === "both",
  };
}
