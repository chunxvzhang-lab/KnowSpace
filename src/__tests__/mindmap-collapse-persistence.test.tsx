import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import {
  loadMindmapCollapsed,
  saveMindmapCollapsed,
  loadMindmapTheme,
  saveMindmapTheme,
  loadMindmapLayout,
  saveMindmapLayout,
} from "../services/storage";

/** Where a rendered node sits, read back out of its group's transform. */
function nodePoint(target: Element | string): { x: number; y: number } {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  const numbers = (el?.getAttribute("transform") ?? "").match(/-?[\d.]+/g) ?? ["0", "0"];
  return { x: Number(numbers[0]), y: Number(numbers[1]) };
}

/**
 * Folded branches are remembered per document.
 *
 * The reason this is worth persisting by node id at all is that the ids are
 * derived from the document structure rather than generated fresh on each parse
 * — the root is the literal below, list items are `node-<path>-<index>` and
 * headings are `heading-<line>-<text>`. If they were random, a stored set would
 * empty itself on every reload and these tests would pass while the feature did
 * nothing in practice, because the fixtures would still line up.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

const ROOT_ID = "root-mindmap-node";

describe("折叠状态持久化", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("存储层", () => {
    it("按文档键存取折叠的节点 id", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1", "node-2"]);

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual(["node-1", "node-2"]);
    });

    it("没有记录时返回空数组而不是 null", () => {
      // The caller spreads the result straight into a Set, so it has to be an
      // array rather than nothing at all.
      expect(loadMindmapCollapsed("/vault/从未打开.md")).toEqual([]);
    });

    it("全部展开时不留下记录", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1"]);
      saveMindmapCollapsed("/vault/a.md", []);

      // Everything expanded is the default, so an empty entry is dropped —
      // otherwise every document ever opened would leave a key behind.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([]);
      expect(localStorage.getItem("bookmd.mindmap.collapsed.v1")).not.toContain("/vault/a.md");
    });

    it("不同文档互不影响", () => {
      // The whole reason the key is a path and not the title: a vault with a
      // README in every folder would otherwise share one set of folds.
      saveMindmapCollapsed("/vault/one/README.md", ["node-1"]);
      saveMindmapCollapsed("/vault/two/README.md", ["node-2"]);

      expect(loadMindmapCollapsed("/vault/one/README.md")).toEqual(["node-1"]);
      expect(loadMindmapCollapsed("/vault/two/README.md")).toEqual(["node-2"]);
    });

    it("覆盖写入时保留同键的其他文档", () => {
      saveMindmapCollapsed("/vault/a.md", ["node-1"]);
      saveMindmapCollapsed("/vault/b.md", ["node-2"]);
      saveMindmapCollapsed("/vault/a.md", ["node-3"]);

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual(["node-3"]);
      expect(loadMindmapCollapsed("/vault/b.md")).toEqual(["node-2"]);
    });

    it("存储内容损坏时返回空数组", () => {
      localStorage.setItem("bookmd.mindmap.collapsed.v1", "{ 不是 JSON");

      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([]);
    });
  });

  describe("主题的按文档记忆", () => {
    it("按文档存取主题", () => {
      saveMindmapTheme("/vault/a.md", "dark");

      expect(loadMindmapTheme("/vault/a.md")).toBe("dark");
    });

    it("没有记录时返回 null 而不是默认主题的 id", () => {
      // Null means "this document has not chosen", which is not the same as
      // "this document chose classic". Collapsing the two would make it
      // impossible to tell a deliberate choice from a fallback, and the
      // deliberate one has to survive a round trip unchanged.
      expect(loadMindmapTheme("/vault/从未打开.md")).toBeNull();
    });

    it("选回默认主题时不留下记录", () => {
      saveMindmapTheme("/vault/a.md", "dark");
      saveMindmapTheme("/vault/a.md", "classic");

      expect(loadMindmapTheme("/vault/a.md")).toBeNull();
      expect(localStorage.getItem("bookmd.mindmap.theme.v1")).not.toContain("/vault/a.md");
    });

    it("不同文档各有各的主题", () => {
      // Per document rather than global, because a theme is about how a map
      // reads: a technical map and a client-facing one in the same vault can
      // sensibly differ, and a global setting makes every switch a decision
      // about all of them.
      saveMindmapTheme("/vault/one.md", "dark");
      saveMindmapTheme("/vault/two.md", "corporate");

      expect(loadMindmapTheme("/vault/one.md")).toBe("dark");
      expect(loadMindmapTheme("/vault/two.md")).toBe("corporate");
    });

    it("与折叠状态互不干扰", () => {
      saveMindmapTheme("/vault/a.md", "dark");
      saveMindmapCollapsed("/vault/a.md", ["node-1"]);

      expect(loadMindmapTheme("/vault/a.md")).toBe("dark");
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual(["node-1"]);
    });

    it("存储的不认识的值原样返回，由主题模块决定怎么处理", () => {
      // Storage has no business knowing which themes exist — it is the one
      // place that should stay ignorant of them. Deciding that an id is
      // unknown belongs to resolveThemeId, which has the table.
      saveMindmapTheme("/vault/a.md", "已删除的主题");

      expect(loadMindmapTheme("/vault/a.md")).toBe("已删除的主题");
    });
  });

  describe("组件装载", () => {
    it("打开文档时恢复折叠的分支", () => {
      saveMindmapCollapsed("/vault/a.md", [ROOT_ID]);

      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />);

      // Folding the root hides everything under it, so the children are absent
      // from the rendered output rather than merely styled away.
      expect(screen.queryByText("父节点")).toBeNull();
    });

    it("未折叠的文档照常展开", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/b.md" />);

      expect(screen.getByText("父节点")).toBeTruthy();
    });

    it("切换到另一篇文档时不会套用上一篇的折叠", () => {
      // The guard this pins is a real failure mode, not a hypothetical: the
      // save effect runs once with the previous document's set still in state,
      // so without it the first document's folds would be written under the
      // second document's key before the restore landed.
      saveMindmapCollapsed("/vault/a.md", [ROOT_ID]);

      const { rerender } = render(
        <MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />
      );
      expect(screen.queryByText("父节点")).toBeNull();

      rerender(<MindmapView title="测试" source={SOURCE} documentKey="/vault/b.md" />);

      expect(screen.getByText("父节点")).toBeTruthy();
      // ...and the folds of the other document are left exactly as they were.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([ROOT_ID]);
      expect(loadMindmapCollapsed("/vault/b.md")).toEqual([]);
    });

    it("没有文档键时正常渲染且不写存储", () => {
      // A preview with no file behind it has nowhere to file the folds, and
      // that has to be survivable rather than a crash or a stray key.
      render(<MindmapView title="测试" source={SOURCE} />);

      expect(screen.getByText("父节点")).toBeTruthy();
      expect(localStorage.getItem("bookmd.mindmap.collapsed.v1")).toBeNull();
    });

    it("丢弃树中已不存在的节点 id", () => {
      // The document may have been edited since the folds were saved. A stale
      // id would sit in storage forever without ever being read back.
      saveMindmapCollapsed("/vault/a.md", ["node-早已不存在", ROOT_ID]);

      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />);

      // The surviving id still applies...
      expect(screen.queryByText("父节点")).toBeNull();
      // ...and the dead one is not carried forward.
      expect(loadMindmapCollapsed("/vault/a.md")).toEqual([ROOT_ID]);
    });
  });

  /**
   * The layout picker, end to end.
   *
   * The storage rules themselves are covered in `mindmap-layouts.test.ts`. What
   * can only be checked here is the wiring: a stored value reaching the canvas,
   * and a choice made in the toolbar being filed under the right document.
   *
   * The second half reads the rendered coordinates rather than any state,
   * because "the layout changed" and "the nodes moved" are different claims.
   */
  describe("布局的按文档记忆（组件）", () => {
    const picker = () => screen.getByLabelText("导图布局") as HTMLSelectElement;
    const nodePoints = () =>
      Array.from(document.querySelectorAll(".mindmap-node-interactive")).map((el) => nodePoint(el));
    const leftmostX = () => Math.min(...nodePoints().map((point) => point.x));

    it("打开文档时用这份文档记住的布局", () => {
      saveMindmapLayout("/vault/a.md", "bidirectional");

      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/a.md" />);

      expect(picker().value).toBe("bidirectional");
    });

    it("没有记录时停在默认布局", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/b.md" />);

      expect(picker().value).toBe("logic");
    });

    it("切换后写回这篇文档，并真的把分支排到另一侧", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/c.md" />);

      // The default layout grows everything to the right of the root, so the
      // leftmost node on the canvas is the root itself.
      expect(leftmostX()).toBe(nodePoint(".mindmap-node-interactive.is-root").x);

      fireEvent.change(picker(), { target: { value: "bidirectional" } });

      // ...and the bidirectional layout puts at least one branch on the left.
      expect(leftmostX()).toBeLessThan(nodePoint(".mindmap-node-interactive.is-root").x);
      expect(loadMindmapLayout("/vault/c.md")).toBe("bidirectional");
    });

    it("选时间轴后分支分居根的上下两侧", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/e.md" />);

      fireEvent.change(picker(), { target: { value: "timeline" } });

      const root = nodePoint(".mindmap-node-interactive.is-root");
      const nodes = nodePoints();

      expect(nodes.some((node) => node.y < root.y)).toBe(true);
      expect(nodes.some((node) => node.y > root.y)).toBe(true);
      expect(loadMindmapLayout("/vault/e.md")).toBe("timeline");
    });

    it("选径向后节点围到根的四周", () => {
      render(<MindmapView title="测试" source={SOURCE} documentKey="/vault/d.md" />);

      fireEvent.change(picker(), { target: { value: "radial" } });

      const root = nodePoint(".mindmap-node-interactive.is-root");
      const nodes = nodePoints();

      // Every other layout keeps the whole map on one side of the root along at
      // least one axis; a radial map has nodes in all four directions.
      expect(nodes.some((node) => node.x < root.x)).toBe(true);
      expect(nodes.some((node) => node.x > root.x)).toBe(true);
      expect(nodes.some((node) => node.y < root.y)).toBe(true);
      expect(nodes.some((node) => node.y > root.y)).toBe(true);
      expect(loadMindmapLayout("/vault/d.md")).toBe("radial");
    });

    it("没有文档键时正常渲染且不写存储", () => {
      // A preview with no file behind it cannot be remembered, and inventing a
      // key would make every such preview share one.
      render(<MindmapView title="测试" source={SOURCE} />);

      expect(picker().value).toBe("logic");

      fireEvent.change(picker(), { target: { value: "bidirectional" } });

      expect(localStorage.getItem("bookmd.mindmap.layout.v1")).toBeNull();
    });
  });

  /**
   * Where the collapse toggle ends up, read off the rendered canvas.
   *
   * The layouts answer "which edge are the children on" in three different ways:
   * a named side, an offset for the case where no single edge answers it, and the
   * default. The layouts' own tests check the answer; these check that the
   * renderer does something sensible with it, which is a different claim and the
   * one a reader actually sees.
   */
  describe("折叠按钮的落点（组件）", () => {
    const picker = () => screen.getByLabelText("导图布局") as HTMLSelectElement;

    /** The toggle for a node, in that node's own coordinates, plus its box. */
    function toggleOf(label: string) {
      const group = screen.getByText(label).closest(".mindmap-node-interactive");
      expect(group, `${label} 找不到节点`).not.toBeNull();
      const button = group!.querySelector(".mindmap-collapse-btn");
      expect(button, `${label} 没有折叠按钮`).not.toBeNull();

      const rect = group!.querySelector("rect.mindmap-node-rect")!;
      const numbers = (button!.getAttribute("transform") ?? "").match(/-?[\d.]+/g) ?? ["0", "0"];
      return {
        x: Number(numbers[0]),
        y: Number(numbers[1]),
        width: Number(rect.getAttribute("width")),
        height: Number(rect.getAttribute("height")),
      };
    }

    it("默认布局挂在右边缘，其余布局各按自己的方向", () => {
      render(<MindmapView title="测试" source={SOURCE} />);

      // The default layout grows to the right, so the toggle sits past the right
      // edge at the vertical middle — which is where it has always been.
      const rooted = toggleOf("父节点");
      expect(rooted.x).toBeCloseTo(rooted.width + 1);
      expect(rooted.y).toBeCloseTo(rooted.height / 2);

      fireEvent.change(picker(), { target: { value: "timeline" } });

      // The first branch hangs above the axis, so its toggle goes on top of it.
      const above = toggleOf("父节点");
      expect(above.y).toBeCloseTo(-1);
      expect(above.x).toBeCloseTo(above.width / 2);

      fireEvent.change(picker(), { target: { value: "radial" } });

      // Radial children are spread around the node, so the toggle is placed by
      // offset on the outward edge rather than on a named one.
      const outward = toggleOf("父节点");
      expect(outward.x).toBeGreaterThan(outward.width / 2);
      expect(outward.x).toBeLessThanOrEqual(outward.width + 3);
    });
  });
});
