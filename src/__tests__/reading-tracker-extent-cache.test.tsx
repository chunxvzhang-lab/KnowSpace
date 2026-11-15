/**
 * The reading tracker's cached scroll extent (2-4 hot-path work): scrollHeight
 * and clientHeight are layout-forcing reads, and on the 100k split-mode corpus
 * the per-frame rAF path paid up to 5ms for them (2-4 profile). The cache is
 * therefore intentional staleness - pinned here in both directions:
 *  - after the real extent changes, the CACHED numbers are still used (the
 *    point of the cache),
 *  - a window resize clears it (the invalidation signal),
 *  - scrolling past the cached range refreshes it (content grew).
 * jsdom reports 0 for extent properties, so the container gets instance-level
 * getter stubs - the same technique the virtualization DOM tests use.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { MutableRefObject, RefObject } from "react";
import { useReadingTracker } from "../hooks/useReadingTracker";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function setup() {
  const el = document.createElement("div");
  let scrollHeight = 1000;
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => 100,
  });
  document.body.appendChild(el);

  const scrollRatioRef: MutableRefObject<number> = { current: -1 };
  const activeHeadingRef: MutableRefObject<string | undefined> = { current: undefined };
  const containerRef: RefObject<HTMLElement | null> = { current: el };
  const { unmount } = renderHook(() =>
    useReadingTracker({
      containerRef,
      headings: [],
      activeHeadingRef,
      scrollRatioRef,
      onActiveHeadingChange: () => undefined,
    }),
  );

  const scroll = async (to: number, setScrollHeight?: number) => {
    if (setScrollHeight !== undefined) scrollHeight = setScrollHeight;
    el.scrollTop = to;
    el.dispatchEvent(new Event("scroll"));
    await actFrame();
  };
  return { el, scroll, scrollRatioRef, unmount };
}

async function actFrame(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

describe("useReadingTracker extent cache", () => {
  it("tracks the live editor instead of treating its hidden reader as the document end", async () => {
    const hiddenReader = document.createElement("div");
    const scrollDOM = document.createElement("div");
    Object.defineProperty(scrollDOM, "scrollHeight", { value: 2000 });
    Object.defineProperty(scrollDOM, "clientHeight", { value: 500 });
    const state = EditorState.create({ doc: "# first\n\ntext\n\n## second" });
    const editor = {
      state,
      scrollDOM,
      lineBlockAtHeight: (height: number) => ({ from: height < 900 ? 0 : state.doc.line(5).from }),
    } as unknown as EditorView;
    const activeHeadingRef = { current: undefined as string | undefined };
    const scrollRatioRef = { current: 0 };
    const onActiveHeadingChange = vi.fn();
    const { unmount } = renderHook(() =>
      useReadingTracker({
        containerRef: { current: hiddenReader },
        viewMode: "live",
        editorViewRef: { current: editor },
        headings: [
          { id: "first", text: "first", level: 1, line: 1 },
          { id: "second", text: "second", level: 2, line: 5 },
        ],
        activeHeadingRef,
        scrollRatioRef,
        onActiveHeadingChange,
      }),
    );
    await actFrame();
    expect(activeHeadingRef.current).toBe("first");
    hiddenReader.dispatchEvent(new Event("scroll"));
    scrollDOM.scrollTop = 1000;
    scrollDOM.dispatchEvent(new Event("scroll"));
    await actFrame();
    expect(activeHeadingRef.current).toBe("second");
    expect(scrollRatioRef.current).toBeCloseTo(2 / 3);
    unmount();
  });
  it("uses the live extent on the first read", async () => {
    const { scroll, scrollRatioRef, unmount } = setup();
    await scroll(450);
    // 450 / (1000 - 100) = 0.5
    expect(scrollRatioRef.current).toBeCloseTo(0.5, 4);
    unmount();
  });

  it("reuses the cached extent after the real one changed (stale by design)", async () => {
    const { scroll, scrollRatioRef, unmount } = setup();
    await scroll(450); // primes the cache at scrollHeight 1000
    await scroll(500, 2000); // content doubles; cached max (900) still says
    // there is room (500 <= 900), so the stale numbers are used:
    // 500 / 900 = 0.555..., NOT 500 / 1900 = 0.263...
    expect(scrollRatioRef.current).toBeCloseTo(500 / 900, 4);
    unmount();
  });

  it("refreshes when a scroll passes beyond the cached range", async () => {
    const { scroll, scrollRatioRef, unmount } = setup();
    await scroll(450);
    await scroll(1500, 2000); // 1500 > cached 900: content grew past the range
    expect(scrollRatioRef.current).toBeCloseTo(1500 / 1900, 4);
    unmount();
  });

  it("refreshes after a window resize", async () => {
    const { el, scroll, scrollRatioRef, unmount } = setup();
    await scroll(450);
    await scroll(500, 2000);
    expect(scrollRatioRef.current).toBeCloseTo(500 / 900, 4); // still cached
    el.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    // The resize listener nulls the cache; the NEXT scroll event re-reads.
    await scroll(500);
    expect(scrollRatioRef.current).toBeCloseTo(500 / 1900, 4);
    unmount();
  });
});
