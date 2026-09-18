import { describe, expect, it } from "vitest";
import { MINDMAP_ICON_GROUPS, MINDMAP_ICONS, findMindmapIcon } from "../core/mindmapIcons";

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

  it("分组不为空，且与扁平表一致", () => {
    expect(MINDMAP_ICON_GROUPS.length).toBeGreaterThan(0);
    for (const group of MINDMAP_ICON_GROUPS) {
      expect(group.group).toBeTruthy();
      expect(group.icons.length).toBeGreaterThan(0);
    }

    const flat = MINDMAP_ICON_GROUPS.flatMap((group) => group.icons.map((icon) => icon.id));
    expect(MINDMAP_ICONS.map((icon) => icon.id)).toEqual(flat);
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
