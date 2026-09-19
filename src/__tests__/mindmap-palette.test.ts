import { describe, expect, it } from "vitest";
import { DEFAULT_MARK_COLOR, MINDMAP_MARK_COLORS, findMarkColor } from "../core/mindmapPalette";

/**
 * The palette a reader marks the map up with.
 *
 * Its own file rather than a corner of the boundary's or the relation's tests,
 * because it belongs to neither: both draw with it, and a rule that only held for
 * one of them would be the bug this arrangement prevents.
 */

describe("手绘标记的调色板", () => {
  it("认识的 id 用它自己的颜色", () => {
    expect(findMarkColor("emerald").color).toBe("#34d399");
    expect(findMarkColor("sky").color).toBe("#38bdf8");
  });

  it("不认识的 id 落回默认，而不是不画", () => {
    // The opposite of the icon table on purpose: an icon is a decoration and
    // omitting it loses nothing, while a box or a line *is* what the reader asked
    // for — it has to be drawn in whatever colour this build can manage. The id
    // itself stays in the file, so a newer build gets the right colour back.
    expect(findMarkColor("未来的颜色")).toBe(DEFAULT_MARK_COLOR);
    expect(findMarkColor(undefined)).toBe(DEFAULT_MARK_COLOR);
    expect(findMarkColor("")).toBe(DEFAULT_MARK_COLOR);
  });

  it("id 互不相同，也有名字", () => {
    // Ids go in the file, so they have to be stable and distinct; the labels are
    // what a reader picks by, so an empty one is a button with nothing on it.
    const ids = MINDMAP_MARK_COLORS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of MINDMAP_MARK_COLORS) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("默认色就是表里的第一个，且在表里", () => {
    expect(MINDMAP_MARK_COLORS).toContain(DEFAULT_MARK_COLOR);
  });
});
