import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseMarkdownToMindmapTree, updateNodeStyle } from "../services/mindmapService";
import {
  DEFAULT_LAYOUT_ID,
  MINDMAP_LAYOUT_LIST,
  layoutMindmap,
  resolveLayoutId,
  type MindmapLayoutResult,
} from "../services/mindmapLayout";
import { loadMindmapLayout, saveMindmapLayout } from "../services/storage";
import type { MindmapNode } from "../core/types";

/**
 * Layouts share one tree, one measuring pass and one edge builder.
 *
 * The risk this file exists for is the one recorded after the theme work: adding
 * a second path (there, a second palette; here, a second layout) can silently
 * change what the first one produces, and the default is what every existing
 * document keeps. So the first tests below are golden snapshots of the default
 * layout's geometry, connectors and bounds, taken before the layout switch
 * existed. They are not a description of what the numbers mean; they are the old
 * behaviour, pinned.
 */

const SOURCE = [
  "- 父节点",
  "  - 子节点甲",
  "  - 子节点乙",
  "    - 孙节点",
  "- 第二个分支",
  "- 第三个分支",
].join("\n");

/**
 * Uneven on purpose: two tall branches, three leaves.
 *
 * A dealing rule that simply splits the list in half puts both tall branches on
 * one side and leaves the other side nearly empty, which is the case the rule is
 * supposed to avoid.
 */
const BRANCHED = [
  "- 分支一",
  "  - 一甲",
  "  - 一乙",
  "- 分支二",
  "- 分支三",
  "  - 三甲",
  "    - 三甲子",
  "- 分支四",
  "- 分支五",
].join("\n");

/** The layout's own level spacing, written out because a test should not import the number it checks. */
const LEVEL_GAP = 72;
const ORIGIN = 40;

/** Position and size only: the fields a layout is responsible for. */
function geometry(layout: MindmapLayoutResult) {
  return layout.nodes.map((node) => [node.id, node.x, node.y, node.width, node.height]);
}

/** What the connectors look like, which is where a direction change shows up. */
function connectors(layout: MindmapLayoutResult) {
  return layout.edges.map((edge) => [edge.fromId, edge.toId, edge.d]);
}

function byId(layout: MindmapLayoutResult): Map<string, MindmapLayoutResult["nodes"][number]> {
  return new Map(layout.nodes.map((node) => [node.id, node]));
}

function boxesOverlap(a: MindmapLayoutResult["nodes"][number], b: MindmapLayoutResult["nodes"][number]) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The point a radial layout radiates from: the root's centre. */
function centreOf(tree: MindmapNode, layout: MindmapLayoutResult) {
  const root = rootOf(tree, layout);
  return { x: root.x + root.width / 2, y: root.y + root.height / 2 };
}

/**
 * Whether a point lies on the border of a box, within a couple of pixels.
 *
 * Deliberately not "does it equal what the layout computes": re-deriving the
 * same formula would only assert that the code agrees with itself.
 */
function onPerimeter(
  box: MindmapLayoutResult["nodes"][number],
  x: number,
  y: number,
  tolerance = 0.01
): boolean {
  const inside =
    x >= box.x - tolerance &&
    x <= box.x + box.width + tolerance &&
    y >= box.y - tolerance &&
    y <= box.y + box.height + tolerance;
  const onVerticalEdge =
    Math.min(Math.abs(x - box.x), Math.abs(x - (box.x + box.width))) <= tolerance;
  const onHorizontalEdge =
    Math.min(Math.abs(y - box.y), Math.abs(y - (box.y + box.height))) <= tolerance;
  return inside && (onVerticalEdge || onHorizontalEdge);
}

/** Every number in a path, in order: the shape of a connector, not its meaning. */
function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** The two endpoints of a connector, read back out of its path. */
function endpoints(d: string): { fromX: number; fromY: number; toX: number; toY: number } {
  const numbers = pathNumbers(d);
  return {
    fromX: numbers[0],
    fromY: numbers[1],
    toX: numbers[numbers.length - 2],
    toY: numbers[numbers.length - 1],
  };
}

