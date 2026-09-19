import { describe, expect, it } from "vitest";
import {
  BOUNDARY_PADDING,
  BOUNDARY_TITLE_BAND,
  SUMMARY_BRACKET_GAP,
  SUMMARY_HOOK,
  boundaryRect,
  boundaryTitleAnchor,
  summaryBracketPath,
  summaryLabelAnchor,
} from "../core/mindmapGroups";
import type { Bounds } from "../core/mindmapBounds";

/**
 * Where a summary's bracket goes.
 *
 * Checked here rather than by looking, because a bracket two pixels off its group
 * looks deliberate — and because "spans the group" and "sits outside it" are the
 * two properties that make it read as being about that group at all.
 */

const GROUP: Bounds = { minX: 100, minY: 40, width: 120, height: 200 };

/** The points of the path, as pairs. */
function points(path: string): { x: number; y: number }[] {
  const numbers = (path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) result.push({ x: numbers[i], y: numbers[i + 1] });
  return result;
}

describe("概要括号", () => {
  it("立在组的右侧，勾朝向组", () => {
    const [topHook, topCorner, bottomCorner, bottomHook] = points(summaryBracketPath(GROUP));
    const bracketX = GROUP.minX + GROUP.width + SUMMARY_BRACKET_GAP;

    // The upright, and the two hooks reaching back towards the group.
    expect(topCorner).toEqual({ x: bracketX, y: GROUP.minY });
    expect(bottomCorner).toEqual({ x: bracketX, y: GROUP.minY + GROUP.height });
    expect(topHook).toEqual({ x: bracketX - SUMMARY_HOOK, y: GROUP.minY });
    expect(bottomHook).toEqual({ x: bracketX - SUMMARY_HOOK, y: GROUP.minY + GROUP.height });
  });

  it("高度就是组的高度", () => {
    const [topHook, , bottomCorner] = points(summaryBracketPath(GROUP));

    expect(bottomCorner.y - topHook.y).toBe(GROUP.height);
  });

  it("标签在括号之外，纵向居中", () => {
    const anchor = summaryLabelAnchor(GROUP);
    const bracketX = GROUP.minX + GROUP.width + SUMMARY_BRACKET_GAP;

    expect(anchor.x).toBeGreaterThan(bracketX);
    expect(anchor.y).toBe(GROUP.minY + GROUP.height / 2);
  });

  it("边界：四面留白，上方还多留出标题带", () => {
    const rect = boundaryRect(GROUP);

    // Air on every side, so the box is around the group rather than on it.
    expect(rect.x).toBe(GROUP.minX - BOUNDARY_PADDING);
    expect(rect.y).toBe(GROUP.minY - BOUNDARY_PADDING - BOUNDARY_TITLE_BAND);
    expect(rect.width).toBe(GROUP.width + BOUNDARY_PADDING * 2);
    expect(rect.height).toBe(GROUP.height + BOUNDARY_PADDING * 2 + BOUNDARY_TITLE_BAND);
  });

  it("边界把组装在里面，且标题带在最上面的主题之上", () => {
    // The property that matters, stated so a change to either constant cannot
    // quietly put the title over the first topic.
    const rect = boundaryRect(GROUP);

    expect(rect.x).toBeLessThan(GROUP.minX);
    expect(rect.y + rect.height).toBeGreaterThan(GROUP.minY + GROUP.height);
    expect(boundaryTitleAnchor(GROUP).y).toBeLessThan(GROUP.minY - BOUNDARY_PADDING + 1);
  });

  it("边界与括号在同一组上互不遮挡", () => {
    // Both may be drawn over one group, and telling them apart should not need
    // reading them: the bracket stands off to the right, past the box's edge.
    const rect = boundaryRect(GROUP);
    const bracketX = GROUP.minX + GROUP.width + SUMMARY_BRACKET_GAP;

    expect(bracketX).toBeGreaterThan(rect.x + rect.width);
  });

  it("组的形状随便变，括号都跟着", () => {
    // The property, rather than one example: whatever the group, the bracket is
    // beside it and exactly as tall.
    const groups: Bounds[] = [
      { minX: 0, minY: 0, width: 10, height: 10 },
      { minX: -500, minY: -300, width: 40, height: 800 },
      { minX: 200, minY: 60, width: 300, height: 24 },
    ];

    for (const group of groups) {
      const path = summaryBracketPath(group);
      const [topHook, topCorner, bottomCorner] = points(path);

      expect(topCorner.x).toBe(group.minX + group.width + SUMMARY_BRACKET_GAP);
      expect(topHook.y).toBe(group.minY);
      expect(bottomCorner.y).toBe(group.minY + group.height);
    }
  });
});
