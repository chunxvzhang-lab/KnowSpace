import type { RenderedBlock } from "../../core/types";
import {
  blockKeyOf,
  buildCumulative,
  buildSurfacePlan,
  computeWindow,
  findBlockForSourceLine,
  HEIGHT_UPDATE_EPSILON_PX,
  heightContextKey,
  resolveHeightsFromKeys,
  scrollTopForBlock,
  setMeasuredHeight,
  type HeightContext,
  type VirtualSegment,
  type VirtualWindow,
  type WindowInput,
} from "../../services/readerVirtual";

/*
 * The DOM half of reader virtualization (phase 2, wave 2-2) - see
 * services/readerVirtual.ts for the geometry it applies. React owns nothing
 * inside the article (established last wave); this controller owns the
 * article's children outright and only runs when the chapter is long enough
 * to be worth a window.
 *
 * The article's children are, in order:
 *   [anchor/spacer segments above the window][real block nodes][segments below]
 * Segments are leaf divs sized from the height table and annotated with
 * `data-source-line`, so the source-line -> pixel mapping every scroll
 * consumer reads (sync-scroll, search, restore) survives with most blocks
 * absent - it interpolates between the anchors instead of catastrophically.
 *
 * Identity rules that make a keystroke cost one block and a same-window
 * scroll cost nothing:
 *  - a segment's identity is its grid slot (`a48`, `st`, `sb`), which is a
 *    function of block index alone, never of the window - so sliding the
 *    window re-sizes segments in place rather than replacing them;
 *  - a real block's identity is its content-addressed blockKey, reused
 *    verbatim from the reconcile, so its <mark>s / rendered mermaid /
 *    code-header decoration survive a window change that keeps it visible.
 */

/** Attribute stamping a segment div. */
const SLOT_ATTR = "data-v-slot";
const BLOCK_KEY_ATTR = "data-block-key";
const ANCHOR_ATTR = "data-virtual-anchor";
const SPACER_ATTR = "data-virtual-spacer";

export type ControllerCallbacks = {
  /** Newly created (not reused) block root elements, in document order. */
  onMaterialize: (elements: HTMLElement[]) => void;
};

export class VirtualReaderController {
  private blocks: readonly RenderedBlock[];
  private keys: string[];
  private heights: number[];
  private cumulative: number[];
  private context: HeightContext;
  private window: VirtualWindow = { start: 0, end: 0 };
  private lastPlanSignature = "";
  private scrollQueued = false;
  private measureQueued = false;
  private measureFrame = 0;
  private pinnedAll = false;
  private disposed = false;
  /**
   * Cached scroller geometry (px top of the article inside the scroller, and
   * the viewport height). Both are constants of the *layout*, not of the
   * scroll position - yet reading them via getBoundingClientRect/clientHeight
   * on every rAF-coalesced recompute forced a style/layout pass mid-burst
   * (the 2-4 profile: 369ms of rect self time + the layout it forced). The
   * cache is invalidated by everything that can move or resize the article:
   * a remount (setArticle/sync), a context change (fonts reflow), and a
   * container resize (the observer ReaderPane wires to onResize). Within a
   * scroll burst, none of those happen, and recompute reads no DOM geometry
   * at all beyond the (cheap, non-forcing) scrollTop.
   */
  private cachedContentTop: number | null = null;
  private cachedViewport = 0;

  constructor(
    private readonly container: HTMLElement,
    private article: HTMLElement,
    blocks: readonly RenderedBlock[],
    context: HeightContext,
    private readonly callbacks: ControllerCallbacks,
  ) {
    this.context = context;
    this.blocks = blocks;
    this.keys = blocks.map(blockKeyOf);
    this.heights = resolveHeightsFromKeys(this.keys, context);
    this.cumulative = buildCumulative(this.heights);
    this.recompute(true);
  }

  /* ── external input ─────────────────────────────────────────────────── */

  /**
   * Apply the whole input set for a paint and recompute the window ONCE.
   * Used on every settle render and on a documentKey remount (the article
   * node and the block list can both move at once); the three setters below
   * would each rebuild, which is wasted work on a long-document switch.
   */
  sync(article: HTMLElement, blocks: readonly RenderedBlock[], context: HeightContext): void {
    const contextChanged =
      context.theme !== this.context.theme || context.fontScale !== this.context.fontScale;
    this.context = context;
    this.article = article;
    this.blocks = blocks;
    this.keys = blocks.map(blockKeyOf);
    this.lastPlanSignature = "";
    this.cachedContentTop = null;
    if (contextChanged) this.refreshTable();
    if (this.pinnedAll) this.materializeAll();
    else this.recompute(true);
  }

