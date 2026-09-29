import { useEffect } from "react";
import type { Heading } from "../core/types";

export function useReadingTracker(input: {
  containerRef: React.RefObject<HTMLElement | null>;
  headings: Heading[];
  activeHeadingRef: React.MutableRefObject<string | undefined>;
  scrollRatioRef: React.MutableRefObject<number>;
  onActiveHeadingChange: (headingId: string | undefined) => void;
  onScrollIdle?: () => void;
  navLockUntilRef?: React.MutableRefObject<number>;
}) {
  const {
    activeHeadingRef,
    containerRef,
    headings,
    onActiveHeadingChange,
    onScrollIdle,
    scrollRatioRef,
    navLockUntilRef,
  } = input;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    let idleTimer = 0;

    /*
     * The scroller's extent (scrollHeight/clientHeight) is read once per rAF
     * tick here, and reading those properties forces a style+layout flush if
     * anything in the frame dirtied layout — in split mode the editor-follow
     * scroll does exactly that every frame. The 2-4 profile caught this read
     * alone costing more than a frame budget of attributed time (up to 5ms/frame
     * on the 100k corpus). Extent changes only when content above the fold is
     * added or the pane resizes — neither happens mid-burst — so it is cached
     * and refreshed on the signals that do mean it: a resize, the idle settle
     * (same 900ms beat that saves the reading position), or scrollTop
     * contradicting the cached range (content grew past the estimate).
     */
    let extent: { scrollHeight: number; clientHeight: number } | null = null;
    const readExtent = () => {
      if (!extent) {
        extent = { scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
      }
      return extent;
    };
    const refreshExtent = () => {
      extent = { scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
      return extent;
    };
    const handleWindowResize = () => {
      extent = null;
    };
    window.addEventListener("resize", handleWindowResize);

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const scrollTop = container.scrollTop;
        let box = readExtent();
        if (scrollTop > box.scrollHeight - box.clientHeight) {
          // Scrolled past the cached range: content grew since the last read.
          box = refreshExtent();
        }
        const max = box.scrollHeight - box.clientHeight;
        scrollRatioRef.current = max > 0 ? Math.min(1, scrollTop / max) : 0;
        if (!navLockUntilRef?.current || Date.now() >= navLockUntilRef.current) {
          updateActiveHeading(container, headings, activeHeadingRef, onActiveHeadingChange, box);
        }
        if (onScrollIdle) {
          window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => {
            extent = null; // the settle re-reads fresh extent on next use
            onScrollIdle();
          }, 900);
        }
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(idleTimer);
      window.removeEventListener("resize", handleWindowResize);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [
    activeHeadingRef,
    containerRef,
    headings,
    navLockUntilRef,
    onActiveHeadingChange,
    onScrollIdle,
    scrollRatioRef,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!navLockUntilRef?.current || Date.now() >= navLockUntilRef.current) {
      // Content-driven refresh (headings changed): read the extent live here -
      // this runs on document/headings change, not on the per-frame path.
      updateActiveHeading(container, headings, activeHeadingRef, onActiveHeadingChange, {
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
    }
  }, [activeHeadingRef, containerRef, headings, navLockUntilRef, onActiveHeadingChange]);
}

function updateActiveHeading(
  container: HTMLElement,
  headings: Heading[],
  activeHeadingRef: React.MutableRefObject<string | undefined>,
  onActiveHeadingChange: (headingId: string | undefined) => void,
  extent: { scrollHeight: number; clientHeight: number },
): void {
  if (headings.length === 0) {
    if (activeHeadingRef.current !== undefined) {
      activeHeadingRef.current = undefined;
      onActiveHeadingChange(undefined);
    }
    return;
  }

  // If scrolled to the bottom of the container, highlight the final heading
  const isAtBottom = extent.scrollHeight - container.scrollTop - extent.clientHeight <= 20;
  if (isAtBottom && headings.length > 0) {
    const lastId = headings[headings.length - 1].id;
    if (activeHeadingRef.current !== lastId) {
      activeHeadingRef.current = lastId;
      onActiveHeadingChange(lastId);
    }
    return;
  }

  const containerTop = container.getBoundingClientRect().top;
  let selectedId = headings[0].id;
  // Under block virtualization (wave 2-2) a heading outside the materialized
  // window is not in the DOM, so `element` is null and it is skipped: the
  // active-heading read lags to the last heading that IS materialized. This is
  // accepted for this wave — reading position is saved by scrollRatio (which
  // the source-line anchors keep accurate), and the TOC highlight refreshes
  // once that heading's own window materializes. It never mis-points to a
  // heading that is not a prefix of the current one.
  for (const heading of headings) {
    const element =
      container.querySelector<HTMLElement>(`[data-heading-id="${CSS.escape(heading.id)}"]`) ||
      container.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`);
    if (!element) continue;
    const offsetTop = element.getBoundingClientRect().top - containerTop;
    if (offsetTop <= 100) selectedId = heading.id;
    else break;
  }

  if (activeHeadingRef.current === selectedId) return;
  activeHeadingRef.current = selectedId;
  onActiveHeadingChange(selectedId);
}
