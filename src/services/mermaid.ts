import mermaid from "mermaid";

export type MermaidTheme = "default" | "dark" | "neutral";

type RenderMermaidOptions = {
  theme?: MermaidTheme;
  force?: boolean;
};

let renderId = 0;
let initializedTheme: MermaidTheme | null = null;

function ensureInitialized(theme: MermaidTheme): void {
  if (initializedTheme === theme) return;
  initializedTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme,
    suppressErrorRendering: true,
  });
}

/* ── Idle warm-up (profile finding, 2026-09-29) ──────────────────────────
 *
 * The FIRST mermaid.render costs ~400ms (one-off API lazy init: theme
 * compile, layout setup, renderer construction) while every diagram after
 * it is ~50ms — measured with --profile-mermaid (pre→svg0 = 421ms,
 * marginal 50ms on the 30-diagram corpus). The module is statically
 * imported and resident either way, so running one throwaway diagram
 * during the startup idle window moves that cost off the reader's first
 * screen without holding anything new in memory.
 *
 * The result is discarded and failures are free (the first real render
 * just walks the cold path). ensureWarm serializes pool renders behind
 * the warm-up so a document opened before the idle slot ever fires pays
 * exactly what it would have paid anyway — never worse.
 */

const WARMUP_SOURCE = "flowchart TD\n    A[开始] --> B[结束]";

let warmUpPromise: Promise<void> | null = null;

function renderWarmUp(): Promise<void> {
  return mermaid.render("bookmd-mermaid-warmup", WARMUP_SOURCE).then(
    () => undefined,
    // A failed warm-up is a cold path for the first real render — free.
    () => undefined,
  );
}

/** Schedules the throwaway warm-up render for the idle window. */
export function scheduleMermaidWarmUp(): void {
  if (warmUpPromise || import.meta.env?.MODE === "test") return;
  const start = () => {
    if (!warmUpPromise) warmUpPromise = renderWarmUp();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 800 });
  } else {
    window.setTimeout(start, 300);
  }
}

/** Resolves once the one-off API init has run (no-op under vitest). */
async function ensureWarm(): Promise<void> {
  if (import.meta.env?.MODE === "test") return;
  if (!warmUpPromise) warmUpPromise = renderWarmUp();
  await warmUpPromise;
}

/**
 * Read the raw Mermaid source from a <pre class="mermaid"> element.
 *
 * markdown.ts stores the original (unescaped) source as base64 in the
 * `data-mermaid-src` attribute so HTML-entity encoding (e.g. --> → --&gt;)
 * can never corrupt the diagram source before Mermaid sees it.
 *
 * Fallback: use textContent (browser auto-decodes HTML entities).
 */
function readSource(diagram: HTMLElement): string {
  const b64 = diagram.getAttribute("data-mermaid-src");
  if (b64) {
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch {
      // fall through to textContent
    }
  }
  return diagram.textContent ?? "";
}

function cleanupStrayNodes(id: string): void {
  try {
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    // Broad sweep for any leftovers with the same prefix
    document.querySelectorAll(`[id^='d${id}'], [id='${id}']`).forEach((el) => el.remove());
  } catch {
    // ignore
  }
}

const MAX_MERMAID_CACHE_SIZE = 50;
const mermaidSvgCache = new Map<string, string>();

export function clearMermaidCache(): void {
  mermaidSvgCache.clear();
}

type RenderDiagramOptions = {
  force?: boolean;
  /**
   * Commit gate consulted after each await point. A render scheduled under an
   * older token (stale theme/document) can still be in flight when the pool is
   * cancelled; returning false here makes it drop the result instead of
   * painting the live DOM with it.
   */
  shouldCommit?: () => boolean;
};

/**
 * Render a single <pre class="mermaid"> element to its SVG.
 *
 * Idempotent per theme: an already-rendered diagram with the same theme is
 * skipped, and a cached SVG replays without touching Mermaid. The DOM mutation
 * is identical to what renderMermaid's old inline loop produced.
 */