  setBlocks(blocks: readonly RenderedBlock[]): void {
    this.blocks = blocks;
    this.keys = blocks.map(blockKeyOf);
    this.refreshTable();
    if (this.pinnedAll) {
      this.materializeAll();
      return;
    }
    this.recompute(true);
  }

  setArticle(article: HTMLElement): void {
    this.article = article;
    this.lastPlanSignature = "";
    this.cachedContentTop = null;
    if (this.pinnedAll) this.materializeAll();
    else this.recompute(true);
  }

  setContext(context: HeightContext): void {
    if (context.theme === this.context.theme && context.fontScale === this.context.fontScale) {
      return;
    }
    this.context = context;
    this.cachedContentTop = null;
    this.refreshTable();
    if (this.pinnedAll) this.materializeAll();
    else this.recompute(true);
  }

  /**
   * Scroll listener entry point - passive, rAF-coalesced. The scrollTop is
   * SNAPSHOT in the event phase, not re-read in the rAF: by the time rAF
   * callbacks run, earlier DOM writes (our own previous window move, the
   * editor pane's follow scroll) have dirtied the layout, and even a plain
   * `scrollTop` read then forces a full style+layout flush (the second 2-4
   * profile: 415ms attributed to a single property read per frame). During
   * the scroll event itself the position is the one the browser just
   * committed - free to read.
   */
  onScroll(): void {
    if (this.disposed || this.pinnedAll || this.scrollQueued) return;
    const position = this.container.scrollTop;
    this.scrollQueued = true;
    window.requestAnimationFrame(() => {
      this.scrollQueued = false;
      if (this.disposed || this.pinnedAll) return;
      this.recompute(false, position);
    });
  }

  onResize(): void {
    if (this.disposed || this.pinnedAll) return;
    this.cachedContentTop = null;
    this.recompute(false);
  }

  /* ── window + surface ───────────────────────────────────────────────── */

  /**
   * @param scrollTopOverride the event-phase snapshot from onScroll; when
   * absent (jumps, settle renders, resize) the live position is read, which
   * is correct there - those callers need the current value, not the last
   * event's.
   */
  private geometry(scrollTopOverride?: number): WindowInput {
    if (this.cachedContentTop === null) {
      this.cachedContentTop =
        this.article.getBoundingClientRect().top -
        this.container.getBoundingClientRect().top +
        this.container.scrollTop;
      this.cachedViewport = this.container.clientHeight;
    }
    return {
      scrollTop: scrollTopOverride ?? this.container.scrollTop,
      viewport: this.cachedViewport,
      contentTop: this.cachedContentTop,
      count: this.blocks.length,
    };
  }

  private refreshTable(): void {
    this.heights = resolveHeightsFromKeys(this.keys, this.context);
    this.cumulative = buildCumulative(this.heights);
  }

  private recompute(force: boolean, scrollTopOverride?: number): void {
    if (this.blocks.length === 0) {
      this.applySurface({ start: 0, end: 0 }, []);
      return;
    }
    const plan = buildSurfacePlan(
      this.cumulative,
      (i) => this.sourceLineAt(i),
      this.windowFor(scrollTopOverride),
    );
    const signature = this.signature(plan.window, plan.segments);
    if (!force && signature === this.lastPlanSignature) {
      // The hot path: scrolled inside the window. Zero DOM work - no reads
      // either: the caller passed its position snapshot.
      return;
    }
    this.lastPlanSignature = signature;
    this.applySurface(plan.window, plan.segments);
  }

  private windowFor(scrollTopOverride?: number): VirtualWindow {
    return computeWindow(this.cumulative, this.geometry(scrollTopOverride));
  }

  private sourceLineAt(index: number): number {
    const block = this.blocks[index];
    return block ? block.sourceStart : -1;
  }

  private signature(window: VirtualWindow, segments: readonly VirtualSegment[]): string {
    let sig = `${window.start}:${window.end}`;
    for (const s of segments) sig += `|${s.slot}:${s.sourceLine}`;
    return sig;
  }

