import { useEffect, useState, type RefObject } from "react";

type ReaderLineNumbersProps = {
  articleRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  revision?: string;
  fontScale: number;
};

type RowSegment = { first: number; count: number; center: number; step: number };
type TextRow = { node: Node; index: number; number: number };

function readingRows(
  article: HTMLElement,
  top: number,
  bottom: number,
  lineHeight: number,
  previous: TextRow[],
) {
  const rects: { rect: DOMRect; node: Node; index: number }[] = [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (
      !node.textContent?.trim() ||
      node.parentElement?.closest(
        '.code-header-bar, [aria-hidden="true"], svg, math, script, style',
      )
    )
      continue;
    range.selectNodeContents(node);
    for (const [index, rect] of [...range.getClientRects()].entries()) {
      if (rect.width > 0 && rect.height > 0) rects.push({ rect, node, index });
    }
  }
  rects.sort((a, b) => a.rect.top - b.rect.top);
  const lines: {
    top: number;
    bottom: number;
    center: number;
    height: number;
    node: Node;
    index: number;
  }[] = [];
  for (const { rect, node, index } of rects) {
    const previous = lines.at(-1);
    if (previous && rect.top < previous.bottom - 1) {
      previous.bottom = Math.max(previous.bottom, rect.bottom);
      if (rect.height > previous.height) {
        previous.center = rect.top + rect.height / 2;
        previous.height = rect.height;
      }
    } else {
      lines.push({
        top: rect.top,
        bottom: rect.bottom,
        center: rect.top + rect.height / 2,
        height: rect.height,
        node,
        index,
      });
    }
  }
  const segments: RowSegment[] = [];
  let first = 1;
  const blank = (start: number, end: number) => {
    if (end - start < lineHeight / 2) return;
    const count = Math.max(1, Math.floor((end - start) / lineHeight));
    const step = (end - start) / count;
    segments.push({ first, count, center: start + step / 2, step });
    first += count;
  };
  let cursor = top;
  const textRows: TextRow[] = [];
  for (const line of lines) {
    blank(cursor, line.top);
    textRows.push({ node: line.node, index: line.index, number: first });
    segments.push({ first: first++, count: 1, center: line.center, step: 0 });
    cursor = line.bottom;
  }
  blank(cursor, bottom);
  if (!segments.length)
    segments.push({ first: 1, count: 1, center: top + lineHeight / 2, step: 0 });
  // Moving a virtual window must retain the numbers of overlapping text rows.
  if (article.firstElementChild?.hasAttribute("data-v-slot")) {
    const shared = textRows.find((row) =>
      previous.some((old) => old.node === row.node && old.index === row.index),
    );
    const old =
      shared && previous.find((row) => row.node === shared.node && row.index === shared.index);
    if (shared && old) {
      const delta = old.number - shared.number;
      for (const segment of segments) segment.first += delta;
      for (const row of textRows) row.number += delta;
    }
  }
  return { segments, textRows };
}

export function ReaderLineNumbers({
  articleRef,
  containerRef,
  revision,
  fontScale,
}: ReaderLineNumbersProps) {
  const [layout, setLayout] = useState({
    rows: [] as { number: number; center: number }[],
    left: 0,
    lineHeight: 0,
  });

  useEffect(() => {
    const article = articleRef.current;
    const container = containerRef.current;
    if (!article || !container) return;
    let frame = 0;
    let textRows: TextRow[] = [];
    let width = 0;
    let measured: {
      segments: RowSegment[];
      left: number;
      lineHeight: number;
      offset: number;
    } | null = null;
    const measure = () => {
      frame = 0;
      if (!container.clientHeight) return;
      if (!measured) {
        const style = window.getComputedStyle(article);
        const lineHeight = parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
        const articleRect = article.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const top = articleRect.top + (parseFloat(style.borderTopWidth) || 0);
        if (width !== article.clientWidth) textRows = [];
        width = article.clientWidth;
        const result = readingRows(
          article,
          top + (parseFloat(style.paddingTop) || 0),
          top + article.clientHeight - (parseFloat(style.paddingBottom) || 0),
          lineHeight,
          textRows,
        );
        textRows = result.textRows;
        measured = {
          segments: result.segments,
          left: articleRect.left - containerRect.left,
          lineHeight,
          offset: container.scrollTop - containerRect.top,
        };
      }
      const { segments, left, lineHeight, offset } = measured;
      const rows: { number: number; center: number }[] = [];
      const start = container.scrollTop - offset - lineHeight;
      const end = start + container.clientHeight + 2 * lineHeight;
      // Blank virtual spacers remain compressed; only paint rows near the viewport.
      for (const segment of segments) {
        const first = segment.step
          ? Math.max(0, Math.ceil((start - segment.center) / segment.step))
          : 0;
        const last = segment.step
          ? Math.min(segment.count - 1, Math.floor((end - segment.center) / segment.step))
          : 0;
        for (let index = first; index <= last; index++) {
          const center = segment.center + index * segment.step;
          if (center >= start && center <= end)
            rows.push({ number: segment.first + index, center: center + offset });
        }
      }
      setLayout((previous) =>
        previous.left === left &&
        previous.lineHeight === lineHeight &&
        previous.rows.length === rows.length &&
        previous.rows.every(
          (row, index) => row.number === rows[index].number && row.center === rows[index].center,
        )
          ? previous
          : { rows, left, lineHeight },
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const invalidate = () => {
      measured = null;
      schedule();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
    observer?.observe(article);
    observer?.observe(container);
    const mutations = new MutationObserver(invalidate);
    mutations.observe(article, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    const shell = container.closest(".app-shell");
    if (shell) mutations.observe(shell, { attributes: true, attributeFilter: ["class", "style"] });
    container.addEventListener("scroll", schedule, { passive: true });
    article.addEventListener("animationend", invalidate);
    window.addEventListener("resize", invalidate);
    document.fonts?.addEventListener("loadingdone", invalidate);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", schedule);
      article.removeEventListener("animationend", invalidate);
      window.removeEventListener("resize", invalidate);
      document.fonts?.removeEventListener("loadingdone", invalidate);
    };
  }, [articleRef, containerRef, revision, fontScale]);

  return (
    <div className="reader-line-numbers" aria-hidden="true" style={{ left: layout.left }}>
      {layout.rows.map((row) => (
        <span
          key={row.number}
          style={{
            top: row.center - layout.lineHeight / 2,
            height: layout.lineHeight,
          }}
        >
          {row.number}
        </span>
      ))}
    </div>
  );
}