async function renderDiagram(
  diagram: HTMLElement,
  theme: MermaidTheme,
  options: RenderDiagramOptions = {},
): Promise<void> {
  // Skip already-rendered diagrams unless forced or theme changed.
  const prevTheme = diagram.getAttribute("data-mermaid-theme");
  const alreadyRendered = diagram.classList.contains("mermaid-rendered");
  if (alreadyRendered && !options.force && prevTheme === theme) return;

  const source = readSource(diagram).trim();
  if (!source) return;

  ensureInitialized(theme);

  diagram.setAttribute("data-mermaid-theme", theme);
  diagram.classList.remove("mermaid-rendered", "mermaid-error");

  const cacheKey = `${theme}:${source}`;
  const cached = mermaidSvgCache.get(cacheKey);
  if (cached !== undefined) {
    if (options.shouldCommit && !options.shouldCommit()) return;
    diagram.textContent = "";
    diagram.innerHTML = cached;
    diagram.classList.add("mermaid-rendered");
    return;
  }

  const id = `bookmd-mermaid-${Date.now()}-${(renderId += 1)}`;
  try {
    await ensureWarm();
    const { svg } = await mermaid.render(id, source);
    cleanupStrayNodes(id);
    if (options.shouldCommit && !options.shouldCommit()) return;
    mermaidSvgCache.set(cacheKey, svg);
    if (mermaidSvgCache.size > MAX_MERMAID_CACHE_SIZE) {
      const firstKey = mermaidSvgCache.keys().next().value;
      if (firstKey) mermaidSvgCache.delete(firstKey);
    }
    // Clear text content first, then inject SVG
    diagram.textContent = "";
    diagram.innerHTML = svg;
    diagram.classList.add("mermaid-rendered");
  } catch (error) {
    cleanupStrayNodes(id);
    if (options.shouldCommit && !options.shouldCommit()) return;
    const label = describeMermaidError(error);
    // Show graceful fallback — raw source preserved in a code block
    diagram.textContent = "";
    diagram.classList.add("mermaid-error");
    diagram.innerHTML = `<div class="mermaid-error-fallback"><div class="mermaid-error-label">⚠️ Mermaid 渲染失败：${escapeHtml(label)}</div><pre class="mermaid-error-source"><code>${escapeHtml(source)}</code></pre></div>`;
  }
}

function resolveMermaidTheme(theme?: MermaidTheme): MermaidTheme {
  return theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default");
}

export async function renderMermaid(
  container: HTMLElement,
  options: RenderMermaidOptions = {},
): Promise<void> {
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>("pre.mermaid"));
  if (diagrams.length === 0) return;

  const theme = resolveMermaidTheme(options.theme);
  ensureInitialized(theme);

  for (const diagram of diagrams) {
    await renderDiagram(diagram, theme, { force: options.force });
  }
}

/**
 * Viewport-aware lazy render pool (plan §6.3 item 2-5).
 *
 * The eager pass above renders *every* diagram the moment a document mounts;
 * a 30-diagram page paid for all of them before the reader saw any. The pool
 * defers that: an IntersectionObserver watches each `pre.mermaid` against the
 * reader's scroller (plus a margin so scrolling ahead stays smooth), and only
 * diagrams approaching the viewport enter the queue. The queue drains at most
 * ONE diagram per idle task, ordered by distance from the viewport, so no
 * single task crosses the long-task threshold and the first viewportful wins.
 *
 * The end DOM is identical to the eager pass — same SVG, same theme wiring,
 * same error fallback — it just arrives per-viewport. Anything that needs the
 * whole document at once (print) calls flush().
 */
export type MermaidRenderPoolOptions = {
  theme?: MermaidTheme;
  /** The scroll container to measure the viewport against; null = browser viewport. */
  root?: Element | null;
  /** Called when the queue drains (may fire again later after scrolling brings in more). */
  onComplete?: () => void;
  /** Called if a diagram render throws outside its own fallback UI. */
  onError?: (error: unknown) => void;
};

export type MermaidRenderPool = {
  start: () => void;
  /**
   * Bring elements that entered the DOM after start() into the pool (the
   * virtualized reader materializes a window at a time; a diagram scrolled
   * into view is a new `pre.mermaid` the initial scan never saw). Each node
   * is checked for being or containing an unrendered diagram and observed.
   * A no-op when the environment has no IntersectionObserver - there the
   * pool already flushed eagerly.
   */
  observe: (nodes: readonly HTMLElement[]) => void;
  /** Render every remaining diagram eagerly (print / capture correctness). */
  flush: () => Promise<void>;
  /** Abort: disconnect the observer, drop the queue, veto in-flight commits. */
  cancel: () => void;
};

/** Preload band around the scroller; scrolling inside it finds diagrams rendered. */
const MERMAID_POOL_ROOT_MARGIN_PX = 300;
/** Upper bound on waiting for an idle slot even under load, so work never starves. */
const MERMAID_POOL_IDLE_TIMEOUT_MS = 250;

type PoolQueueItem = { diagram: HTMLElement; distance: number };

