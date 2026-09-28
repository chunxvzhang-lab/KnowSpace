import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import mermaid, { type RenderResult } from "mermaid";
import {
  clearMermaidCache,
  createMermaidRenderPool,
  type MermaidRenderPool,
} from "../services/mermaid";

/**
 * The lazy render pool (plan §6.3 2-5): viewport-gated enqueue, one render per
 * idle task ordered by distance, eager flush for print, and a cancel that
 * drops queue + observer + in-flight commits.
 */

type FakeEntry = { target: Element; isIntersecting: boolean };

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  rootMargin = "";
  root: Element | null = null;

  constructor(
    private readonly callback: (entries: FakeEntry[]) => void,
    options?: { root?: Element | null; rootMargin?: string },
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "";
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve(target: Element) {
    const at = this.observed.indexOf(target);
    if (at >= 0) this.observed.splice(at, 1);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.length = 0;
  }
  /** Simulate the async batch the browser would deliver. */
  trigger(entries: FakeEntry[]) {
    this.callback(entries);
  }
}

/** Controllable render: the mock only resolves when the test pulls the trigger. */
function harness() {
  const started: string[] = [];
  const settled: string[] = [];
  const pending: Array<() => void> = [];
  const renderSpy = vi
    .spyOn(mermaid, "render")
    .mockImplementation((_id: string, source: string) => {
      const label = source.includes("NEAR") ? "near" : source.includes("FAR") ? "far" : "other";
      started.push(label);
      return new Promise<RenderResult>((resolve) => {
        pending.push(() => {
          settled.push(label);
          resolve({
            svg: `<svg data-src="${label}"></svg>`,
            bindFunctions: undefined,
            diagramType: "flowchart",
          });
        });
      });
    });
  return { renderSpy, started, settled, pending };
}

function preWithRect(top: number, source: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "mermaid";
  pre.setAttribute("data-mermaid-src", btoa(source));
  pre.getBoundingClientRect = () =>
    ({ top, bottom: top + 120, left: 0, right: 400, width: 400, height: 120 }) as DOMRect;
  return pre;
}

function makeContainer(): { container: HTMLElement; far: HTMLElement; near: HTMLElement } {
  const container = document.createElement("article");
  // Distances are measured against the browser viewport (innerHeight 768 in
  // jsdom) because root=null: near sits 50px past the bottom edge, far 4000px.
  const far = preWithRect(4768, "graph TD\nFAR-->X");
  const near = preWithRect(818, "graph TD\nNEAR-->X");
  container.appendChild(far);
  container.appendChild(near);
  document.body.appendChild(container);
  return { container, far, near };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(500);
}

let h: ReturnType<typeof harness>;
let renderSpy: MockInstance<typeof mermaid.render>;

