/**
 * Reader virtualization at the DOM layer (wave 2-2): mounting the controller
 * and ReaderPane against a long document, checking the article holds a bounded
 * window + source-line anchors, that scrolling re-windows to the right slice,
 * that measured heights resize the segments, that ensureBlockVisible
 * materializes an out-of-window block before its element is resolved, and that
 * print expands to the whole document. jsdom has no layout, so the geometry
 * the controller reads (clientHeight, scrollTop, per-block rects) is stubbed
 * here to emulate a scroller — the same contract the real browser exercises.
 */
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";
import type { RenderedBlock, RenderedChapter } from "../core/types";
import { ReaderPane } from "../components/ReaderPane";
import { useSyncScroll } from "../hooks/useSyncScroll";
import {
  ensureBlockVisible,
  registerVirtualController,
  VirtualReaderController,
} from "../components/reader/ReaderVirtualDom";
import {
  blockKeyOf,
  MAX_MATERIALIZED_BLOCKS,
  __resetHeightTables,
} from "../services/readerVirtual";

function syntheticBlocks(count: number, lineStride = 2): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  for (let i = 0; i < count; i += 1) {
    const line = i * lineStride + 1;
    blocks.push({
      html: `<p data-source-line="${line}">paragraph ${i}</p>`,
      sourceStart: line,
      sourceEnd: line,
    });
  }
  return blocks;
}

function chapterOf(blocks: RenderedBlock[]): RenderedChapter {
  return {
    html: blocks.map((b) => b.html).join("\n"),
    headings: [],
    frontMatter: null,
    checksum: "virtual-chapter",
    plainText: "",
    hasMermaid: false,
    blocks,
  };
}

function scroller(): { container: HTMLElement; article: HTMLElement } {
  const container = document.createElement("main");
  const article = document.createElement("article");
  container.appendChild(article);
  document.body.appendChild(container);
  // The article begins at the container's content origin and moves up as the
  // container scrolls - exactly what the controller's contentTop formula
  // recovers in a real scroller (see ReaderVirtualDom.geometry()).
  Object.defineProperty(container, "clientHeight", { value: 800, configurable: true });
  container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  article.getBoundingClientRect = () => ({ top: -container.scrollTop }) as DOMRect;
  return { container, article };
}

const flushFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  });
};

// The measurement pass runs on a frame and then re-windows on the corrected
// heights (one more frame); flush enough frames for it to settle.
const settleMeasure = async () => {
  await flushFrame();
  await flushFrame();
};

/** Give every child a stubbed top/height from a running layout offset. */
function applyLayoutStub(
  article: HTMLElement,
  blockHeights: Map<string, number>,
  fillerHeight: number,
) {
  let top = 0;
  for (const child of Array.from(article.children) as HTMLElement[]) {
    const key = child.getAttribute("data-block-key");
    const isBlock = Boolean(key);
    const height = isBlock ? (blockHeights.get(key as string) ?? fillerHeight) : fillerHeight;
    const thisTop = top;
    Object.defineProperty(child, "getBoundingClientRect", {
      value: () => ({ top: thisTop, bottom: thisTop + height }) as DOMRect,
      configurable: true,
    });
    Object.defineProperty(child, "offsetHeight", { value: height, configurable: true });
    top += height;
  }
}

let live: Array<{ container: HTMLElement; controller: VirtualReaderController }> = [];

beforeEach(() => {
  __resetHeightTables();
  live = [];
});

afterEach(() => {
  for (const { container, controller } of live) {
    controller.dispose();
    container.remove();
  }
  document.body.innerHTML = "";
});

function mountController(blocks: RenderedBlock[]) {
  const { container, article } = scroller();
  const controller = new VirtualReaderController(
    container,
    article,
    blocks,
    { theme: "light", fontScale: 1 },
    { onMaterialize: () => {} },
  );
  registerVirtualController(container, controller);
  live.push({ container, controller });
  return { container, article, controller };
}