describe("思维导图布局", () => {
  describe("默认布局（逻辑结构图）", () => {
    it("坐标与改动前逐项相同", () => {
      const layout = layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试"));

      expect(geometry(layout)).toMatchInlineSnapshot(`
        [
          [
            "root-mindmap-node",
            40,
            118.5,
            74,
            49,
          ],
          [
            "node-root-0",
            186,
            68,
            69,
            38,
          ],
          [
            "node-root-0-0",
            327,
            40,
            83,
            38,
          ],
          [
            "node-root-0-1",
            327,
            96,
            83,
            38,
          ],
          [
            "node-root-0-1-0",
            482,
            96,
            69,
            38,
          ],
          [
            "node-root-1",
            186,
            152,
            96,
            38,
          ],
          [
            "node-root-2",
            186,
            208,
            96,
            38,
          ],
        ]
      `);
    });

    it("连线路径与改动前逐项相同", () => {
      const layout = layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试"));

      expect(connectors(layout)).toMatchInlineSnapshot(`
        [
          [
            "node-root-0",
            "node-root-0-0",
            "M 255 87 C 291 87, 291 59, 327 59",
          ],
          [
            "node-root-0-1",
            "node-root-0-1-0",
            "M 410 115 C 446 115, 446 115, 482 115",
          ],
          [
            "node-root-0",
            "node-root-0-1",
            "M 255 87 C 291 87, 291 115, 327 115",
          ],
          [
            "root-mindmap-node",
            "node-root-0",
            "M 114 143 C 150 143, 150 87, 186 87",
          ],
          [
            "root-mindmap-node",
            "node-root-1",
            "M 114 143 C 150 143, 150 171, 186 171",
          ],
          [
            "root-mindmap-node",
            "node-root-2",
            "M 114 143 C 150 143, 150 227, 186 227",
          ],
        ]
      `);
    });

    it("包围盒与改动前相同", () => {
      const layout = layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试"));

      expect(layout.bounds).toMatchInlineSnapshot(`
        {
          "height": 326,
          "maxX": 611,
          "maxY": 306,
          "minX": 0,
          "minY": 0,
          "width": 631,
        }
      `);
    });

    it("不传布局时与显式传入默认布局完全一致", () => {
      // The switch's default path is what every existing document takes. If the
      // two ever diverge, the golden snapshots above would be guarding a code
      // path nobody runs.
      const tree = parseMarkdownToMindmapTree(SOURCE, "测试");

      expect(geometry(layoutMindmap(tree, new Set(), DEFAULT_LAYOUT_ID))).toEqual(
        geometry(layoutMindmap(tree))
      );
    });

    it("每个节点都向右生长，因为折叠按钮挂在右边缘", () => {
      // Not cosmetic: the renderer hangs the collapse toggle off `side`. A stray
      // `left` in the default layout would put the toggle on the wrong edge.
      const layout = layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试"));

      expect(layout.nodes.every((node) => node.side === "right")).toBe(true);
    });
  });

  describe("布局表", () => {
    it("默认布局在表里", () => {
      expect(MINDMAP_LAYOUT_LIST.some((layout) => layout.id === DEFAULT_LAYOUT_ID)).toBe(true);
    });

    it("每项都有标签和说明", () => {
      for (const layout of MINDMAP_LAYOUT_LIST) {
        expect(layout.label.length).toBeGreaterThan(0);
        expect(layout.description.length).toBeGreaterThan(0);
      }
    });

    it("id 不重复", () => {
      const ids = MINDMAP_LAYOUT_LIST.map((layout) => layout.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("resolveLayoutId", () => {
    it("接受一个存在的布局 id", () => {
      expect(resolveLayoutId("bidirectional")).toBe("bidirectional");
    });

    it("对未知、缺失或非字符串的值回退到默认", () => {
      // Read back from storage, so it can be an id from a version that had a
      // layout since removed, a typo, or nothing at all.
      expect(resolveLayoutId("已删除的布局")).toBe(DEFAULT_LAYOUT_ID);
      expect(resolveLayoutId(undefined)).toBe(DEFAULT_LAYOUT_ID);
      expect(resolveLayoutId(null)).toBe(DEFAULT_LAYOUT_ID);
      expect(resolveLayoutId(3)).toBe(DEFAULT_LAYOUT_ID);
    });

    it("不会把原型链上的键当成布局", () => {
      // Same trap the theme resolver documents: `value in table` says yes to
      // these, because they come from Object.prototype.
      expect(resolveLayoutId("toString")).toBe(DEFAULT_LAYOUT_ID);
      expect(resolveLayoutId("constructor")).toBe(DEFAULT_LAYOUT_ID);
    });
  });

  describe("双向布局", () => {
    const tree = parseMarkdownToMindmapTree(BRANCHED, "测试");
    const layout = layoutMindmap(tree, new Set(), "bidirectional");
    const placed = byId(layout);
    const root = rootOf(tree, layout);

    it("每个节点都出现，且只出现一次", () => {
      const ids = layout.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice().sort()).toEqual(treeIds(tree).sort());
    });

    it("一级分支被分到两侧，各自保持文档顺序", () => {
      const order = tree.children.map((child) => child.id);
      const onLeft = order.filter((id) => placed.get(id)?.side === "left");
      const onRight = order.filter((id) => placed.get(id)?.side === "right");

      // Every branch went somewhere, and each side kept the document's order —
      // which is what makes the map readable rather than shuffled.
      expect(onLeft.length + onRight.length).toBe(order.length);
      expect(onLeft).toEqual(order.filter((id) => onLeft.includes(id)));
      expect(onRight).toEqual(order.filter((id) => onRight.includes(id)));
      expect(onLeft.length).toBeGreaterThan(0);
      expect(onRight.length).toBeGreaterThan(0);
    });

    it("两侧的分支体量大致相当", () => {
      // The point of dealing to the shorter side: the leftover imbalance can
      // never exceed the last branch dealt, whereas splitting the list in half
      // would put both tall branches on the same side of this fixture.
      const extent = (side: "left" | "right") => {
        const nodes = layout.nodes.filter((node) => node.side === side);
        const top = Math.min(...nodes.map((node) => node.y));
        const bottom = Math.max(...nodes.map((node) => node.y + node.height));
        return bottom - top;
      };
      const tallest = Math.max(
        ...tree.children.map((child) => {
          const nodes = subtreeNodes(tree, child.id).map((id) => placed.get(id)!);
          return (
            Math.max(...nodes.map((node) => node.y + node.height)) -
            Math.min(...nodes.map((node) => node.y))
          );
        })
      );

      expect(Math.abs(extent("left") - extent("right"))).toBeLessThanOrEqual(tallest);
    });

    it("根居中，两侧各隔一个层间距", () => {
      const leftReach = Math.max(
        ...layout.nodes.filter((node) => node.side === "left").map((node) => node.x + node.width)
      );
      const rightStart = Math.min(
        ...layout.nodes.filter((node) => node.side === "right" && node.id !== root.id).map((node) => node.x)
      );

      expect(leftReach).toBeLessThanOrEqual(root.x - LEVEL_GAP + 0.001);
      expect(rightStart).toBeGreaterThanOrEqual(root.x + root.width + LEVEL_GAP - 0.001);
    });

    it("同一分支的后代跟着分支走，不会翻到另一侧", () => {
      // Turning each generation round again produces a comb rather than a map.
      for (const edge of layout.edges) {
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        if (parent.id === root.id) continue;
        expect(child.side).toBe(parent.side);
      }
    });

    it("所有节点互不重叠", () => {
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(
            boxesOverlap(layout.nodes[i], layout.nodes[j]),
            `重叠: ${layout.nodes[i].id} 与 ${layout.nodes[j].id}`
          ).toBe(false);
        }
      }
    });

    it("连线接在朝向对方的那条边上", () => {
      // The half of the feature that is easy to get subtly wrong: a connector
      // leaving the parent's right edge for a child that sits on its left would
      // cross the node it comes from.
      expect(layout.edges.length).toBeGreaterThan(0);
      for (const edge of layout.edges) {
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        const growsLeft = child.side === "left";
        const { fromX, fromY, toX, toY } = endpoints(edge.d);

        expect(fromX).toBeCloseTo(growsLeft ? parent.x : parent.x + parent.width);
        expect(fromY).toBeCloseTo(parent.y + parent.height / 2);
        expect(toX).toBeCloseTo(growsLeft ? child.x + child.width : child.x);
        expect(toY).toBeCloseTo(child.y + child.height / 2);
      }
    });

    it("坐标同样从原点开始", () => {
      expect(Math.min(...layout.nodes.map((node) => node.x))).toBe(ORIGIN);
      expect(Math.min(...layout.nodes.map((node) => node.y))).toBe(ORIGIN);
    });

    it("包围盒装得下所有节点", () => {
      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
        expect(node.y).toBeGreaterThanOrEqual(layout.bounds.minY);
        expect(node.x + node.width).toBeLessThanOrEqual(layout.bounds.maxX);
        expect(node.y + node.height).toBeLessThanOrEqual(layout.bounds.maxY);
      }
    });

    it("折叠的分支不出现，也没有连线通向它", () => {
      const folded = layoutMindmap(tree, new Set([tree.children[0].id]), "bidirectional");
      const hidden = treeIds(tree.children[0]).filter((id) => id !== tree.children[0].id);

      for (const id of hidden) {
        expect(folded.nodes.some((node) => node.id === id)).toBe(false);
        expect(folded.edges.some((edge) => edge.toId === id)).toBe(false);
      }
      // The folded branch itself stays, which is what the toggle is drawn on.
      expect(folded.nodes.some((node) => node.id === tree.children[0].id)).toBe(true);
    });

    it("只有一个节点、或根被折叠时，只剩根", () => {
      // The degenerate paths: no branches to deal, so there is no side to pick
      // and no connector to draw, and the shift has nothing to measure.
      const lone: MindmapNode = { id: "root-mindmap-node", text: "独苗", level: 0, children: [] };
      const single = layoutMindmap(lone, new Set(), "bidirectional");
      const folded = layoutMindmap(tree, new Set([tree.id]), "bidirectional");

      expect(single.nodes.length).toBe(1);
      expect(single.edges.length).toBe(0);
      expect(single.nodes[0].x).toBe(ORIGIN);
      expect(single.nodes[0].side).toBe("right");

      expect(folded.nodes.length).toBe(1);
      expect(folded.edges.length).toBe(0);
    });

    it("切换布局不改动树", () => {
      // A layout is a view-level choice. If laying out could write to the tree,
      // switching would be an edit and the document would drift every time
      // somebody looked at it sideways.
      const fresh = parseMarkdownToMindmapTree(BRANCHED, "测试");
      const before = JSON.stringify(fresh);

      layoutMindmap(fresh, new Set(), "bidirectional");
      layoutMindmap(fresh, new Set(), "logic");

      expect(JSON.stringify(fresh)).toBe(before);
    });

    it("分支的颜色索引与默认布局一致", () => {
      // Colour follows the branch's place in the document, not the side it was
      // dealt to, so switching layouts does not recolour the map.
      const logic = byId(layoutMindmap(tree, new Set(), "logic"));

      for (const node of layout.nodes) {
        expect(node.colorIndex).toBe(logic.get(node.id)?.colorIndex);
      }
    });
  });

  describe("纵向布局", () => {
    const tree = parseMarkdownToMindmapTree(BRANCHED, "测试");
    const layout = layoutMindmap(tree, new Set(), "vertical");
    const placed = byId(layout);

    it("每个节点都出现，且只出现一次", () => {
      const ids = layout.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice().sort()).toEqual(treeIds(tree).sort());
    });

    it("子节点总在父节点的下方", () => {
      expect(layout.edges.length).toBeGreaterThan(0);
      for (const edge of layout.edges) {
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        expect(child.y).toBeGreaterThanOrEqual(parent.y + parent.height);
      }
    });

    it("同一父节点下的兄弟从左到右保持文档顺序", () => {
      let checked = 0;
      walk(tree, (node) => {
        const xs = node.children.map((child) => placed.get(child.id)!.x);
        expect(xs).toEqual(xs.slice().sort((a, b) => a - b));
        if (node.children.length > 1) checked += 1;
      });
      // The fixture has nodes with several children, so the loop above ran.
      expect(checked).toBeGreaterThan(0);
    });

    it("所有节点互不重叠", () => {
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(
            boxesOverlap(layout.nodes[i], layout.nodes[j]),
            `重叠: ${layout.nodes[i].id} 与 ${layout.nodes[j].id}`
          ).toBe(false);
        }
      }
    });

    it("连线接在父节点的下边中点和子节点的上边中点", () => {
      for (const edge of layout.edges) {
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        const { fromX, fromY, toX, toY } = endpoints(edge.d);

        expect(fromX).toBeCloseTo(parent.x + parent.width / 2);
        expect(fromY).toBeCloseTo(parent.y + parent.height);
        expect(toX).toBeCloseTo(child.x + child.width / 2);
        expect(toY).toBeCloseTo(child.y);
      }
    });

    it("默认的贝塞尔沿纵轴弯折，控制点不落在两个节点的横向中点上", () => {
      // The three line styles were written for a map that flows to the right. A
      // bezier reused unchanged here would bend sideways and cross the level
      // below; the control points have to share the two nodes' x values instead.
      const edge = layout.edges[0];
      const numbers = pathNumbers(edge.d);
      const { fromX, toX } = endpoints(edge.d);

      expect(edge.style).toBe("bezier");
      expect(numbers[2]).toBeCloseTo(fromX);
      expect(numbers[4]).toBeCloseTo(toX);
      expect(numbers[2]).not.toBeCloseTo((fromX + toX) / 2);
    });

    it("step 线型在纵轴上先向下、再横移、再向下", () => {
      const styled = updateNodeStyle(tree, tree.children[0].id, { lineStyle: "step" });
      const stepped = layoutMindmap(styled, new Set(), "vertical");
      const edge = stepped.edges.find((candidate) => candidate.toId === tree.children[0].id)!;
      const numbers = pathNumbers(edge.d);
      const { fromX, fromY, toX, toY } = endpoints(edge.d);

      expect(edge.style).toBe("step");
      // Four segments, so eight numbers: down, across at the midpoint, down.
      expect(numbers).toHaveLength(8);
      expect(numbers[0]).toBeCloseTo(fromX);
      expect(numbers[2]).toBeCloseTo(fromX);
      expect(numbers[3]).toBeCloseTo((fromY + toY) / 2);
      expect(numbers[4]).toBeCloseTo(toX);
      expect(numbers[5]).toBeCloseTo((fromY + toY) / 2);
      expect(numbers[7]).toBeCloseTo(toY);
    });

    it("坐标从原点开始，包围盒装得下所有节点", () => {
      expect(Math.min(...layout.nodes.map((node) => node.x))).toBe(ORIGIN);
      expect(Math.min(...layout.nodes.map((node) => node.y))).toBe(ORIGIN);

      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
        expect(node.y).toBeGreaterThanOrEqual(layout.bounds.minY);
        expect(node.x + node.width).toBeLessThanOrEqual(layout.bounds.maxX);
        expect(node.y + node.height).toBeLessThanOrEqual(layout.bounds.maxY);
      }
    });

    it("有子节点的节点把子节点标记在下方", () => {
      // The renderer hangs the collapse toggle off this value, so a `right` here
      // would draw the toggle into the row below.
      for (const node of layout.nodes) {
        if (node.hasChildren) expect(node.side).toBe("bottom");
      }
      expect(layout.nodes.some((node) => node.hasChildren)).toBe(true);
    });

    it("折叠的分支不出现，也没有连线通向它", () => {
      const folded = layoutMindmap(tree, new Set([tree.children[0].id]), "vertical");
      const hidden = treeIds(tree.children[0]).filter((id) => id !== tree.children[0].id);

      for (const id of hidden) {
        expect(folded.nodes.some((node) => node.id === id)).toBe(false);
        expect(folded.edges.some((edge) => edge.toId === id)).toBe(false);
      }
    });

    it("分支的颜色索引与默认布局一致", () => {
      // Switching between the two layouts must not recolour the map.
      const logic = byId(layoutMindmap(tree, new Set(), "logic"));

      for (const node of layout.nodes) {
        expect(node.colorIndex).toBe(logic.get(node.id)?.colorIndex);
      }
    });

    it("切换布局不改动树", () => {
      const fresh = parseMarkdownToMindmapTree(BRANCHED, "测试");
      const before = JSON.stringify(fresh);

      layoutMindmap(fresh, new Set(), "vertical");

      expect(JSON.stringify(fresh)).toBe(before);
    });
  });

  describe("径向布局", () => {
    const tree = parseMarkdownToMindmapTree(BRANCHED, "测试");
    const layout = layoutMindmap(tree, new Set(), "radial");
    const placed = byId(layout);
    const centre = centreOf(tree, layout);
    const radiusOf = (x: number, y: number) => Math.hypot(x - centre.x, y - centre.y);
    const centreOfNode = (node: MindmapLayoutResult["nodes"][number]) => ({
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    });

    it("每个节点都出现，且只出现一次", () => {
      const ids = layout.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice().sort()).toEqual(treeIds(tree).sort());
    });

    it("同一深度的节点在同一个环上，深度越深环越大", () => {
      const byLevel = new Map<number, number[]>();
      for (const node of layout.nodes) {
        if (node.level === 0) continue;
        const point = centreOfNode(node);
        byLevel.set(node.level, [...(byLevel.get(node.level) ?? []), radiusOf(point.x, point.y)]);
      }

      const levels = [...byLevel.keys()].sort((a, b) => a - b);
      expect(levels.length).toBeGreaterThan(1);
      let previous = 0;
      for (const level of levels) {
        const radii = byLevel.get(level)!;
        for (const radius of radii) expect(radius).toBeCloseTo(radii[0], 6);
        expect(radii[0]).toBeGreaterThan(previous);
        previous = radii[0];
      }
    });

    it("所有节点互不重叠", () => {
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(
            boxesOverlap(layout.nodes[i], layout.nodes[j]),
            `重叠: ${layout.nodes[i].id} 与 ${layout.nodes[j].id}`
          ).toBe(false);
        }
      }
    });

    it("体量大的分支分到更宽的扇区，但差距远小于体量之比", () => {
      // Two equally heavy branches with one leaf between them, so the shares can
      // be read straight off the angles: the two heavy branches end up adjacent
      // across the wrap, and the gap between neighbouring branch centres is the
      // average of their two shares.
      //
      // An earlier version of this test averaged the neighbouring angles to
      // recover a sector boundary. That is only true when the two sectors are
      // equal, so it reported the heavy and light shares as identical and failed
      // on the last bit of a float — the test was wrong, not the layout.
      const mixTree = parseMarkdownToMindmapTree(
        [
          "- 重甲",
          "  - 重甲一",
          "  - 重甲二",
          "  - 重甲三",
          "  - 重甲四",
          "- 轻",
          "- 重乙",
          "  - 重乙一",
          "  - 重乙二",
          "  - 重乙三",
          "  - 重乙四",
        ].join("\n"),
        "测试"
      );
      const mixLayout = layoutMindmap(mixTree, new Set(), "radial");
      const mixCentre = centreOf(mixTree, mixLayout);

      let previous = -Infinity;
      const angles = mixTree.children.map((child) => {
        const node = mixLayout.nodes.find((candidate) => candidate.id === child.id)!;
        let angle = Math.atan2(
          node.y + node.height / 2 - mixCentre.y,
          node.x + node.width / 2 - mixCentre.x
        );
        // Unwrapped in document order: the assignment runs clockwise from the
        // top, so the sequence only ever ascends.
        while (angle < previous) angle += Math.PI * 2;
        previous = angle;
        return angle;
      });

      const heavyShare = angles[0] + Math.PI * 2 - angles[2];
      const lightShare = Math.PI * 2 - heavyShare * 2;
      const ratio = heavyShare / lightShare;

      // Weighting by size alone would give 5:1 here — five nodes against one —
      // and that is the ratio that pushes a light branch onto a sliver of an arc
      // and the ring it sits on out to thousands of pixels.
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(3);
    });

    it("连线从父节点朝向子节点的那条边出发，落在子节点朝向父节点的那条边", () => {
      expect(layout.edges.length).toBeGreaterThan(0);
      for (const edge of layout.edges) {
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        const { fromX, fromY, toX, toY } = endpoints(edge.d);

        expect(onPerimeter(parent, fromX, fromY), `${edge.fromId} 的起点不在边框上`).toBe(true);
        expect(onPerimeter(child, toX, toY), `${edge.toId} 的终点不在边框上`).toBe(true);

        // ...and on the side facing the other box, not the far side.
        const parentCentre = centreOfNode(parent);
        const childCentre = centreOfNode(child);
        expect(
          (childCentre.x - parentCentre.x) * (fromX - parentCentre.x) +
            (childCentre.y - parentCentre.y) * (fromY - parentCentre.y)
        ).toBeGreaterThan(0);
        expect(
          (parentCentre.x - childCentre.x) * (toX - childCentre.x) +
            (parentCentre.y - childCentre.y) * (toY - childCentre.y)
        ).toBeGreaterThan(0);
      }
    });

    it("默认的贝塞尔沿半径弯折，两个控制点都落在中间环上", () => {
      for (const edge of layout.edges) {
        if (edge.style !== "bezier") continue;
        const numbers = pathNumbers(edge.d);
        expect(numbers).toHaveLength(8);

        const fromRadius = radiusOf(numbers[0], numbers[1]);
        const toRadius = radiusOf(numbers[6], numbers[7]);
        const midRadius = (fromRadius + toRadius) / 2;

        expect(radiusOf(numbers[2], numbers[3])).toBeCloseTo(midRadius, 4);
        expect(radiusOf(numbers[4], numbers[5])).toBeCloseTo(midRadius, 4);
      }
    });

    it("需要折叠按钮的节点，落点朝外且贴着边框", () => {
      // The toggle has to sit where the children are, and here they are spread
      // around the node, so the layout hands over a point rather than a side.
      const parents = layout.nodes.filter((node) => node.hasChildren && node.level > 0);
      expect(parents.length).toBeGreaterThan(0);

      for (const node of parents) {
        expect(node.toggleOffset, `${node.id} 没有落点`).toBeDefined();
        const point = { x: node.x + node.toggleOffset!.x, y: node.y + node.toggleOffset!.y };
        expect(onPerimeter(node, point.x, point.y, 3), `${node.id} 的落点不在边框附近`).toBe(true);

        const nodeCentre = centreOfNode(node);
        const away = { x: nodeCentre.x - centre.x, y: nodeCentre.y - centre.y };
        const towards = { x: point.x - nodeCentre.x, y: point.y - nodeCentre.y };
        expect(away.x * towards.x + away.y * towards.y).toBeGreaterThan(0);
      }
    });

    it("坐标从原点开始，包围盒装得下所有节点", () => {
      expect(Math.min(...layout.nodes.map((node) => node.x))).toBe(ORIGIN);
      expect(Math.min(...layout.nodes.map((node) => node.y))).toBe(ORIGIN);

      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
        expect(node.y).toBeGreaterThanOrEqual(layout.bounds.minY);
        expect(node.x + node.width).toBeLessThanOrEqual(layout.bounds.maxX);
        expect(node.y + node.height).toBeLessThanOrEqual(layout.bounds.maxY);
      }
    });

    it("折叠的分支不出现，也没有连线通向它", () => {
      const folded = layoutMindmap(tree, new Set([tree.children[0].id]), "radial");
      const hidden = treeIds(tree.children[0]).filter((id) => id !== tree.children[0].id);

      for (const id of hidden) {
        expect(folded.nodes.some((node) => node.id === id)).toBe(false);
        expect(folded.edges.some((edge) => edge.toId === id)).toBe(false);
      }
      expect(folded.nodes.some((node) => node.id === tree.children[0].id)).toBe(true);
    });

    it("分支的颜色索引与默认布局一致", () => {
      const logic = byId(layoutMindmap(tree, new Set(), "logic"));

      for (const node of layout.nodes) {
        expect(node.colorIndex).toBe(logic.get(node.id)?.colorIndex);
      }
    });

    it("只有一个节点时只剩根，且没有连线", () => {
      const lone: MindmapNode = { id: "root-mindmap-node", text: "独苗", level: 0, children: [] };
      const single = layoutMindmap(lone, new Set(), "radial");

      expect(single.nodes.length).toBe(1);
      expect(single.edges.length).toBe(0);
      expect(single.nodes[0].x).toBe(ORIGIN);
    });

    it("切换布局不改动树", () => {
      const fresh = parseMarkdownToMindmapTree(BRANCHED, "测试");
      const before = JSON.stringify(fresh);

      layoutMindmap(fresh, new Set(), "radial");

      expect(JSON.stringify(fresh)).toBe(before);
    });
  });

  describe("时间轴布局", () => {
    const tree = parseMarkdownToMindmapTree(BRANCHED, "测试");
    const layout = layoutMindmap(tree, new Set(), "timeline");
    const placed = byId(layout);
    const root = rootOf(tree, layout);
    const spineY = root.y + root.height / 2;
    const branches = tree.children.map((child) => placed.get(child.id)!);

    it("每个节点都出现，且只出现一次", () => {
      const ids = layout.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice().sort()).toEqual(treeIds(tree).sort());
    });

    it("一级分支沿轴从左到右排列，上下交替，且都不跨轴", () => {
      const centres = branches.map((node) => node.x + node.width / 2);
      expect(centres).toEqual(centres.slice().sort((a, b) => a - b));

      let above = 0;
      let below = 0;
      branches.forEach((node, index) => {
        if (index % 2 === 0) {
          // Entirely on its own side: the axis is the corridor every connector
          // uses, so a box that straddled it would block the route.
          expect(node.y + node.height).toBeLessThanOrEqual(spineY);
          above += 1;
        } else {
          expect(node.y).toBeGreaterThanOrEqual(spineY);
          below += 1;
        }
      });
      expect(above).toBeGreaterThan(0);
      expect(below).toBeGreaterThan(0);
    });

    it("后代沿所属分支那一侧继续朝外，不会翻到对面", () => {
      const distance = (node: MindmapLayoutResult["nodes"][number]) =>
        Math.abs(node.y + node.height / 2 - spineY);

      let checked = 0;
      for (const edge of layout.edges) {
        if (edge.fromId === tree.id) continue;
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        expect(distance(child)).toBeGreaterThan(distance(parent));
        expect(child.side).toBe(parent.side);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it("所有节点互不重叠", () => {
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(
            boxesOverlap(layout.nodes[i], layout.nodes[j]),
            `重叠: ${layout.nodes[i].id} 与 ${layout.nodes[j].id}`
          ).toBe(false);
        }
      }
    });

    it("根到分支的连线沿轴走、再垂到节点", () => {
      const rootEdges = layout.edges.filter((edge) => edge.fromId === tree.id);
      expect(rootEdges.length).toBe(branches.length);

      for (const edge of rootEdges) {
        const numbers = pathNumbers(edge.d);
        // M spineStart spineY L childCentreX spineY L childCentreX innerEdge
        expect(numbers).toHaveLength(6);
        expect(numbers[0]).toBeCloseTo(root.x + root.width);
        expect(numbers[1]).toBeCloseTo(spineY);
        expect(numbers[3]).toBeCloseTo(spineY);

        const child = placed.get(edge.toId)!;
        expect(numbers[2]).toBeCloseTo(child.x + child.width / 2);
        expect(numbers[4]).toBeCloseTo(numbers[2]);
        expect(numbers[5]).toBeCloseTo(child.side === "bottom" ? child.y : child.y + child.height);
      }
    });

    it("轴上的那段走廊没有任何方框占用", () => {
      // The whole design rests on this: the axis is the only route from the root
      // to a branch that does not cut across the branches in between.
      const rootEdges = layout.edges.filter((edge) => edge.fromId === tree.id);

      for (const edge of rootEdges) {
        const numbers = pathNumbers(edge.d);
        const left = Math.min(numbers[0], numbers[2]);
        const right = Math.max(numbers[0], numbers[2]);

        for (const node of layout.nodes) {
          const blocksX = node.x < right && left < node.x + node.width;
          const blocksY = node.y < spineY && spineY < node.y + node.height;
          expect(blocksX && blocksY, `${node.id} 挡住了轴`).toBe(false);
        }
      }
    });

    it("分支内部的连线是纵向的，从父节点外侧边到子节点内侧边", () => {
      for (const edge of layout.edges) {
        if (edge.fromId === tree.id) continue;
        const parent = placed.get(edge.fromId)!;
        const child = placed.get(edge.toId)!;
        const { fromX, fromY, toX, toY } = endpoints(edge.d);

        expect(fromX).toBeCloseTo(parent.x + parent.width / 2);
        expect(fromY).toBeCloseTo(parent.side === "bottom" ? parent.y + parent.height : parent.y);
        expect(toX).toBeCloseTo(child.x + child.width / 2);
        expect(toY).toBeCloseTo(child.side === "bottom" ? child.y : child.y + child.height);
      }
    });

    it("轴上的每一段共线、共色", () => {
      // They overlap: five branch colours would blend into a smear near the root
      // and fade to one colour at the far end.
      const rootEdges = layout.edges.filter((edge) => edge.fromId === tree.id);
      expect(rootEdges.length).toBeGreaterThan(1);

      for (const edge of rootEdges) {
        expect(edge.colorIndex).toBe(0);
        expect(pathNumbers(edge.d)[1]).toBeCloseTo(spineY, 6);
      }
    });

    it("坐标从原点开始，包围盒装得下所有节点", () => {
      expect(Math.min(...layout.nodes.map((node) => node.x))).toBe(ORIGIN);
      expect(Math.min(...layout.nodes.map((node) => node.y))).toBe(ORIGIN);

      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
        expect(node.y).toBeGreaterThanOrEqual(layout.bounds.minY);
        expect(node.x + node.width).toBeLessThanOrEqual(layout.bounds.maxX);
        expect(node.y + node.height).toBeLessThanOrEqual(layout.bounds.maxY);
      }
    });

    it("有子节点的节点把子节点标在自己那一侧", () => {
      for (const node of layout.nodes) {
        if (!node.hasChildren || node.level === 0) continue;
        expect(node.side === "top" || node.side === "bottom").toBe(true);
      }
    });

    it("折叠的分支不出现，也没有连线通向它", () => {
      const folded = layoutMindmap(tree, new Set([tree.children[0].id]), "timeline");
      const hidden = treeIds(tree.children[0]).filter((id) => id !== tree.children[0].id);

      for (const id of hidden) {
        expect(folded.nodes.some((node) => node.id === id)).toBe(false);
        expect(folded.edges.some((edge) => edge.toId === id)).toBe(false);
      }
      expect(folded.nodes.some((node) => node.id === tree.children[0].id)).toBe(true);
    });

    it("分支的颜色索引与默认布局一致", () => {
      const logic = byId(layoutMindmap(tree, new Set(), "logic"));

      for (const node of layout.nodes) {
        expect(node.colorIndex).toBe(logic.get(node.id)?.colorIndex);
      }
    });

    it("只有一个节点时只剩根，且没有连线", () => {
      const lone: MindmapNode = { id: "root-mindmap-node", text: "独苗", level: 0, children: [] };
      const single = layoutMindmap(lone, new Set(), "timeline");

      expect(single.nodes.length).toBe(1);
      expect(single.edges.length).toBe(0);
      expect(single.nodes[0].x).toBe(ORIGIN);
    });

    it("切换布局不改动树", () => {
      const fresh = parseMarkdownToMindmapTree(BRANCHED, "测试");
      const before = JSON.stringify(fresh);

      layoutMindmap(fresh, new Set(), "timeline");

      expect(JSON.stringify(fresh)).toBe(before);
    });
  });

  describe("布局的按文档记忆", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it("按文档存取布局", () => {
      saveMindmapLayout("/vault/a.md", "bidirectional");

      expect(loadMindmapLayout("/vault/a.md")).toBe("bidirectional");
    });

    it("没有记录时返回 null 而不是默认布局的 id", () => {
      // Null means "this document has not chosen", which is not the same as
      // "this document chose the default" — the same distinction the theme
      // storage makes, and for the same reason.
      expect(loadMindmapLayout("/vault/从未打开.md")).toBeNull();
    });

    it("选回默认布局时不留下记录", () => {
      saveMindmapLayout("/vault/a.md", "bidirectional");
      saveMindmapLayout("/vault/a.md", "logic");

      expect(loadMindmapLayout("/vault/a.md")).toBeNull();
      expect(localStorage.getItem("bookmd.mindmap.layout.v1")).not.toContain("/vault/a.md");
    });

    it("不同文档各有各的布局", () => {
      saveMindmapLayout("/vault/one.md", "bidirectional");
      saveMindmapLayout("/vault/two.md", "logic");

      expect(loadMindmapLayout("/vault/one.md")).toBe("bidirectional");
      expect(loadMindmapLayout("/vault/two.md")).toBeNull();
    });

    it("与折叠状态、主题互不干扰", () => {
      saveMindmapLayout("/vault/a.md", "bidirectional");
      localStorage.setItem("bookmd.mindmap.collapsed.v1", JSON.stringify({ "/vault/a.md": ["x"] }));
      localStorage.setItem("bookmd.mindmap.theme.v1", JSON.stringify({ "/vault/a.md": "dark" }));

      expect(loadMindmapLayout("/vault/a.md")).toBe("bidirectional");
      expect(localStorage.getItem("bookmd.mindmap.collapsed.v1")).toContain("x");
      expect(localStorage.getItem("bookmd.mindmap.theme.v1")).toContain("dark");
    });

    it("存储内容损坏时返回 null", () => {
      localStorage.setItem("bookmd.mindmap.layout.v1", "{ 不是 JSON");

      expect(loadMindmapLayout("/vault/a.md")).toBeNull();
    });

    it("存储不认识的值原样返回，由布局模块决定怎么处理", () => {
      // Storage stays ignorant of which layouts exist; deciding that an id is
      // unknown belongs to resolveLayoutId, which has the table.
      saveMindmapLayout("/vault/a.md", "已删除的布局");

      expect(loadMindmapLayout("/vault/a.md")).toBe("已删除的布局");
      expect(resolveLayoutId(loadMindmapLayout("/vault/a.md"))).toBe(DEFAULT_LAYOUT_ID);
    });
  });
});

/** The root's own layout node, needed often enough to be worth naming. */
function rootOf(tree: MindmapNode, layout: MindmapLayoutResult) {
  return layout.nodes.find((node) => node.id === tree.id)!;
}

function treeIds(node: MindmapNode): string[] {
  return [node.id, ...node.children.flatMap(treeIds)];
}

function walk(node: MindmapNode, visit: (node: MindmapNode) => void): void {
  visit(node);
  node.children.forEach((child) => walk(child, visit));
}

function subtreeNodes(tree: MindmapNode, id: string): string[] {
  const found = findById(tree, id);
  return found ? treeIds(found) : [];
}

function findById(node: MindmapNode, id: string): MindmapNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}