  /**
   * Rebuild the article's children to the window + segments. Existing block
   * nodes are reused by blockKey (identity preserved - marks, rendered
   * diagrams, decorations survive), existing segments by slot; the reorder
   * walks desired positions and only relocates what is out of place, then
   * drops the leftovers. New block elements are handed to onMaterialize.
   */
  private applySurface(window: VirtualWindow, segments: readonly VirtualSegment[]): void {
    this.window = window;
    const article = this.article;

    const blockUnits = new Map<string, Node[]>();
    const segmentNodes = new Map<string, HTMLElement>();
    for (const child of Array.from(article.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const slot = el.getAttribute(SLOT_ATTR);
      if (slot) {
        segmentNodes.set(slot, el as HTMLElement);
        continue;
      }
      const key = el.getAttribute(BLOCK_KEY_ATTR);
      if (key) {
        const unit: Node[] = [el];
        let next = el.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE) {
          const advance = next.nextSibling;
          unit.push(next);
          next = advance;
        }
        blockUnits.set(key, unit);
      }
    }

    const want: Node[] = [];
    const newBlockElements: HTMLElement[] = [];
    const addSegment = (seg: VirtualSegment): void => {
      const existing = segmentNodes.get(seg.slot);
      if (existing) {
        segmentNodes.delete(seg.slot);
        syncSegment(existing, seg);
        want.push(existing);
        return;
      }
      const created = createSegment(seg);
      want.push(created);
    };
    const addBlock = (index: number): void => {
      const key = this.keys[index];
      const unit = blockUnits.get(key);
      if (unit) {
        blockUnits.delete(key);
        want.push(...unit);
        return;
      }
      const fragment = parseBlock(this.blocks[index], key);
      const first = fragment.firstElementChild;
      if (first instanceof HTMLElement) newBlockElements.push(first);
      want.push(...Array.from(fragment.childNodes));
    };

    for (const seg of segments) {
      if (seg.to <= this.window.start) {
        addSegment(seg);
      }
    }
    for (let i = window.start; i < window.end; i += 1) addBlock(i);
    for (const seg of segments) {
      if (seg.from >= this.window.end) addSegment(seg);
    }

    // Reorder in place: position every wanted node at its target index.
    for (let i = 0; i < want.length; i += 1) {
      const current = article.childNodes[i];
      if (current !== want[i]) article.insertBefore(want[i], current || null);
    }
    while (article.childNodes.length > want.length) {
      const last = article.lastChild;
      if (!last) break;
      article.removeChild(last);
    }
    // Anything not repositioned (stale blocks/segments) is beyond the loop's
    // index range only if want.length covered it; leftovers that were never
    // referenced are the ones the trailing remove above drops. Remove any
    // still-unconsumed known nodes explicitly so order stays exact.
    for (const unit of blockUnits.values()) for (const n of unit) n.parentNode?.removeChild(n);
    for (const el of segmentNodes.values()) el.parentNode?.removeChild(el);

    if (newBlockElements.length > 0) this.callbacks.onMaterialize(newBlockElements);
    this.scheduleMeasure();
  }

  /* ── measurement post-pass ──────────────────────────────────────────── */

  /**
   * Measure on the next frame after a window move. This is load-bearing, not
   * just tidy: the cold window is sized from the *estimate* (48px), which is
   * smaller than the corpus's real per-block advance (~90px), so the first
   * window over-materializes. The measurement pass records the real heights
   * and re-windows to the true size (see measureWindow) - a few frames later
   * the article settles to its bounded steady state. Deferring this to a
   * trailing debounce instead left the cold over-fill visible (and dropped
   * scroll frames): the correction has to land promptly.
   */
  private scheduleMeasure(): void {
    if (this.measureQueued) return;
    this.measureQueued = true;
    this.measureFrame = window.requestAnimationFrame(() => {
      this.measureQueued = false;
      this.measureFrame = 0;
      this.measureWindow();
    });
  }

  /**
   * After layout settles, record each materialized block's *advance* (its
   * top to the next element's top, which folds collapsed margins in once)
   * and refresh segment heights where they now deviate from the table.
   */
  private measureWindow(): void {
    if (this.disposed) return;
    // Every child contributes a top position, so a block's advance is the
    // distance to whatever follows it - the next real block inside the window,
    // or the segment that closes it (which sits exactly where the block's own
    // collapsed margin ends). This is what keeps the height table in the same
    // px-per-block units the spacers/anchors are sized from.
    const children = Array.from(this.article.children) as HTMLElement[];
    const tops = children.map((el) => el.getBoundingClientRect().top);
    if (children.length === 0) return;
    let tableChanged = false;
    for (let i = 0; i < children.length; i += 1) {
      const el = children[i];
      if (el.hasAttribute(SLOT_ATTR)) continue;
      const key = el.getAttribute(BLOCK_KEY_ATTR);
      if (!key) continue;
      let advance: number;
      if (i + 1 < children.length) {
        advance = tops[i + 1] - tops[i];
      } else {
        const style = window.getComputedStyle(el);
        advance = el.offsetHeight + (parseFloat(style.marginBottom) || 0);
      }
      if (setMeasuredHeight(heightContextKey(this.context, key), advance)) {
        tableChanged = true;
      }
    }
    if (!tableChanged) return;
    this.refreshTable();
    if (this.pinnedAll) {
      this.updateSegmentHeights();
      return;
    }
    // Re-window with the real heights and re-tighten the segments: the first
    // window was sized from the estimate, so the correction both shrinks it to
    // the true block budget and resizes the segments it left behind. This runs
    // at most once more (the second measure finds the table unchanged), so it
    // converges in two frames rather than waiting on a ResizeObserver.
    this.recompute(true);
  }

