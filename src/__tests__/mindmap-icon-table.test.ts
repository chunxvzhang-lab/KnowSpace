import { describe, expect, it } from "vitest";
import {
  MINDMAP_ICON_GROUPS,
  MINDMAP_ICONS,
  MINDMAP_NODE_TYPES,
  describeMindmapIcon,
  findMindmapIcon,
} from "../core/mindmapIcons";

/**
 * The icon table itself.
 *
 * It is a lookup table whose ids go into a file, so the properties worth holding
 * are dull ones — an id is unique, an id is never empty, an entry always has
 * something to draw and something to call it. A duplicate id would silently take
 * one icon's place; an empty one would be indistinguishable from "no icon".
 *
 * A name missing from lucide is not checked here and does not need to be: a
 * missing named export fails the type check and the build, which is how the
 * three renamed aliases in this version were found before the table was written.
 */
describe("导图图标表", () => {
  it("每个 id 唯一、非空，且是稳定的短名", () => {
    const ids = MINDMAP_ICONS.map((icon) => icon.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      // Ids are what the companion file holds, so they are lowercase and stable
      // rather than tied to a component name that a refactor could change.
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("每个图标都有名字和可画的东西", () => {
    for (const { id, label, Icon } of MINDMAP_ICONS) {
      expect(label, id).toBeTruthy();
      expect(Icon, id).toBeTruthy();
    }
  });

  it("节点类型是一行八枚，各有名字、画法和一句用途", () => {
    expect(MINDMAP_NODE_TYPES.length).toBe(8);
    // 名字与 id 都是文件的一部分，id 保持短名且不重复。
    expect(new Set(MINDMAP_NODE_TYPES.map((icon) => icon.id)).size).toBe(8);

    for (const { id, label, meaning, Icon } of MINDMAP_NODE_TYPES) {
      expect(label, id).toBeTruthy();
      expect(Icon, id).toBeTruthy();
      // 一句用途不是装饰：两个读者遇到同一个情形要选同一枚，靠的就是它。
      expect(meaning, id).toBeTruthy();
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("选择器给出的就是这一行类型", () => {
    expect(MINDMAP_ICONS).toEqual(MINDMAP_NODE_TYPES);
  });

  it("旧表的图标仍然认得出来，只是不再出现在选择器里", () => {
    // 旧文件里写过这些 id：升级后必须还能画，否则一批标记会静默消失。
    expect(MINDMAP_ICON_GROUPS.length).toBeGreaterThan(0);
    expect(findMindmapIcon("star")?.label).toBe("星标");
    expect(findMindmapIcon("flag")?.label).toBe("旗标");
    // 新的一行同样查得到。
    expect(findMindmapIcon("todo")?.label).toBe("待办");
  });

  it("类型的名字可以单独取出来 —— 搜索按它匹配", () => {
    expect(describeMindmapIcon("todo")).toBe("待办");
    expect(describeMindmapIcon("star")).toBe("星标");
    expect(describeMindmapIcon("")).toBe("");
    expect(describeMindmapIcon(null)).toBe("");
    expect(describeMindmapIcon("未来的图标")).toBe("");
  });

  it("查不到就返回 null，而不是抛", () => {
    // A newer version's file may name an icon this build does not have, and the
    // node simply goes without one until the app catches up.
    expect(findMindmapIcon("星标")).toBeNull();
    expect(findMindmapIcon("")).toBeNull();
    expect(findMindmapIcon(null)).toBeNull();
    expect(findMindmapIcon(undefined)).toBeNull();

    expect(findMindmapIcon("star")?.label).toBe("星标");
  });
});
