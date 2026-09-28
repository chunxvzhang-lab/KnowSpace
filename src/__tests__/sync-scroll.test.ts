import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { EditorView } from "@codemirror/view";
import { renderMarkdown } from "../services/markdown";
import { useSyncScroll } from "../hooks/useSyncScroll";

describe("Markdown Source Line Mapping", () => {
  it("injects data-source-line attributes into block elements", async () => {
    const md = `# Title Line 1

Paragraph at line 3 with some text.

## Heading 2 at line 5

- List item 1 (line 7)
- List item 2 (line 8)

\`\`\`js
console.log("code block at line 11");
\`\`\`
`;
    const rendered = await renderMarkdown(md);
    expect(rendered.html).toContain('data-source-line="1"');
    expect(rendered.html).toContain('data-source-line="3"');
    expect(rendered.html).toContain('data-source-line="5"');
    expect(rendered.html).toContain('data-source-line="7"');
    expect(rendered.html).toContain('data-source-line="10"');
  });

  it("handles tables and blockquotes with data-source-line", async () => {
    const md = `> Blockquote at line 1
> Blockquote continued

| Col 1 | Col 2 |
| ----- | ----- |
| A     | B     |
`;
    const rendered = await renderMarkdown(md);
    expect(rendered.html).toContain('data-source-line="1"');
    expect(rendered.html).toContain('data-source-line="4"');
  });

  it("handles horizontal rules and task lists", async () => {
    const md = `# First Header

---

- [ ] Task 1
- [x] Task 2
`;
    const rendered = await renderMarkdown(md);
    expect(rendered.html).toContain('data-source-line="1"');
    expect(rendered.html).toContain('data-source-line="3"');
    expect(rendered.html).toContain('data-source-line="5"');
  });
});

/**
 * useSyncScroll keeps its keyframe table cached across scroll events; these
 * cases pin the two halves of that contract: the table is NOT rebuilt while
 * nothing moved (the whole point of the cache, counted through lineBlockAt
 * calls) and it IS rebuilt on every signal that can change geometry. The
 * expected values below are hand-computed from the fixture geometry, so they
 * also prove the cached path maps editorY↔readerY exactly like a fresh build.
 */

function makeRect(top: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 100,
    bottom: top + 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  };
}

/**
 * Element whose client rect follows the container's scrollTop, mirroring how
 * a real scroller moves its children's rects (buildScrollKeyframes adds
 * scrollTop back to recover document coordinates).
 */
function stubRectInScrolledContainer(el: HTMLElement, docTop: number, container: HTMLElement) {
  el.getBoundingClientRect = () => makeRect(docTop - container.scrollTop);
}

function stubBox(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
}

function createSyncScrollFixture() {
  // Reader: 3 mapped blocks at doc y 0 / 200 / 400, viewport 150 of 450
  // -> maxReaderScroll 300. Container rect stays pinned at top 0.
  const container = document.createElement("div");
  for (const [line, docTop] of [
    [1, 0],
    [2, 200],
    [3, 400],
  ] as const) {
    const el = document.createElement("div");
    el.setAttribute("data-source-line", String(line));
    stubRectInScrolledContainer(el, docTop, container);
    container.appendChild(el);
  }
  stubRectInScrolledContainer(container, 0, { scrollTop: 0 } as HTMLElement);
  stubBox(container, 450, 150);

  // Editor: line n starts at (n-1)*10 with a 100px-tall block -> tops
  // 0 / 100 / 200; viewport 100 of 300 -> maxEditorScroll 200.
  const scrollDOM = document.createElement("div");
  stubBox(scrollDOM, 300, 100);
  const doc = {
    length: 300,
    lines: 30,
    line: (n: number) => ({ from: (n - 1) * 10, to: (n - 1) * 10 + 9 }),
  };
  const lineBlockAt = vi.fn((from: number) => ({ top: from * 10, bottom: from * 10 + 100 }));
  const view = {
    scrollDOM,
    contentDOM: document.createElement("div"),
    state: { doc },
    lineBlockAt,
  } as unknown as EditorView;

  // Resulting table: [(0,0), (100,200), (200,400), (201,401)] — editor 50
  // maps to reader 100, editor 150 -> reader 300, reader 300 -> editor 150.
  return { container, view, lineBlockAt };
}

const tick = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  });

// The rAF callback queued by the hook runs before this one (same frame, FIFO).
const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  });