export function createMermaidRenderPool(
  container: HTMLElement,
  options: MermaidRenderPoolOptions = {},
): MermaidRenderPool {
  const theme = resolveMermaidTheme(options.theme);
  const queue: PoolQueueItem[] = [];
  const queued = new Set<HTMLElement>();
  let observer: IntersectionObserver | null = null;
  let cancelScheduledTask: (() => void) | null = null;
  let cancelled = false;
  // True while one renderDiagram is in flight. Mermaid's global initialize is
  // not reentrant-safe, and the whole point of the pool is one-render-per-task,
  // so a second drain must never start while the first is running.
  let rendering = false;

  const liveDiagrams = () => Array.from(container.querySelectorAll<HTMLElement>("pre.mermaid"));

  /** Gap in px between the element and the scroller's viewport; 0 if (near) visible. */
  const viewportDistance = (el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    if (options.root) {
      const view = options.root.getBoundingClientRect();
      if (rect.bottom < view.top) return view.top - rect.bottom;
      if (rect.top > view.bottom) return rect.top - view.bottom;
      return 0;
    }
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    return 0;
  };

  const stopScheduling = () => {
    if (cancelScheduledTask) {
      cancelScheduledTask();
      cancelScheduledTask = null;
    }
  };

  const stopObserving = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const scheduleDrain = () => {
    if (cancelled || cancelScheduledTask) return;
    // One diagram per idle task. requestIdleCallback keeps renders off the
    // critical path entirely; the timeout bounds the wait so a busy main
    // thread cannot starve the pool. The setTimeout(16) fallback covers
    // engines without requestIdleCallback (Safari, jsdom).
    const run = () => {
      cancelScheduledTask = null;
      drainNext();
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: MERMAID_POOL_IDLE_TIMEOUT_MS });
      cancelScheduledTask = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(run, 16);
      cancelScheduledTask = () => window.clearTimeout(handle);
    }
  };

  // Promise for the currently running lazy render (resolved when none is
  // running). flush() awaits it before taking over, so Mermaid's global
  // initialize/render state is never entered twice concurrently.
  let inFlight: Promise<void> = Promise.resolve();

  const drainNext = () => {
    if (cancelled || rendering) return;
    const item = queue.shift();
    if (!item) return;
    queued.delete(item.diagram);
    rendering = true;
    inFlight = renderDiagram(item.diagram, theme, { shouldCommit: () => !cancelled })
      .catch((error: unknown) => {
        if (!cancelled) options.onError?.(error);
      })
      .then(() => {
        rendering = false;
        if (cancelled) return;
        // Re-schedule instead of chaining the next render as a microtask
        // continuation: that would run several renders inside one long task.
        if (queue.length === 0) {
          options.onComplete?.();
        } else {
          scheduleDrain();
        }
      });
  };

  const enqueue = (diagram: HTMLElement) => {
    if (cancelled || queued.has(diagram)) return;
    queued.add(diagram);
    const item: PoolQueueItem = { diagram, distance: viewportDistance(diagram) };
    // Insertion-sorted by distance: diagrams closest to the viewport (above
    // or below it) render first, so anchor jumps and reading-position
    // restores get their charts before the far end of the document does.
    let at = queue.length;
    while (at > 0 && queue[at - 1].distance > item.distance) at -= 1;
    queue.splice(at, 0, item);
    scheduleDrain();
  };

  /** The IntersectionObserver, created once on first need; null without IO. */
  const ensureObserver = (): IntersectionObserver | null => {
    if (cancelled) return null;
    if (observer) return observer;
    if (typeof IntersectionObserver !== "function") return null;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // First arrival is the only one that matters: the element leaves
          // the pool's observation set and its render is idempotent per
          // theme, so scrolling back never needs another enqueue.
          observer?.unobserve(entry.target);
          enqueue(entry.target as HTMLElement);
        }
      },
      { root: options.root ?? null, rootMargin: `${MERMAID_POOL_ROOT_MARGIN_PX}px` },
    );
    return observer;
  };

  const unrenderedDiagramsIn = (el: HTMLElement): HTMLElement[] => {
    if (el.classList.contains("mermaid") && !el.classList.contains("mermaid-rendered")) {
      return [el];
    }
    return Array.from(el.querySelectorAll<HTMLElement>("pre.mermaid:not(.mermaid-rendered)"));
  };

  const pool: MermaidRenderPool = {
    start: () => {
      if (cancelled || observer) return;
      const diagrams = liveDiagrams();
      if (diagrams.length === 0) return;
      if (typeof IntersectionObserver !== "function") {
        // No viewport awareness in this environment (jsdom, ancient engines):
        // fall back to the historical eager pass so every diagram renders.
        void pool.flush().catch((error: unknown) => options.onError?.(error));
        return;
      }
      const created = ensureObserver();
      if (!created) return;
      for (const diagram of diagrams) created.observe(diagram);
    },

    observe: (nodes) => {
      if (cancelled || nodes.length === 0) return;
      // No IO in this engine: the pool already took the eager pass on start,
      // so there is nothing lazy left to hand it - the diagrams are rendered
      // or will be by a later materialize that the whole-document path covers.
      if (typeof IntersectionObserver !== "function") return;
      const created = ensureObserver();
      if (!created) return;
      for (const node of nodes)
        for (const diagram of unrenderedDiagramsIn(node)) {
          created.observe(diagram);
        }
    },

    flush: async () => {
      if (cancelled) return;
      stopObserving();
      stopScheduling();
      queue.length = 0;
      queued.clear();
      await inFlight;
      if (cancelled) return;
      // The historical sequential loop, on purpose: a print or capture of the
      // live DOM must not show unrendered diagrams, viewport or not. It costs
      // a moment on a 30-chart document, which is correct behavior there.
      for (const diagram of liveDiagrams()) {
        if (cancelled) return;
        await renderDiagram(diagram, theme, { shouldCommit: () => !cancelled });
      }
      if (!cancelled) options.onComplete?.();
    },

    cancel: () => {
      cancelled = true;
      stopObserving();
      stopScheduling();
      queue.length = 0;
      queued.clear();
    },
  };

  return pool;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function describeMermaidError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