  /** Re-derive segment heights from the fresh table and write only drift. */
  private updateSegmentHeights(): void {
    const plan = buildSurfacePlan(this.cumulative, (i) => this.sourceLineAt(i), this.window);
    for (const seg of plan.segments) {
      const el = this.article.querySelector<HTMLElement>(`[${SLOT_ATTR}="${cssEscape(seg.slot)}"]`);
      if (el) syncSegmentHeight(el, seg.height);
    }
  }

  /* ── the jump contract ──────────────────────────────────────────────── */

  /**
   * Bring the block covering `sourceLine` into the window and let layout
   * settle, so a caller can then resolve its element / text. Sets scrollTop
   * from the cumulative table (which windows around the target), reconciles
   * synchronously, and resolves one frame later when the nodes exist.
   */
  async ensureBlockVisible(sourceLine: number, align: "start" | "center" = "start"): Promise<void> {
    if (this.disposed || this.blocks.length === 0) return;
    const index = findBlockForSourceLine(this.blocks, sourceLine);
    const geom = this.geometry();
    this.container.scrollTop = scrollTopForBlock(
      this.cumulative,
      geom.contentTop,
      index,
      geom.viewport,
      align,
    );
    this.recompute(true);
    await raf();
  }

  /* ── print ──────────────────────────────────────────────────────────── */

  /** Whole-document render for beforeprint: window = every block, no segments. */
  materializeAll(): void {
    this.pinnedAll = true;
    this.applySurface({ start: 0, end: this.blocks.length }, []);
  }

  /** afterprint: give the window back to the scroll position. */
  resumeWindowing(): void {
    if (!this.pinnedAll) return;
    this.pinnedAll = false;
    this.recompute(true);
  }

  dispose(): void {
    this.disposed = true;
    if (this.measureFrame !== 0) {
      window.cancelAnimationFrame(this.measureFrame);
      this.measureFrame = 0;
    }
    this.measureQueued = false;
  }
}

/* ── the controller registry the jump paths reach through ─────────────── */

const controllers = new WeakMap<HTMLElement, VirtualReaderController>();

/** ReaderPane owns one controller per virtualized scroller, keyed by it. */
export function registerVirtualController(
  container: HTMLElement,
  controller: VirtualReaderController,
): void {
  controllers.set(container, controller);
}

export function unregisterVirtualController(container: HTMLElement): void {
  if (controllers.get(container)) controllers.delete(container);
}

/**
 * The single entry point every scroll-destination path funnels through
 * (jumpToHeading, handleSearchJump, reading-position restore, bookmark and
 * wikilink anchor jumps, and the split-mode editor -> reader sync apply).
 *
 * It ensures the target block is materialized in the window BEFORE the
 * caller resolves elements or applies marks. When the scroller is not
 * virtualized (short documents - the overwhelming majority, and every
 * gated/whole-document chapter) there is no controller and the call is a
 * no-op: those paths find their element in the full DOM exactly as before.
 */
export async function ensureBlockVisible(
  container: HTMLElement | null,
  sourceLine: number | undefined,
  align: "start" | "center" = "start",
): Promise<void> {
  if (!container || typeof sourceLine !== "number" || sourceLine < 1) return;
  const controller = controllers.get(container);
  if (!controller) return;
  await controller.ensureBlockVisible(sourceLine, align);
}

/* ── free helpers (module-private) ────────────────────────────────────── */

function parseBlock(block: RenderedBlock, key: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = block.html;
  const el = template.content.firstElementChild;
  if (el) el.setAttribute(BLOCK_KEY_ATTR, key);
  return template.content;
}

function createSegment(seg: VirtualSegment): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(SLOT_ATTR, seg.slot);
  if (seg.kind === "anchor") el.setAttribute(ANCHOR_ATTR, "");
  else el.setAttribute(SPACER_ATTR, seg.kind === "spacer-top" ? "0" : "END");
  syncSegment(el, seg);
  return el;
}

function syncSegment(el: HTMLElement, seg: VirtualSegment): void {
  if (seg.sourceLine > 0) el.setAttribute("data-source-line", String(seg.sourceLine));
  el.style.height = `${Math.round(seg.height)}px`;
  el.style.minHeight = `${Math.round(seg.height)}px`;
}

function syncSegmentHeight(el: HTMLElement, height: number): void {
  const rounded = Math.round(height);
  const current = parseFloat(el.style.height) || 0;
  if (Math.abs(current - rounded) <= HEIGHT_UPDATE_EPSILON_PX) return;
  el.style.height = `${rounded}px`;
  el.style.minHeight = `${rounded}px`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function raf(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