beforeEach(() => {
  clearMermaidCache();
  FakeIntersectionObserver.instances = [];
  document.body.innerHTML = "";
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  h = harness();
  renderSpy = h.renderSpy;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createMermaidRenderPool", () => {
  it("renders nothing until diagrams intersect, then one per idle task in distance order", async () => {
    const { container, far, near } = makeContainer();
    const pool = createMermaidRenderPool(container, { theme: "default" });
    pool.start();

    const io = FakeIntersectionObserver.instances[0];
    expect(io.observed).toContain(far);
    expect(io.observed).toContain(near);
    expect(io.rootMargin).toBe("300px");
    expect(renderSpy).not.toHaveBeenCalled();

    // The browser reports the batch far-first; the pool must reorder.
    io.trigger([
      { target: far, isIntersecting: true },
      { target: near, isIntersecting: true },
    ]);
    expect(renderSpy).not.toHaveBeenCalled(); // only scheduled

    await settle();
    expect(h.started).toEqual(["near"]); // exactly one render per task
    expect(io.observed).not.toContain(near); // unobserved on first arrival

    // Completing the running render must not chain the next one in the same
    // microtask flush: it waits for its own idle task.
    h.pending[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    await settle();
    expect(h.started).toEqual(["near", "far"]);
    h.pending[1]();
    await settle();

    // near (distance 50) rendered before far (distance 4000)
    expect(near.querySelector("svg")).not.toBeNull();
    expect(far.querySelector("svg")).not.toBeNull();
  });

  it("flush() renders every diagram regardless of visibility", async () => {
    const { container, far } = makeContainer();
    const pool = createMermaidRenderPool(container, { theme: "default" });
    pool.start();
    FakeIntersectionObserver.instances[0].trigger([{ target: far, isIntersecting: true }]);
    await settle();
    expect(h.started).toEqual(["far"]);

    const flushing = pool.flush();
    // Drive every render the flush kicks off until it settles: the gated mock
    // only resolves when this loop pulls its trigger, and each resolution
    // happens inside the awaited timer ticks of advanceTimersByTimeAsync.
    let guard = 0;
    while (h.pending.length > 0 && guard < 20) {
      h.pending.shift()!();
      await vi.advanceTimersByTimeAsync(0);
      guard += 1;
    }
    await flushing;

    expect(container.querySelectorAll("pre.mermaid svg")).toHaveLength(2);
    // The observer is no longer needed once everything is rendered.
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
  });

  it("cancel() drops the queue, disconnects the observer and vetoes in-flight commits", async () => {
    const { container, far, near } = makeContainer();
    const pool = createMermaidRenderPool(container, { theme: "default" });
    pool.start();
    FakeIntersectionObserver.instances[0].trigger([
      { target: far, isIntersecting: true },
      { target: near, isIntersecting: true },
    ]);
    await settle();
    expect(h.started).toEqual(["near"]); // in flight, far still queued

    pool.cancel();
    h.pending[0](); // resolves after cancel: it must not commit
    await settle();

    expect(renderSpy).toHaveBeenCalledTimes(1); // queued far never started
    expect(near.querySelector("svg")).toBeNull(); // stale commit vetoed
    expect(near.classList.contains("mermaid-rendered")).toBe(false);
    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
  });

  it("duplicate intersection reports enqueue the diagram once", async () => {
    const { container, near } = makeContainer();
    const pool: MermaidRenderPool = createMermaidRenderPool(container, { theme: "default" });
    pool.start();
    const io = FakeIntersectionObserver.instances[0];
    io.trigger([{ target: near, isIntersecting: true }]);
    io.trigger([{ target: near, isIntersecting: true }]); // the queue dedups anyway
    await settle();
    h.pending[0]();
    await settle();
    expect(h.started).toEqual(["near"]);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("without IntersectionObserver the pool falls back to the eager pass", async () => {
    vi.stubGlobal("IntersectionObserver", undefined); // jsdom reality
    const { container, far, near } = makeContainer();
    const pool = createMermaidRenderPool(container, { theme: "default" });
    pool.start();
    await settle();
    expect(h.started).toEqual(["far"]); // document order, like the old eager loop
    h.pending[0]();
    await settle();
    expect(h.started).toEqual(["far", "near"]);
    h.pending[1]();
    await settle();
    expect(far.querySelector("svg")).not.toBeNull();
    expect(near.querySelector("svg")).not.toBeNull();
  });

  it("observe() renders a diagram that entered the DOM after start()", async () => {
    // The virtualized reader materializes a window at a time; a diagram
    // outside the first window never existed when start() scanned the DOM, so
    // the controller hands its element to pool.observe() when it appears.
    const container = document.createElement("article");
    document.body.appendChild(container);
    const pool = createMermaidRenderPool(container, { theme: "default" });
    pool.start(); // no diagrams yet: start() creates nothing eagerly
    expect(FakeIntersectionObserver.instances).toHaveLength(0);

    const late = preWithRect(818, "graph TD\nNEAR-->X");
    container.appendChild(late);
    pool.observe([late]);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].observed).toContain(late);

    FakeIntersectionObserver.instances[0].trigger([{ target: late, isIntersecting: true }]);
    await settle();
    h.pending[0]();
    await settle();
    expect(late.querySelector("svg")).not.toBeNull();
    pool.cancel();
  });

  it("cached diagram SVGs replay without touching Mermaid", async () => {
    // Document 1 renders the NEAR source through the pool.
    const { container, near } = makeContainer();
    const first = createMermaidRenderPool(container, { theme: "default" });
    first.start();
    FakeIntersectionObserver.instances[0].trigger([{ target: near, isIntersecting: true }]);
    await settle();
    h.pending[0]();
    await settle();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    first.cancel();

    // Document 2 carries the same source: the 50-entry SVG cache replays it
    // with zero Mermaid work — this is the re-opened-document fast path.
    const container2 = document.createElement("article");
    const clone = preWithRect(818, "graph TD\nNEAR-->X");
    container2.appendChild(clone);
    document.body.appendChild(container2);
    const second = createMermaidRenderPool(container2, { theme: "default" });
    second.start();
    FakeIntersectionObserver.instances[1].trigger([{ target: clone, isIntersecting: true }]);
    await settle();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(clone.querySelector("svg")).not.toBeNull();
  });
});