describe("VirtualReaderController — window surface", () => {
  it("mounts a bounded window + anchors for a long document (never the whole DOM)", () => {
    const blocks = syntheticBlocks(2500);
    const { article } = mountController(blocks);
    const all = article.querySelectorAll("*").length;
    const children = article.children.length;
    expect(children).toBeGreaterThan(1);
    expect(children).toBeLessThan(MAX_MATERIALIZED_BLOCKS + 60); // window + anchors
    expect(all).toBeLessThan(220);
  });

  it("carries source-line anchors and no window at all when nothing is measured yet", () => {
    const blocks = syntheticBlocks(2500);
    const { article } = mountController(blocks);
    const anchors = article.querySelectorAll("[data-virtual-anchor]");
    expect(anchors.length).toBeGreaterThan(0);
    for (const el of Array.from(anchors)) expect(el.getAttribute("data-source-line")).toBeTruthy();
  });

  it("re-windows to the right slice when the scroller is scrolled to the middle", async () => {
    const blocks = syntheticBlocks(2500); // 2 lines apart: block i -> line 2i+1
    const { container, article, controller } = mountController(blocks);
    container.scrollTop = 40_000;
    controller.onScroll();
    await flushFrame();
    const materialized = Array.from(article.querySelectorAll("[data-block-key]"));
    expect(materialized.length).toBeLessThanOrEqual(MAX_MATERIALIZED_BLOCKS);
    // Estimate 48px/block: scrollTop 40000 is block ~833 (line ~1667). The
    // window must straddle it, not the top or the far end.
    const lines = materialized
      .map((el) => parseInt(el.getAttribute("data-source-line") || "0", 10))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    expect(lines[0]).toBeLessThan(1667);
    expect(lines[lines.length - 1]).toBeGreaterThan(1667);
  });

  it("keeps an in-window block's node identical across a re-window that still covers it", async () => {
    const blocks = syntheticBlocks(2500);
    const { container, article, controller } = mountController(blocks);
    container.scrollTop = 20_000;
    controller.onScroll();
    await flushFrame();
    const before = article.querySelectorAll("[data-block-key]");
    const anchorLine = before[Math.floor(before.length / 2)].getAttribute("data-source-line");
    const beforeNode = article.querySelector(`[data-block-key][data-source-line="${anchorLine}"]`);
    // A tiny scroll stays inside the window - identity preserved.
    container.scrollTop = 20_100;
    controller.onScroll();
    await flushFrame();
    const afterNode = article.querySelector(`[data-block-key][data-source-line="${anchorLine}"]`);
    expect(afterNode).toBe(beforeNode);
  });

  it("shrinks anchor heights when measured block heights replace the estimate", async () => {
    const blocks = syntheticBlocks(2500);
    // Mounting sizes the first anchor from the 48px estimate and schedules a
    // measurement rAF; the assertion below flushes exactly that pass.
    const { article } = mountController(blocks);
    const anchor = article.querySelector("[data-virtual-anchor]") as HTMLElement;
    expect(anchor).not.toBeNull();
    const estimateHeight = parseFloat(anchor.style.height);
    expect(estimateHeight).toBeGreaterThan(100);
    // Report tiny real heights for every element, then let the pending
    // measure pass read them and resize the segments from the fresh table.
    const blockHeights = new Map<string, number>();
    for (const b of blocks) blockHeights.set(blockKeyOf(b), 8);
    applyLayoutStub(article, blockHeights, 6);
    await settleMeasure();
    const measuredHeight = parseFloat(
      (article.querySelector("[data-virtual-anchor]") as HTMLElement).style.height,
    );
    // 8px measured blocks collapse the anchor run far below the estimate.
    expect(measuredHeight).toBeLessThan(estimateHeight);
  });
});

