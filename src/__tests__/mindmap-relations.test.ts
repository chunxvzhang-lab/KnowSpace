import { describe, expect, it } from "vitest";
import {
  MINDMAP_RELATION_ARROWS,
  MINDMAP_RELATION_STYLES,
  arrowEnds,
  arrowHeadPath,
  boxEdgePoint,
  findRelationArrow,
  findRelationStyle,
  isSameRelation,
  relationGeometry,
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

describe("关系线的标签与箭头", () => {
  const OTHER: RelationBox = { x: 400, y: 260, width: 80, height: 40 };

  it("标签的位置是一条纯函数给出来的，且落在两点之间", () => {
    // A label placed by the component would be a second opinion about where the
    // line goes; this is the same function that drew it.
    const { start, end, apex } = relationGeometry(BOX, OTHER);

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    expect(apex.x).toBeGreaterThanOrEqual(minX);
    expect(apex.x).toBeLessThanOrEqual(maxX);
    expect(apex.y).toBeGreaterThanOrEqual(minY);
    expect(apex.y).toBeLessThanOrEqual(maxY);
  });

  it("路径还是那条路径：几何里带的与单独画的是同一个", () => {
    for (const to of [OTHER, { x: -300, y: -120, width: 60, height: 60 }, BOX]) {
      expect(relationGeometry(BOX, to).path).toBe(relationPath(BOX, to));
    }
  });

  it("箭头：尖端在点上，尾在来向的后方", () => {
    const points = points2(arrowHeadPath({ x: 100, y: 50 }, 0, 10));

    // Angle zero means the line arrives travelling right, so the tip is the
    // rightmost point and the two barbs are behind it, one above and one below.
    expect(points[0]).toEqual({ x: 100, y: 50 });
    expect(points[1].x).toBeLessThan(100);
    expect(points[2].x).toBeLessThan(100);
    expect(points[1].y).toBeGreaterThan(50);
    expect(points[2].y).toBeLessThan(50);
  });

  it("箭头跟着方向走：两个倒钩对称地分在轴的两侧", () => {
    const right = points2(arrowHeadPath({ x: 0, y: 0 }, 0));
    const down = points2(arrowHeadPath({ x: 0, y: 0 }, Math.PI / 2));

    // Travelling right: the tip is at the point, both barbs are behind it, and
    // they straddle the axis — one above, one below.
    expect(right[0]).toEqual({ x: 0, y: 0 });
    expect(right[1].x).toBeLessThan(0);
    expect(right[2].x).toBeLessThan(0);
    expect(right[1].y).toBeCloseTo(-right[2].y, 6);
    expect(Math.abs(right[1].y)).toBeGreaterThan(0);

    // Travelling down: the same three facts, turned.
    expect(down[0]).toEqual({ x: 0, y: 0 });
    expect(down[1].y).toBeLessThan(0);
    expect(down[2].y).toBeLessThan(0);
    expect(down[1].x).toBeCloseTo(-down[2].x, 6);
    expect(Math.abs(down[1].x)).toBeGreaterThan(0);
  });

  it("哪一端有箭头：与存储的顺序相对，而不是与主题相对", () => {
    expect(arrowEnds(undefined)).toEqual({ atStart: false, atEnd: false });
    expect(arrowEnds("none")).toEqual({ atStart: false, atEnd: false });
    expect(arrowEnds("forward")).toEqual({ atStart: false, atEnd: true });
    expect(arrowEnds("backward")).toEqual({ atStart: true, atEnd: false });
    expect(arrowEnds("both")).toEqual({ atStart: true, atEnd: true });
  });

  it("形态与箭头：不认识的就用默认，且默认确实在表里", () => {
    // The table decides what to draw, the file remembers what the reader chose —
    // so an unknown id draws the default rather than nothing at all.
    expect(findRelationStyle(undefined).id).toBe("dashed");
    expect(findRelationStyle("未来的形态").id).toBe("dashed");
    expect(findRelationArrow("future").id).toBe("none");

    // The default's dash has to match what the stylesheet draws, since the
    // drawing always writes it onto the element.
    expect(MINDMAP_RELATION_STYLES[0].dash).toBe("5 4");
    // Solid is spelled as a keyword, because an empty attribute would leave the
    // dash to the stylesheet — which is exactly what "solid" must not do.
    expect(findRelationStyle("solid").dash).toBe("none");
    expect(new Set(MINDMAP_RELATION_ARROWS.map((a) => a.id)).size).toBe(
      MINDMAP_RELATION_ARROWS.length
    );
    expect(new Set(MINDMAP_RELATION_STYLES.map((s) => s.id)).size).toBe(
      MINDMAP_RELATION_STYLES.length
    );
  });
});

/** The points of an arrowhead path, as pairs. */
function points2(path: string): { x: number; y: number }[] {
  const numbers = pathNumbers(path);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return points;
}
