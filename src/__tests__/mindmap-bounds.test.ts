import { describe, expect, it } from "vitest";
import { boundsOfBoxes, unionBounds } from "../core/mindmapBounds";

/**
 * The frame a view draws around everything.
 *
 * Short arithmetic with one consequence worth stating: a free topic can sit
 * anywhere, the layout's bounds cannot know about it, and a picture that framed
 * the tree alone would crop out the very box that was dragged into open space.
 */
describe("取景边界", () => {
  it("两个矩形取并集", () => {
    const tree = { minX: 40, minY: 40, width: 600, height: 400 };
    const floating = { minX: -200, minY: 100, width: 300, height: 120 };

    expect(unionBounds(tree, floating)).toEqual({
      minX: -200,
      minY: 40,
      width: 840,
      height: 400,
    });
  });

  it("一个装得下另一个时，就是大的那个", () => {
    const big = { minX: 0, minY: 0, width: 100, height: 100 };
    const small = { minX: 10, minY: 10, width: 20, height: 20 };

    expect(unionBounds(big, small)).toEqual(big);
    expect(unionBounds(small, big)).toEqual(big);
  });

  it("一组盒子加内边距，空集合给 null", () => {
    expect(boundsOfBoxes([], 60)).toBeNull();

    expect(
      boundsOfBoxes(
        [
          { x: 100, y: 100, width: 50, height: 30 },
          { x: -20, y: 40, width: 10, height: 10 },
        ],
        60
      )
    ).toEqual({ minX: -80, minY: -20, width: 290, height: 210 });
  });
});