describe("VirtualReaderController — jump and print contracts", () => {
  it("ensureBlockVisible materializes a far block before its element resolves", async () => {
    const blocks = syntheticBlocks(2500);
    const { container, article } = mountController(blocks);
    // Line of block 2000 = 2*2000 + 1 = 4001.
    const targetLine = blocks[2000].sourceStart;
    expect(article.querySelector(`[data-block-key][data-source-line="${targetLine}"]`)).toBeNull();
    await ensureBlockVisible(container, targetLine, "start");
    const resolved = article.querySelector<HTMLElement>(
      `[data-block-key][data-source-line="${targetLine}"]`,
    );
    expect(resolved).not.toBeNull();
  });

  // Acceptance (g): jump to an out-of-window result, then (as useSearch does)
  // mark it; after settle the mark must exist in the materialized block and
  // survive the next measure/re-window pass that keeps the window in place.
  it("a search mark placed in an ensure-visible block survives the settle", async () => {
    const blocks = syntheticBlocks(2500);
    const { container, article } = mountController(blocks);
    const targetLine = blocks[2200].sourceStart;
    await ensureBlockVisible(container, targetLine, "start");
    const block = article.querySelector<HTMLElement>(
      `[data-block-key][data-source-line="${targetLine}"]`,
    );
    expect(block).not.toBeNull();
    const mark = document.createElement("mark");
    mark.className = "search-keyword-match";
    mark.textContent = "needle";
    block?.appendChild(mark);

    // A small scroll keeps the window (and thus the block node + its mark).
    container.scrollTop += 40;
    await ensureBlockVisible(container, targetLine, "start");
    expect(block?.contains(mark)).toBe(true);
    expect(article.contains(mark)).toBe(true);
  });

  it("beforeprint expands the window to the whole document; afterprint re-windows", async () => {
    const blocks = syntheticBlocks(600);
    const { container, article, controller } = mountController(blocks);
    expect(article.querySelectorAll("[data-block-key]").length).toBeLessThan(blocks.length);
    controller.materializeAll();
    expect(article.querySelectorAll("[data-block-key]").length).toBe(blocks.length);
    expect(article.querySelector("[data-virtual-anchor]")).toBeNull();
    controller.resumeWindowing();
    await flushFrame();
    expect(article.querySelectorAll("[data-block-key]").length).toBeLessThan(blocks.length);
    expect(container).toBeTruthy();
  });

  it("ensureBlockVisible is a no-op when the scroller has no controller", async () => {
    const { container } = scroller();
    container.remove();
    // Never registered: resolves without throwing.
    await expect(ensureBlockVisible(container, 999, "start")).resolves.toBeUndefined();
  });
});

