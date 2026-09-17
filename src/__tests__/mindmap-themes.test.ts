import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME_ID,
  MINDMAP_THEMES,
  MINDMAP_THEME_LIST,
  branchColorFor,
  resolveNodeAppearance,
  resolveThemeId,
  type MindmapThemeId,
} from "../core/mindmapThemes";

/**
 * A theme supplies defaults; a node's own styles win.
 *
 * That single rule is what makes switching themes safe, so most of this file is
 * about it. The alternative design — writing the theme into every node — cannot
 * be undone, because the first switch overwrites whatever the reader set by
 * hand and switching back cannot tell a written style from an original one.
 */
describe("思维导图主题", () => {
  describe("主题表", () => {
    it("提供 4 到 6 套主题", () => {
      // The plan asks for four to six; a single theme would not be a system and
      // a dozen would be a palette nobody browses.
      expect(MINDMAP_THEME_LIST.length).toBeGreaterThanOrEqual(4);
      expect(MINDMAP_THEME_LIST.length).toBeLessThanOrEqual(6);
    });

    it("每套主题的 id 与自身的键一致", () => {
      for (const [key, theme] of Object.entries(MINDMAP_THEMES)) {
        expect(theme.id).toBe(key);
      }
    });

    it("每套主题都有标签、说明和非空的分支色", () => {
      for (const theme of MINDMAP_THEME_LIST) {
        expect(theme.label.length).toBeGreaterThan(0);
        expect(theme.description.length).toBeGreaterThan(0);
        expect(theme.branchColors.length).toBeGreaterThan(0);
      }
    });

    it("默认主题存在", () => {
      expect(MINDMAP_THEMES[DEFAULT_THEME_ID]).toBeDefined();
    });
  });

  describe("resolveThemeId", () => {
    it("接受一个存在的主题 id", () => {
      expect(resolveThemeId("dark")).toBe("dark");
    });

    it("对未知、缺失或非字符串的值回退到默认", () => {
      // Read back from storage or from a document, so it can be an id from an
      // older version, a typo, or nothing at all.
      expect(resolveThemeId("已删除的主题")).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId(7)).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId({ id: "dark" })).toBe(DEFAULT_THEME_ID);
    });

    it("不会把原型链上的键当成主题", () => {
      // This test failed the first time it ran, against `value in
      // MINDMAP_THEMES` — which is true for both of these because they are
      // inherited from Object.prototype. A document carrying one would have been
      // handed a function where a theme belongs, and failed later on a read of
      // `theme.node` with nothing nearby to explain it.
      expect(resolveThemeId("toString")).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId("constructor")).toBe(DEFAULT_THEME_ID);
      expect(resolveThemeId("hasOwnProperty")).toBe(DEFAULT_THEME_ID);
    });
  });

  describe("resolveNodeAppearance", () => {
    const theme = MINDMAP_THEMES.classic;

    it("无显式样式的节点取主题的值", () => {
      const appearance = resolveNodeAppearance({}, theme, false);

      expect(appearance.fill).toBe(theme.node.fill);
      expect(appearance.textColor).toBe(theme.node.textColor);
      expect(appearance.shape).toBe(theme.node.shape);
      expect(appearance.fontSize).toBe(theme.node.fontSize);
    });

    it("节点显式设置的颜色优先于主题", () => {
      // The invariant the whole design rests on: switching theme must not
      // repaint a node somebody deliberately coloured.
      const appearance = resolveNodeAppearance({ color: "#ff0000" }, theme, false);

      expect(appearance.fill).toBe("#ff0000");
      // ...while the fields it did not set still come from the theme.
      expect(appearance.shape).toBe(theme.node.shape);
    });

    it("节点显式设置的形状、字号与字重同样优先", () => {
      const appearance = resolveNodeAppearance(
        { shape: "capsule", fontSize: 22, fontWeight: "bold" },
        theme,
        false
      );

      expect(appearance.shape).toBe("capsule");
      expect(appearance.fontSize).toBe(22);
      expect(appearance.fontWeight).toBe("bold");
    });

    it("transparent 是有效颜色，不会被当成未设置", () => {
      // A node can genuinely be transparent, and it is not the same as having
      // no colour: one hides the fill, the other accepts the theme's.
      const appearance = resolveNodeAppearance({ color: "transparent" }, theme, false);

      expect(appearance.fill).toBe("transparent");
    });

    it("空字符串按未设置处理", () => {
      // Elsewhere in this codebase `color: ""` means "no colour of my own",
      // which is the opposite of `transparent`.
      const appearance = resolveNodeAppearance({ color: "" }, theme, false);

      expect(appearance.fill).toBe(theme.node.fill);
    });

    it("根节点取主题为根节点准备的值", () => {
      const appearance = resolveNodeAppearance({}, theme, true);

      expect(appearance.fill).toBe(theme.root.fill);
      expect(appearance.fontWeight).toBe("bold");
    });

    it("根节点自身设置的样式仍然优先", () => {
      const appearance = resolveNodeAppearance({ fill: undefined, color: "#00ff00" } as never, theme, true);

      expect(appearance.fill).toBe("#00ff00");
    });

    it("换主题只影响没有显式样式的字段", () => {
      // The end-to-end statement of the rule, across two themes rather than one.
      const pinned = { color: "#123456" };
      const inClassic = resolveNodeAppearance(pinned, MINDMAP_THEMES.classic, false);
      const inDark = resolveNodeAppearance(pinned, MINDMAP_THEMES.dark, false);

      expect(inClassic.fill).toBe("#123456");
      expect(inDark.fill).toBe("#123456");
      // The theme's other defaults did change, which is the point of switching.
      expect(inDark.textColor).not.toBe(inClassic.textColor);
    });
  });

  describe("branchColorFor", () => {
    const theme = MINDMAP_THEMES.classic;

    it("按深度取色", () => {
      expect(branchColorFor(theme, 0)).toBe(theme.branchColors[0]);
      expect(branchColorFor(theme, 1)).toBe(theme.branchColors[1]);
    });

    it("超出色板长度时循环，而不是取到 undefined", () => {
      // A deep map has more levels than any theme has colours.
      const index = theme.branchColors.length + 2;
      expect(branchColorFor(theme, index)).toBe(theme.branchColors[2]);
    });

    it("对负索引也返回颜色", () => {
      // Not expected in practice, but `%` alone gives a negative index and
      // therefore undefined, which would render an invisible branch.
      expect(branchColorFor(theme, -1)).toBe(theme.branchColors[theme.branchColors.length - 1]);
    });

    it("色板为空时退回连线色而不是崩溃", () => {
      const empty = { ...theme, branchColors: [] };
      expect(branchColorFor(empty, 3)).toBe(theme.defaultEdgeColor);
    });

    it("每套主题都能量出颜色", () => {
      for (const id of Object.keys(MINDMAP_THEMES) as MindmapThemeId[]) {
        const color = branchColorFor(MINDMAP_THEMES[id], 5);
        expect(typeof color).toBe("string");
        expect(color.length).toBeGreaterThan(0);
      }
    });
  });
});
