import { describe, expect, it } from "vitest";
import { canConsumeWheel, wheelBelongsToInnerScroller } from "../services/wheelScrollGuard";

/**
 * Whose wheel it is, pinned.
 *
 * jsdom does no layout, so a scroller has to be described to it by hand. That is
 * the point of testing the guard on its own rather than only through the canvas:
 * the interesting cases are all about edges — a region that is pinned at its
 * bottom must hand the wheel back, or a wheel over a card becomes a dead zone.
 */
function makeScroller(options: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
  overflowY?: string;
}) {
  const el = document.createElement("div");
  el.style.overflowY = options.overflowY ?? "auto";
  Object.defineProperty(el, "scrollHeight", { value: options.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: options.clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    value: options.scrollTop ?? 0,
    writable: true,
    configurable: true,
  });
  return el;
}

describe("canConsumeWheel", () => {
  it("owns the wheel while there is somewhere left to scroll", () => {
    expect(
      canConsumeWheel(makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 50 }), 0, 120)
    ).toBe(true);
  });

  it("hands the wheel back once it is pinned at the bottom", () => {
    expect(
      canConsumeWheel(makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 300 }), 0, 120)
    ).toBe(false);
  });

  it("hands it back at the top as well, when the wheel is going up", () => {
    const atTop = makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    expect(canConsumeWheel(atTop, 0, -120)).toBe(false);

    const partwayUp = makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 40 });
    expect(canConsumeWheel(partwayUp, 0, -120)).toBe(true);
  });

  it("ignores an element with nothing to scroll", () => {
    expect(canConsumeWheel(makeScroller({ scrollHeight: 100, clientHeight: 100 }), 0, 120)).toBe(
      false
    );
  });

  it("ignores an element that does not scroll at all", () => {
    const clipped = makeScroller({
      scrollHeight: 400,
      clientHeight: 100,
      scrollTop: 50,
      overflowY: "hidden",
    });
    expect(canConsumeWheel(clipped, 0, 120)).toBe(false);
  });

  it("does not claim a wheel with no vertical delta", () => {
    expect(
      canConsumeWheel(makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 50 }), 0, 0)
    ).toBe(false);
  });
});

describe("wheelBelongsToInnerScroller", () => {
  it("finds the scroller above the element the wheel landed on", () => {
    const boundary = document.createElement("div");
    const scroller = makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 50 });
    const child = document.createElement("span");
    scroller.appendChild(child);
    boundary.appendChild(scroller);

    expect(wheelBelongsToInnerScroller(child, 0, 120, boundary)).toBe(true);
  });

  it("never claims the canvas root itself", () => {
    const boundary = makeScroller({ scrollHeight: 400, clientHeight: 100, scrollTop: 50 });
    expect(wheelBelongsToInnerScroller(boundary, 0, 120, boundary)).toBe(false);
  });

  it("says no when nothing on the way up can scroll", () => {
    const boundary = document.createElement("div");
    const child = document.createElement("span");
    boundary.appendChild(child);
    expect(wheelBelongsToInnerScroller(child, 0, 120, boundary)).toBe(false);
  });

  it("tolerates a target that is not an element", () => {
    expect(wheelBelongsToInnerScroller(null, 0, 120, document.createElement("div"))).toBe(false);
  });
});
