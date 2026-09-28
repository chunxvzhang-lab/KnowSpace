import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import mermaid from "mermaid";
import { clearMermaidCache, type MermaidTheme } from "../services/mermaid";
import type { RenderedChapter } from "../core/types";
import { ReaderPane } from "../components/ReaderPane";

/**
 * ReaderPane drives the lazy Mermaid render pool (plan §6.3 2-5): only
 * diagrams near the reader's viewport render on mount, the rest wait for
 * scroll or for the beforeprint flush. These tests use the real service and
 * stub Mermaid itself, plus a controllable IntersectionObserver where the
 * viewport gating matters.
 */

class FakeIO {
  static instances: FakeIO[] = [];
  disconnected = false;
  constructor(
    private readonly callback: (
      entries: Array<{ target: Element; isIntersecting: boolean }>,
    ) => void,
    _options?: { root?: Element | null; rootMargin?: string },
  ) {
    FakeIO.instances.push(this);
  }
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {
    this.disconnected = true;
  }
  enter(el: Element) {
    this.callback([{ target: el, isIntersecting: true }]);
  }
}

// markdown.ts stores the raw fence source as base64 so entity distortion can
// never reach Mermaid; the pool's theme-change re-render reads it back after
// the first render has replaced the pre's text with SVG.
const d1src = btoa("flowchart LR\nA --> B");
const d2src = btoa("flowchart LR\nC --> D");

const singleDiagram: RenderedChapter = {
  html: `<h1 id="diagram">Diagram</h1><pre class="mermaid" id="d1" data-mermaid-src="${d1src}">flowchart LR\nA --&gt; B</pre>`,
  headings: [{ id: "diagram", text: "Diagram", level: 1 }],
  frontMatter: null,
  checksum: "mermaid-chapter",
  plainText: "Diagram flowchart LR A --> B",
  hasMermaid: true,
};

const twoDiagrams: RenderedChapter = {
  html:
    `<pre class="mermaid" id="d1" data-mermaid-src="${d1src}">flowchart LR\nA --&gt; B</pre>` +
    `<pre class="mermaid" id="d2" data-mermaid-src="${d2src}">flowchart LR\nC --&gt; D</pre>`,
  headings: [],
  frontMatter: null,
  checksum: "two-mermaid",
  plainText: "A B C D",
  hasMermaid: true,
};

let renderSpy: MockInstance<typeof mermaid.render>;

beforeEach(() => {
  clearMermaidCache();
  FakeIO.instances = [];
  renderSpy = vi
    .spyOn(mermaid, "render")
    .mockImplementation(async (_id: string, source: string) => ({
      svg: `<svg data-src="${source}"></svg>`,
      bindFunctions: undefined,
      diagramType: "flowchart",
    }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountReader(chapter: RenderedChapter, mermaidTheme: MermaidTheme = "default") {
  const containerRef = { current: null };
  const onMermaidError = vi.fn();
  const utils = render(
    <ReaderPane
      chapter={chapter}
      containerRef={containerRef}
      fontScale={1}
      mermaidTheme={mermaidTheme}
      onMermaidError={onMermaidError}
      showLineNumbers
    />,
  );
  return { ...utils, onMermaidError };
}

describe("ReaderPane Mermaid rendering", () => {
  it("preserves the rendered SVG across unrelated component renders", async () => {
    const { container, onMermaidError, rerender } = mountReader(singleDiagram);

    await waitFor(() => {
      expect(container.querySelector("pre.mermaid svg")).not.toBeNull();
    });

    rerender(
      <ReaderPane
        chapter={singleDiagram}
        containerRef={{ current: null }}
        fontScale={1.1}
        mermaidTheme="default"
        onMermaidError={onMermaidError}
        showLineNumbers={false}
      />,
    );

    expect(container.querySelector("pre.mermaid svg")).not.toBeNull();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(onMermaidError).not.toHaveBeenCalled();
  });

  it("re-renders diagrams when the theme changes", async () => {
    const { container, rerender } = mountReader(singleDiagram);
    await waitFor(() => {
      expect(container.querySelector("pre.mermaid svg")).not.toBeNull();
    });
    expect(renderSpy).toHaveBeenCalledTimes(1);

    rerender(
      <ReaderPane
        chapter={singleDiagram}
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="dark"
        onMermaidError={vi.fn()}
        showLineNumbers
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('pre.mermaid[data-mermaid-theme="dark"] svg')).not.toBeNull();
    });
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("leaves diagrams outside the viewport unrendered until they enter or print flushes them", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { container, onMermaidError } = mountReader(twoDiagrams);
    const io = FakeIO.instances[FakeIO.instances.length - 1];
    const first = container.querySelector("#d1") as Element;
    io.enter(first);

    await waitFor(() => {
      expect(container.querySelector("#d1 svg")).not.toBeNull();
    });
    // d2 is below the preload margin and must not have cost anything yet.
    expect(container.querySelector("#d2 svg")).toBeNull();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(io.disconnected).toBe(false);

    // Printing captures the live DOM, so the pool must flush everything the
    // reader never scrolled to.
    window.dispatchEvent(new Event("beforeprint"));
    await waitFor(() => {
      expect(container.querySelectorAll("pre.mermaid svg")).toHaveLength(2);
    });
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(onMermaidError).not.toHaveBeenCalled();
  });

  it("disconnects the pool observer when the pane unmounts", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { container, unmount } = mountReader(twoDiagrams);
    const io = FakeIO.instances[FakeIO.instances.length - 1];
    io.enter(container.querySelector("#d1") as Element);
    await waitFor(() => {
      expect(container.querySelector("#d1 svg")).not.toBeNull();
    });

    unmount();
    expect(io.disconnected).toBe(true);
  });
});