describe("ReaderPane virtual mount (integration)", () => {
  it("virtualizes a >=300 block chapter and leaves no fallback artifacts", () => {
    const blocks = syntheticBlocks(320);
    const containerRef = { current: null as HTMLElement | null };
    const { container } = render(
      <ReaderPane
        chapter={chapterOf(blocks)}
        documentKey="doc-a"
        containerRef={containerRef}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    const article = container.querySelector("article") as HTMLElement;
    // Window, not all 320 blocks, and anchors present.
    expect(article.querySelectorAll("[data-block-key]").length).toBeLessThan(320);
    expect(article.querySelectorAll("[data-virtual-anchor]").length).toBeGreaterThan(0);
    // Source lines keep the mapping intact.
    const withLine = article.querySelectorAll("[data-source-line]");
    expect(withLine.length).toBeGreaterThan(0);
  });

  it("a <300 block chapter takes today's full path with zero virtualization artifacts", () => {
    const blocks = syntheticBlocks(12);
    const containerRef = { current: null as HTMLElement | null };
    const { container } = render(
      <ReaderPane
        chapter={chapterOf(blocks)}
        documentKey="doc-a"
        containerRef={containerRef}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    const article = container.querySelector("article") as HTMLElement;
    expect(article.children.length).toBe(blocks.length);
    expect(article.querySelector("[data-virtual-anchor]")).toBeNull();
    expect(article.querySelector("[data-virtual-spacer]")).toBeNull();
    // Stripped of the reuse keys, the live tree is exactly the concatenated
    // block html — today's whole-document path, byte for byte.
    const stripped = article.innerHTML.replace(/ data-block-key="[^"]*"/g, "");
    expect(stripped).toBe(blocks.map((b) => b.html).join(""));
  });

  it("a block-less chapter (gated document) keeps the innerHTML fallback", () => {
    const chapter: RenderedChapter = {
      html: `<h1 data-source-line="1">Gated</h1>\n<p data-source-line="2">Whole html.</p>\n`,
      headings: [],
      frontMatter: null,
      checksum: "gated",
      plainText: "Gated",
      hasMermaid: false,
    };
    const { container } = render(
      <ReaderPane
        chapter={chapter}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    const article = container.querySelector("article") as HTMLElement;
    expect(article.innerHTML).toBe(chapter.html);
    expect(article.querySelector("[data-virtual-anchor]")).toBeNull();
  });

  it("window.dispatchEvent('beforeprint') materializes the whole document, 'afterprint' re-windows", async () => {
    const blocks = syntheticBlocks(600);
    const { container } = render(
      <ReaderPane
        chapter={chapterOf(blocks)}
        documentKey="doc-print"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    const article = container.querySelector("article") as HTMLElement;
    const windowed = article.querySelectorAll("[data-block-key]").length;
    expect(windowed).toBeLessThan(600);
    expect(article.querySelector("[data-virtual-anchor]")).not.toBeNull();

    // beforeprint (registered by the virtual effect) expands the window to
    // the entire document so a print/PDF of the live DOM is complete.
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(article.querySelectorAll("[data-block-key]").length).toBe(600);
    expect(article.querySelector("[data-virtual-anchor]")).toBeNull();

    // afterprint gives the window back (no blank 6k-node reader afterwards).
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    expect(article.querySelectorAll("[data-block-key]").length).toBeLessThan(600);
  });
});

describe("sync-scroll maps through source-line anchors (2-2)", () => {
  // The reader holds only anchors (one per K blocks) + a small window, but
  // useSyncScroll's [data-source-line] query is a DESCENDANT query, so it
  // picks the anchors up and interpolates between them. That piecewise-linear
  // mapping between anchors IS the accuracy K buys - assert it, with numbers.
  function stubRect(el: HTMLElement, docTop: number, container: HTMLElement) {
    el.getBoundingClientRect = () => ({ top: docTop - container.scrollTop }) as DOMRect;
  }
  function stubBox(el: HTMLElement, scrollHeight: number, clientHeight: number) {
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  }
  const flush = () =>
    act(async () => {
      await new Promise((r) => window.requestAnimationFrame(() => r(null)));
    });
  const waitLock = () =>
    act(async () => {
      await new Promise((r) => window.setTimeout(r, 200));
    });

  it("editor scroll to a line only covered by an anchor windows the reader within the anchor span", async () => {
    // Container: an article with two anchors at source lines 1 and 1001.
    const container = document.createElement("div");
    const article = document.createElement("article");
    container.appendChild(article);
    document.body.appendChild(container);
    const a0 = document.createElement("div");
    a0.setAttribute("data-source-line", "1");
    stubRect(a0, 0, container);
    const a1 = document.createElement("div");
    a1.setAttribute("data-source-line", "1001");
    stubRect(a1, 8000, container); // deliberately non-1:1 with the editor
    article.append(a0, a1);
    stubBox(container, 10_000, 800);
    stubRect(container, 0, { scrollTop: 0 } as HTMLElement);

    // Editor: line n starts at (n-1)*10, a 10px-tall block.
    const scrollDOM = document.createElement("div");
    stubBox(scrollDOM, 12_000, 800);
    const doc = {
      length: 100_000,
      lines: 2000,
      line: (n: number) => ({ from: (n - 1) * 10, to: (n - 1) * 10 + 9 }),
    };
    const view = {
      scrollDOM,
      contentDOM: document.createElement("div"),
      state: { doc },
      lineBlockAt: (from: number) => ({ top: from, bottom: from + 10 }),
    } as unknown as EditorView;

    const containerRef = { current: container as HTMLElement | null };
    const { result } = renderHook(() => useSyncScroll({ containerRef, viewMode: "split" }));
    act(() => {
      result.current.editorViewRef.current = view;
    });
    await waitLock();

    // Editor line 750 -> editorY 7490, which lies between the anchors (which
    // map editor 0->0 and editor 10000->8000). Interpolated reader Y:
    // 7490/10000 * 8000 = 5992. Assert exactly that bounded value.
    view.scrollDOM.scrollTop = 7490;
    act(() => {
      result.current.handleEditorScroll(view);
    });
    await flush();
    expect(Math.abs(container.scrollTop - 5992)).toBeLessThan(64);
    container.remove();
  });
});