/** Past the 150ms echo lock so the next scroll in either direction applies. */
const waitOutLock = () => tick(200);

describe("useSyncScroll keyframe cache", () => {
  let fixture: ReturnType<typeof createSyncScrollFixture>;

  beforeEach(() => {
    fixture = createSyncScrollFixture();
  });

  async function mount() {
    const containerRef = { current: fixture.container as HTMLElement | null };
    const { result } = renderHook(() => useSyncScroll({ containerRef, viewMode: "split" }));
    act(() => {
      result.current.editorViewRef.current = fixture.view;
    });
    // Entering split mode locks to "reader" for 150ms; wait it out.
    await waitOutLock();
    return { result, containerRef };
  }

  it("reuses the cached table across scroll events (one build, exact mapping)", async () => {
    const { result } = await mount();

    fixture.view.scrollDOM.scrollTop = 50;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    expect(fixture.container.scrollTop).toBe(100);
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);

    await waitOutLock();
    fixture.view.scrollDOM.scrollTop = 150;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    // Editor 150 -> reader 300, still zero extra layout passes: cache hit.
    expect(fixture.container.scrollTop).toBe(300);
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);
  });

  it("coalesces multiple editor scroll events within one frame into one apply", async () => {
    const { result } = await mount();

    fixture.view.scrollDOM.scrollTop = 40;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    expect(fixture.container.scrollTop).toBe(80);
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);

    await waitOutLock();
    const callsBefore = fixture.lineBlockAt.mock.calls.length;
    act(() => {
      fixture.view.scrollDOM.scrollTop = 60;
      result.current.handleEditorScroll(fixture.view);
      // Geometry signal changes mid-frame, so the table MUST be rebuilt at
      // apply time; the OLD code would have rebuilt for BOTH events. The rAF
      // hop must build exactly ONCE, against the LATEST position (90 -> 180,
      // not 60 -> 120).
      (fixture.view.state.doc as { length: number }).length += 1;
      fixture.view.scrollDOM.scrollTop = 90;
      result.current.handleEditorScroll(fixture.view);
      // No layout work happens synchronously in the event handlers anymore.
      expect(fixture.lineBlockAt).toHaveBeenCalledTimes(callsBefore);
    });
    await flushFrame();
    expect(fixture.container.scrollTop).toBe(180);
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(callsBefore + 3);
  });

  it("rebuilds after an editor document change (cheap doc signal)", async () => {
    const { result } = await mount();

    fixture.view.scrollDOM.scrollTop = 50;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);

    await waitOutLock();
    act(() => {
      (fixture.view.state.doc as { length: number }).length += 1;
      fixture.view.scrollDOM.scrollTop = 60;
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(6);
    expect(fixture.container.scrollTop).toBe(120);
  });

  it("rebuilds after the preview DOM mutates (MutationObserver invalidation)", async () => {
    const { result } = await mount();

    fixture.view.scrollDOM.scrollTop = 50;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);

    // Simulate a preview re-render / lazily injected block.
    const extra = document.createElement("div");
    extra.setAttribute("data-source-line", "2");
    stubRectInScrolledContainer(extra, 250, fixture.container);
    act(() => {
      fixture.container.appendChild(extra);
    });
    // MutationObserver callbacks are microtasks; the lock wait also flushes
    // them before the next scroll.
    await waitOutLock();

    fixture.view.scrollDOM.scrollTop = 60;
    act(() => {
      result.current.handleEditorScroll(fixture.view);
    });
    await flushFrame();
    // Four mapped elements now pass through the builder -> one full rebuild.
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(7);
  });

  it("syncs reader -> editor from the cached table", async () => {
    await mount();

    act(() => {
      fixture.container.scrollTop = 300;
    });
    // A cached build would have measured at the CURRENT scroll offset; the
    // doc-coordinate formula in buildScrollKeyframes keeps them comparable.
    act(() => {
      fixture.container.dispatchEvent(new window.Event("scroll"));
    });
    await flushFrame();
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);
    expect((fixture.view.scrollDOM as HTMLElement).scrollTop).toBe(150);

    await waitOutLock();
    act(() => {
      fixture.container.scrollTop = 100;
      fixture.container.dispatchEvent(new window.Event("scroll"));
    });
    await flushFrame();
    // reader 100 -> editor 50 from the SAME cached table, no rebuild.
    expect(fixture.view.scrollDOM.scrollTop).toBe(50);
    expect(fixture.lineBlockAt).toHaveBeenCalledTimes(3);
  });
});
