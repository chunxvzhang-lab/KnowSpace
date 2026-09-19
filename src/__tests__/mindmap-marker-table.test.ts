import { describe, expect, it } from "vitest";
import {
  MINDMAP_PRIORITIES,
  MINDMAP_PROGRESS_STEPS,
  PRIORITY_MAX,
  PRIORITY_MIN,
  PROGRESS_MAX,
  PROGRESS_MIN,
  findPriorityMark,
  findProgressMark,
  isPriorityInRange,
  isProgressInRange,
  progressSlicePath,
} from "../core/mindmapMarkers";

/**
 * The marker tables and the dial's geometry.
 *
 * The tables are dull properties again — every value in range, every colour
 * distinct — but the geometry is worth testing rather than eyeballing: a wedge
 * that starts at the wrong o'clock, or lands off the rim, looks like nothing at
 * fourteen pixels and is then shipped.
 */

/** The rim point of the wedge, read back out of the path. */
function rimPoint(value: number, radius: number) {
  const numbers = (progressSlicePath(value, radius, 0, 0).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  return { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
}

/**
 * The two flags of the arc, read out of the path.
 *
 * Taken by name rather than by counting tokens: the path is `A rx ry rot
 * largeArc sweep x y`, and an off-by-one there is a test that passes for the
 * wrong reason.
 */
function arcFlags(value: number, radius: number) {
  const afterArc = progressSlicePath(value, radius, 0, 0).split("A")[1].trim().split(/\s+/);
  return { largeArc: afterArc[3], sweep: afterArc[4] };
}

describe("优先级与进度的取值", () => {
  it("优先级 1–9，颜色两两不同", () => {
    expect(MINDMAP_PRIORITIES.map((mark) => mark.value)).toEqual(
      Array.from({ length: PRIORITY_MAX - PRIORITY_MIN + 1 }, (_, i) => PRIORITY_MIN + i)
    );
    expect(MINDMAP_PRIORITIES.map((mark) => mark.label)).toEqual(
      MINDMAP_PRIORITIES.map((mark) => String(mark.value))
    );
    expect(new Set(MINDMAP_PRIORITIES.map((mark) => mark.color)).size).toBe(MINDMAP_PRIORITIES.length);
  });

  it("进度 1/8 到 8/8，没有 0", () => {
    // 0/8 is a mark that says nothing, which is the same as no mark at all; the
    // picker says that by being empty rather than by drawing an empty dial.
    expect(MINDMAP_PROGRESS_STEPS.map((mark) => mark.value)).toEqual(
      Array.from({ length: PROGRESS_MAX - PROGRESS_MIN + 1 }, (_, i) => PROGRESS_MIN + i)
    );
    expect(MINDMAP_PROGRESS_STEPS[0].label).toBe("1/8");
    expect(MINDMAP_PROGRESS_STEPS.at(-1)?.label).toBe("8/8");
  });

  it("只有范围内的整数才算数", () => {
    expect(isPriorityInRange(1)).toBe(true);
    expect(isPriorityInRange(9)).toBe(true);
    for (const value of [0, 10, 2.5, Number.NaN, "3", null, undefined, {}]) {
      expect(isPriorityInRange(value), String(value)).toBe(false);
    }

    expect(isProgressInRange(1)).toBe(true);
    expect(isProgressInRange(8)).toBe(true);
    for (const value of [0, 9, 1.5, Number.NaN, "5", null]) {
      expect(isProgressInRange(value), String(value)).toBe(false);
    }
  });

  it("查不到就返回 null", () => {
    expect(findPriorityMark(0)).toBeNull();
    expect(findPriorityMark(10)).toBeNull();
    expect(findPriorityMark(null)).toBeNull();
    expect(findPriorityMark(1)?.label).toBe("1");

    expect(findProgressMark(0)).toBeNull();
    expect(findProgressMark(9)).toBeNull();
    expect(findProgressMark(8)?.label).toBe("8/8");
  });
});

describe("进度表盘的几何", () => {
  it("边缘点落在圆上，角度就是这一格", () => {
    const radius = 10;

    for (const step of MINDMAP_PROGRESS_STEPS.filter((mark) => mark.value < PROGRESS_MAX)) {
      const { x, y } = rimPoint(step.value, radius);

      // On the rim...
      expect(Math.hypot(x, y), step.label).toBeCloseTo(radius, 6);

      // ...at the angle the step names, measured from twelve o'clock clockwise,
      // which is where a reader looks first on a dial.
      const fromTop = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
      expect(fromTop / (2 * Math.PI), step.label).toBeCloseTo(step.value / PROGRESS_MAX, 6);
    }
  });

  it("满格画成两段半弧，因为一段回到原点的弧什么也画不出来", () => {
    const full = progressSlicePath(PROGRESS_MAX, 10, 0, 0);

    expect(full.match(/A/g)).toHaveLength(2);
    expect(full.startsWith("M 0 -10")).toBe(true);
  });

  it("超过一半用大弧标志，正好一半不用，且一律顺时针", () => {
    // The flag is what makes the wedge bulge the long way round; getting it wrong
    // draws the complement of what was meant. Sweep must stay 1, or the dial
    // fills anticlockwise — which reads as a different amount at a glance.
    expect(arcFlags(4, 10)).toEqual({ largeArc: "0", sweep: "1" });
    expect(arcFlags(5, 10)).toEqual({ largeArc: "1", sweep: "1" });
    expect(arcFlags(1, 10)).toEqual({ largeArc: "0", sweep: "1" });
  });

  it("起笔在圆心，收笔回到圆心", () => {
    const path = progressSlicePath(3, 8, 4, 4);

    expect(path.startsWith("M 4 4 L 4 -4")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});
