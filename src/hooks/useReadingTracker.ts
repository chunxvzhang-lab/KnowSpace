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

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const max = container.scrollHeight - container.clientHeight;
        scrollRatioRef.current = max > 0 ? container.scrollTop / max : 0;
        if (!navLockUntilRef?.current || Date.now() >= navLockUntilRef.current) {
          updateActiveHeading(container, headings, activeHeadingRef, onActiveHeadingChange);
        }
        if (onScrollIdle) {
          window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(onScrollIdle, 900);
        }
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(idleTimer);
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
      updateActiveHeading(container, headings, activeHeadingRef, onActiveHeadingChange);
    }
  }, [activeHeadingRef, containerRef, headings, navLockUntilRef, onActiveHeadingChange]);
}

function updateActiveHeading(
  container: HTMLElement,
  headings: Heading[],
  activeHeadingRef: React.MutableRefObject<string | undefined>,
  onActiveHeadingChange: (headingId: string | undefined) => void,
): void {
  if (headings.length === 0) {
    if (activeHeadingRef.current !== undefined) {
      activeHeadingRef.current = undefined;
      onActiveHeadingChange(undefined);
    }
    return;
  }

  // If scrolled to the bottom of the container, highlight the final heading
  const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 20;
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
