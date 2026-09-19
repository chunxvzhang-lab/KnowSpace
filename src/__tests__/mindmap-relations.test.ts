import { describe, expect, it } from "vitest";
import {
  boxEdgePoint,
  isSameRelation,
  relationKey,
  relationPath,
  toRelation,
  type RelationBox,
} from "../core/mindmapRelations";

/**
 * The geometry of a relation line.
 *
 * The rules are one line each, and the arithmetic is the part of drawing a line
 * that nobody can check by looking at the result — a line that starts three
 * pixels inside a box looks deliberate. So it is checked here instead: the
 * endpoint is on the box's edge, for any pair of boxes, in any arrangement.
 */

const BOX: RelationBox = { x: 0, y: 0, width: 100, height: 40 };

/** The numbers in a path, in order: M x y Q cx cy x y — six of them, not eight. */
function pathNumbers(path: string): number[] {
  return (path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

/** Whether a point sits on the box's boundary, within a hair. */
function onEdge(point: { x: number; y: number }, box: RelationBox): boolean {
  const withinX = point.x >= box.x - 1e-6 && point.x <= box.x + box.width + 1e-6;
  const withinY = point.y >= box.y - 1e-6 && point.y <= box.y + box.height + 1e-6;
  const onVertical = Math.abs(point.x - box.x) < 1e-6 || Math.abs(point.x - (box.x + box.width)) < 1e-6;
  const onHorizontal =
    Math.abs(point.y - box.y) < 1e-6 || Math.abs(point.y - (box.y + box.height)) < 1e-6;
  return withinX && withinY && (onVertical || onHorizontal);
}

describe("关系线的两端", () => {
  it("朝右就停在右边，朝上就停在上边", () => {
    expect(boxEdgePoint(BOX, { x: 500, y: 20 })).toEqual({ x: 100, y: 20 });
    expect(boxEdgePoint(BOX, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
    expect(boxEdgePoint(BOX, { x: -500, y: 20 })).toEqual({ x: 0, y: 20 });
    expect(boxEdgePoint(BOX, { x: 50, y: 500 })).toEqual({ x: 50, y: 40 });
  });

  it("斜着走时先碰到哪条边就停在哪条边", () => {
    // A 100x40 box is reached on its long side first for any slope shallower
    // than its aspect ratio, and on its short side for anything steeper.
    const shallow = boxEdgePoint(BOX, { x: 400, y: 80 });
    expect(shallow.x).toBe(100);

    const steep = boxEdgePoint(BOX, { x: 100, y: 400 });
    expect(steep.y).toBe(40);
  });

  it("朝自己就是中心", () => {
    expect(boxEdgePoint(BOX, { x: 50, y: 20 })).toEqual({ x: 50, y: 20 });
  });

  it("换一个位置、换一个尺寸，仍然落在边上", () => {
    // The property, rather than four examples: whatever the boxes are, the
    // endpoints are on them — which is the thing a centre-to-centre line gets
    // wrong in a way that only shows up under a wide node.
    const boxes: RelationBox[] = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 300, y: 0, width: 40, height: 100 },
      { x: -200, y: -60, width: 220, height: 30 },
      { x: 120, y: 240, width: 60, height: 60 },
    ];

    for (const from of boxes) {
      for (const to of boxes) {
        if (from === to) continue;
        const [startX, startY, , , endX, endY] = pathNumbers(relationPath(from, to));
        const start = { x: startX, y: startY };
        const end = { x: endX, y: endY };

        const label = `起点 ${JSON.stringify(from)} → 终点 ${JSON.stringify(to)}`;
        expect(onEdge(start, from), `起点不在框上：${label}`).toBe(true);
        expect(onEdge(end, to), `终点不在框上：${label}`).toBe(true);
      }
    }
  });

  it("画成一条二次曲线，不是直线", () => {
    const path = relationPath(BOX, { x: 300, y: 0, width: 40, height: 100 });

    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain(" Q ");
    // The control point is off the straight line between the two ends, which is
    // what makes a relation distinguishable from the outline's own connectors.
    const [startX, startY, controlX, controlY, endX, endY] = pathNumbers(path);
    const along = Math.hypot(endX - startX, endY - startY);
    const off = Math.abs((endX - startX) * (startY - controlY) - (startX - controlX) * (endY - startY)) / along;
    expect(off).toBeGreaterThan(1);
  });
});

describe("两条关系是不是同一条", () => {
  it("顺序无关：a→b 与 b→a 是同一条", () => {
    // Undirected on purpose, so the pair is stored in one canonical order —
    // otherwise the same line could be stored, drawn and removed twice over.
    expect(relationKey("a", "b")).toEqual(["a", "b"]);
    expect(relationKey("b", "a")).toEqual(["a", "b"]);
    expect(toRelation("b", "a")).toEqual({ fromId: "a", toId: "b" });

    expect(isSameRelation(toRelation("b", "a"), "a", "b")).toBe(true);
    expect(isSameRelation(toRelation("b", "a"), "b", "a")).toBe(true);
    expect(isSameRelation(toRelation("a", "b"), "a", "c")).toBe(false);
  });
});
