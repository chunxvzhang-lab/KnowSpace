import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GitFork } from "lucide-react";
import type { RenderedBlock, RenderedChapter } from "../core/types";
import {
  createMermaidRenderPool,
  type MermaidTheme,
  type MermaidRenderPool,
} from "../services/mermaid";
import { blockKeyOf, VIRTUAL_MIN_BLOCKS } from "../services/readerVirtual";
import { resolveCheckboxTarget } from "../services/taskListToggle";
import {
  ensureBlockVisible,
  registerVirtualController,
  unregisterVirtualController,
  VirtualReaderController,
} from "./reader/ReaderVirtualDom";
import type { LightboxMedia } from "./MediaLightbox";
import type { WikiLinkTarget } from "./EditorPane";

type ReaderPaneProps = {
  chapter: RenderedChapter | null;
  /**
   * Which document is on screen.
   *
   * Used as the article's React key, so moving to another document remounts the
   * body and its entry animation replays — the content fades in instead of
   * being replaced under the reader's eyes in a single hard frame.
   *
   * Deliberately the document's identity and not its checksum: a checksum
   * changes on every preview re-render, so keying on it would replay the
   * animation on each keystroke.
   */
  documentKey?: string;
  containerRef: React.RefObject<HTMLElement | null>;
  fontScale: number;
  mermaidTheme: MermaidTheme;
  onMermaidError: () => void;
  onElementClick?: (targetElement: HTMLElement, selectedText: string) => void;
  showLineNumbers?: boolean;
  onOpenLightbox?: (media: LightboxMedia) => void;
  wikiLinkTargets?: WikiLinkTarget[];
  onWikiLinkClick?: (target: string) => void;
  backlinksCount?: number;
  onOpenBacklinks?: () => void;
  /**
   * 阅读视图里点了一个任务复选框。参数是它在源码中的位置（块起始行 +
   * 块内序号），换算与翻转由上层（会话层）完成。不传时点击保持原状
   * （只切 DOM 状态，不回写）。
   */
  onToggleTask?: (blockStartLine: number, withinBlockIndex: number) => void;
};

/*
 * Block-granular article insertion (phase 2, wave 2-1).
 *
 * When the chapter carries `blocks` (see services/markdownBlocks), React does
 * not own the article's children at all: the article renders empty and the
 * effect below reconciles the DOM block by block. A block whose identity key
 * and position are unchanged is NOT TOUCHED — no React reconciliation, search
 * <mark>s, mermaid SVGs and code-header decorations survive inside it. Only
 * new/changed blocks are parsed and spliced in, so typing one character in a
 * 100k-character document re-inserts one block, not 2,282.
 *
 * React still owns the article ELEMENT: changing `documentKey` remounts the
 * article (React drops the whole subtree, our appended DOM with it), and the
 * effect repopulates the fresh node (verified: React removes DOM it never
 * created when it removes the parent).
 */

/** Identity of one block: where it came from plus what it now contains. */
function blockKey(block: RenderedBlock): string {
  return blockKeyOf(block);
}

/** One inserted unit: the block's element plus the text nodes that follow it. */
type ExistingUnit = { el: Element | null; nodes: Node[] };

function readExistingUnits(node: HTMLElement): ExistingUnit[] {
  const units: ExistingUnit[] = [];
  const leading: Node[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      const nodes: Node[] = leading.length > 0 ? [...leading.splice(0), child] : [child];
      units.push({ el: child as Element, nodes });
    } else if (units.length > 0) {
      units[units.length - 1].nodes.push(child);
    } else {
      leading.push(child);
    }
  }
  if (leading.length > 0) {
    // Children with no element at all (e.g. leftover text) — one keyless
    // synthetic unit so the replace loop wipes them against the first real
    // block (`el: null` can never match a desired key).
    units.unshift({ el: null, nodes: leading });
  }
  return units;
}

const BLOCK_KEY_ATTR = "data-block-key";

/**
 * Give every undecorated code block under `root` its language badge + copy
 * button. Idempotent (the already-decorated guard), so it runs both over the
 * whole article after a settle render and over each block the virtualizer
 * materializes on scroll — a block scrolled into view late is decorated the
 * moment it exists.
 */
function decorateCodeHeaders(root: HTMLElement): void {
  const preElements = root.querySelectorAll<HTMLPreElement>("pre.hljs, pre:not(.mermaid)");
  preElements.forEach((pre) => {
    if (pre.querySelector(".code-header-bar")) return; // Already decorated

    const rawLang = pre.getAttribute("data-language") || "";
    const trimmedLang = rawLang.trim();
    const displayLang =
      trimmedLang &&
      trimmedLang.toLowerCase() !== "text" &&
      trimmedLang.toLowerCase() !== "plaintext" &&
      trimmedLang.toLowerCase() !== "code"
        ? trimmedLang.toUpperCase()
        : "";

    const headerBar = document.createElement("div");
    headerBar.className = "code-header-bar";
    headerBar.innerHTML = `
      ${displayLang ? `<span class="code-lang-label">${displayLang}</span>` : ""}
      <button type="button" class="code-copy-btn" title="复制代码到剪贴板">📋 复制</button>
    `;

    pre.style.position = "relative";
    pre.insertBefore(headerBar, pre.firstChild);
  });
}

/** Parse one block's HTML with its identity key stamped on the element. */
function blockFragment(block: RenderedBlock, key: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = block.html;
  const el = template.content.firstElementChild;
  if (el) el.setAttribute(BLOCK_KEY_ATTR, key);
  return template.content;
}

/**
 * Splice `article` to the desired block sequence. Unchanged blocks (same key
 * at the same position) are not touched; changed/extra/new blocks are
 * replaced/appended/removed one unit at a time, which preserves document
 * order with minimal mutation. The final DOM is the same sequence a full
 * `innerHTML = html` would parse, even when key pairing is imperfect —
 * pairing only affects how much gets reused, never what ends up on screen.
 */
function reconcileBlocks(node: HTMLElement, blocks: RenderedBlock[]): void {
  const keys = blocks.map(blockKey);
  const units = readExistingUnits(node);
  const shared = Math.min(units.length, keys.length);
  let matches = 0;
  for (let i = 0; i < shared; i += 1) {
    if (units[i].el?.getAttribute(BLOCK_KEY_ATTR) === keys[i]) matches += 1;
  }
  // Mostly-mismatch (fresh mount after a documentKey remount, a document
  // swap, the innerHTML fallback's DOM): one whole parse plus key stamping
  // beats 2,282 tiny template parses and appends. The settle-render case —
  // a warm article with a handful of changed blocks — stays on the splice
  // path below, which is the point of the wave.
  if (matches * 4 < Math.max(units.length, blocks.length)) {
    for (const unit of units) {
      for (const old of unit.nodes) node.removeChild(old);
    }
    node.innerHTML = blocks.map((block) => block.html).join("");
    const elements = node.children;
    for (let i = 0; i < keys.length && i < elements.length; i += 1) {
      elements[i].setAttribute(BLOCK_KEY_ATTR, keys[i]);
    }
    return;
  }
  let i = 0;
  for (; i < shared; i += 1) {
    if (units[i].el?.getAttribute(BLOCK_KEY_ATTR) === keys[i]) continue;
    node.insertBefore(blockFragment(blocks[i], keys[i]), units[i].nodes[0]);
    for (const old of units[i].nodes) node.removeChild(old);
  }
  for (; i < blocks.length; i += 1) {
    node.appendChild(blockFragment(blocks[i], keys[i]));
  }
  for (; i < units.length; i += 1) {
    for (const old of units[i].nodes) node.removeChild(old);
  }
}

export const ReaderPane = memo(function ReaderPane({
  chapter,
  documentKey,
  containerRef,
  fontScale,
  mermaidTheme,
  onMermaidError,
  onElementClick,
  showLineNumbers = true,
  onOpenLightbox,
  wikiLinkTargets,
  onWikiLinkClick,
  backlinksCount,
  onOpenBacklinks,
  onToggleTask,
}: ReaderPaneProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  // Identity of the Mermaid pool currently alive for this article, plus the
  // pool object so newly materialized blocks can hand it their diagrams.
  const mermaidPoolRef = useRef<{ token: string; pool: MermaidRenderPool | null } | null>(null);
  // The window controller while the article is virtualized; null otherwise.
  const controllerRef = useRef<VirtualReaderController | null>(null);
  const [hoverPopover, setHoverPopover] = useState<{
    target: string;
    label: string;
    x: number;
    y: number;
    exists: boolean;
    path?: string;
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  /**
   * What this article node was last painted from. `null` chapter/node entries
   * mean "nothing applied yet". The node is part of the identity because a
   * `documentKey` change remounts a fresh empty article that must be
   * repopulated even when React would otherwise consider the effect's inputs
   * unchanged.
   */
  const appliedRenderRef = useRef<{
    node: HTMLElement;
    chapter: RenderedChapter | null;
    html: string;
    doc: string | null;
  } | null>(null);

  // Which scroller the live controller is registered against (so a swap of
  // document / mount can unregister cleanly before registering anew).
  const registeredContainerRef = useRef<HTMLElement | null>(null);

  // Whether the current chapter takes the virtualized path at all. Short
  // documents, gated documents and block-less chapters keep today's DOM.
  const virtualActive = Boolean(chapter?.blocks && chapter.blocks.length >= VIRTUAL_MIN_BLOCKS);

  /**
   * One materialized block appeared (or a scrolled-in window was built):
   * decorate its code and hand any fresh `pre.mermaid` to the live pool. The
   * pool exists for the whole document (see the Mermaid effect), so a diagram
   * outside the last window is still rendered lazily once its block is.
   */
  const handleMaterialize = useCallback((elements: HTMLElement[]) => {
    for (const el of elements) decorateCodeHeaders(el);
    const pool = mermaidPoolRef.current?.pool;
    if (pool) pool.observe(elements);
  }, []);

  const disposeController = useCallback((container: HTMLElement | null) => {
    const controller = controllerRef.current;
    if (!controller) return;
    const key = container ?? registeredContainerRef.current;
    if (key) unregisterVirtualController(key);
    controller.dispose();
    controllerRef.current = null;
    registeredContainerRef.current = null;
  }, []);

  const applyVirtual = useCallback(
    (container: HTMLElement, node: HTMLElement, blocks: readonly RenderedBlock[]) => {
      const context = { theme: mermaidTheme, fontScale };
      const existing = controllerRef.current;
      if (existing && registeredContainerRef.current === container) {
        existing.sync(node, blocks, context);
        return;
      }
      if (existing) {
        if (registeredContainerRef.current) {
          unregisterVirtualController(registeredContainerRef.current);
        }
        existing.dispose();
      }
      const controller = new VirtualReaderController(container, node, blocks, context, {
        onMaterialize: handleMaterialize,
      });
      controllerRef.current = controller;
      registeredContainerRef.current = container;
      registerVirtualController(container, controller);
    },
    [fontScale, handleMaterialize, mermaidTheme],
  );

  // The virtualized lifecycle: the scroll/resize listeners that move the
  // window, and the print handlers that expand it to the whole document first
  // (beforeprint) and give it back after (afterprint). This effect is inert
  // for every short document - no listeners, no ResizeObserver, no printing
  // hook - which is why 2-2 leaves the vast majority of notes byte-for-byte
  // unchanged. The controller itself is created in the paint effect above;
  // these callbacks read it through the ref so a settle render never detaches
  // a listener mid-scroll.
  useEffect(() => {
    if (!virtualActive) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const handleScroll = () => controllerRef.current?.onScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => controllerRef.current?.onResize());
      resizeObserver.observe(container);
    }

    const handleBeforePrint = () => controllerRef.current?.materializeAll();
    const handleAfterPrint = () => controllerRef.current?.resumeWindowing();
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [containerRef, virtualActive]);

  // Paint the article: block-spliced when the chapter carries blocks,
  // whole-innerHTML exactly as before when it does not (secondary panes, web
  // renders, gated documents). Runs before paint, after React has committed
  // the (empty) article element itself.
  useLayoutEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const applied = appliedRenderRef.current;
    if (
      applied &&
      applied.node === node &&
      applied.chapter === chapter &&
      applied.doc === (documentKey ?? null)
    ) {
      return;
    }
    const html = chapter?.html ?? "";
    appliedRenderRef.current = { node, chapter: chapter ?? null, html, doc: documentKey ?? null };
    const blocks = chapter?.blocks;
    if (blocks) {
      // Virtualized (2-2): a window around the viewport, plus source-line
      // anchors, instead of every block. The controller owns the article's
      // children; scroll / resize / print drive it from the effects below.
      if (blocks.length >= VIRTUAL_MIN_BLOCKS) {
        const container = containerRef.current;
        if (container) {
          applyVirtual(container, node, blocks);
          return;
        }
        // No scroller yet (defensive): fall through to the full splice, which
        // the scroll effect will re-run through the controller once mounted.
      }
      disposeController(containerRef.current);
      reconcileBlocks(node, blocks);
      return;
    }
    disposeController(containerRef.current);
    // Mermaid mutates the sanitized article HTML after React commits it —
    // the old contract that kept `dangerouslySetInnerHTML` keyed on the html
    // string rather than the chapter object. Same guard here: an equal html
    // string is not rewritten, so rendered SVGs survive.
    if (applied && applied.node === node && applied.html === html) return;
    node.innerHTML = html;
  }, [applyVirtual, chapter, containerRef, disposeController, documentKey]);

  const attachReader = useCallback(
    (node: HTMLElement | null) => {
      containerRef.current = node;
    },
    [containerRef],
  );

  const attachArticle = useCallback((node: HTMLElement | null) => {
    articleRef.current = node;
  }, []);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wikilink");
      if (!el) return;
      const target = el.getAttribute("data-wikilink-target");
      const label = el.getAttribute("data-wikilink-label") || target;
      if (!target) return;

      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      const rect = el.getBoundingClientRect();

      const baseDoc = target.split("#")[0].trim();
      const cleanTarget = baseDoc.replace(/\.(md|markdown|canvas)$/i, "").toLowerCase();
      const isAnchorOnly = !cleanTarget && target.includes("#");
      const foundTarget = isAnchorOnly
        ? undefined
        : wikiLinkTargets?.find((t) => {
            const tTitle = t.title.trim().toLowerCase();
            const tFile = (t.relativePath?.split("/").pop() ?? "")
              .replace(/\.(md|markdown|canvas)$/i, "")
              .toLowerCase();
            return tTitle === cleanTarget || tFile === cleanTarget;
          });
      const exists = isAnchorOnly || Boolean(foundTarget);

      hoverTimerRef.current = window.setTimeout(() => {
        setHoverPopover({
          target,
          label: label || target,
          x: Math.min(window.innerWidth - 280, Math.max(12, rect.left)),
          y: rect.bottom + 6,
          exists,
          path: foundTarget?.relativePath,
        });
      }, 240);
    },
    [wikiLinkTargets],
  );

  const handleMouseOut = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const nextEl = e.relatedTarget as HTMLElement | null;
    if (nextEl?.closest(".wikilink-preview-popover") || nextEl?.closest("a.wikilink")) {
      return;
    }
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    setHoverPopover(null);
  }, []);

  // Handle article clicks: code copy, lightbox for images and mermaid charts, wikilinks, selection sync
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 0. A task checkbox flips its own line in the document source. The
      // native toggle is prevented so the DOM state never leads the source
      // by a frame — the re-render after the write is what paints the new
      // state, and a write that is refused leaves the box untouched.
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
        const spot = resolveCheckboxTarget(target);
        if (spot && onToggleTask) {
          e.preventDefault();
          onToggleTask(spot.blockStartLine, spot.withinBlockIndex);
        }
        return;
      }

      // 0. Check if clicking a WikiLink or an Embedded Link
      const wikiLink = target.closest<HTMLAnchorElement>("a.wikilink, a.embed-source-link");
      if (wikiLink) {
        e.preventDefault();
        e.stopPropagation();
        const wikilinkTarget = wikiLink.getAttribute("data-wikilink-target");
        if (wikilinkTarget && onWikiLinkClick) {
          setHoverPopover(null);
          onWikiLinkClick(wikilinkTarget);
        }
        return;
      }

      // 0.5. Check if clicking a block anchor to copy block reference
      const blockAnchor = target.closest<HTMLElement>(".block-anchor");
      if (blockAnchor) {
        e.preventDefault();
        e.stopPropagation();
        const blockId = blockAnchor.getAttribute("data-block-id");
        if (blockId) {
          const refText = `[[#^${blockId}]]`;
          navigator.clipboard.writeText(refText).then(() => {
            blockAnchor.classList.add("is-copied");
            const prevTooltip = blockAnchor.getAttribute("data-tooltip");
            blockAnchor.setAttribute("data-tooltip", `✓ 已复制块引用: ${refText}`);
            const orig = blockAnchor.innerHTML;
            blockAnchor.innerHTML = `<span class="block-anchor-symbol">✓</span><span class="block-anchor-id">已复制</span>`;
            setTimeout(() => {
              blockAnchor.innerHTML = orig;
              blockAnchor.classList.remove("is-copied");
              if (prevTooltip) {
                blockAnchor.setAttribute("data-tooltip", prevTooltip);
              }
            }, 1600);
          });
        }
        return;
      }

      // 0.6. Footnote reference / back-reference jump. The footnote list
      // sits at the document end and a reference can be anywhere, so under
      // block virtualization the target is frequently OUT of the materialized
      // window; a plain anchor click would silently do nothing. Route through
      // the same ensureBlockVisible contract every other jump path uses, then
      // scroll the now-present element into view.
      const footnoteLink = target.closest<HTMLAnchorElement>('a[href^="#fn-"], a[href^="#fnref-"]');
      if (footnoteLink) {
        e.preventDefault();
        e.stopPropagation();
        const scroller = containerRef.current;
        const href = footnoteLink.getAttribute("href") ?? "";
        const id = href.slice(1);
        const jumpLine = Number(
          footnoteLink.getAttribute("data-fn-def-line") ??
            footnoteLink.getAttribute("data-fn-ref-line") ??
            "0",
        );
        if (scroller && id) {
          void (async () => {
            let el = scroller.querySelector<HTMLElement>(`[id="${id.replace(/"/g, '\\"')}"]`);
            if (!el && jumpLine > 0) {
              await ensureBlockVisible(scroller, jumpLine);
              el = scroller.querySelector<HTMLElement>(`[id="${id.replace(/"/g, '\\"')}"]`);
            }
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          })();
        }
        return;
      }

      // 1. Check if clicking code copy button
      const copyBtn = target.closest<HTMLButtonElement>(".code-copy-btn");
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const pre = copyBtn.closest("pre");
        const codeEl = pre?.querySelector("code");
        if (codeEl) {
          const textToCopy = codeEl.textContent || "";
          navigator.clipboard.writeText(textToCopy).then(() => {
            copyBtn.classList.add("is-copied");
            copyBtn.innerHTML = "✓ 已复制";
            window.setTimeout(() => {
              copyBtn.classList.remove("is-copied");
              copyBtn.innerHTML = "📋 复制";
            }, 2000);
          });
        }
        return;
      }

      // 2. Check if clicking an image for Lightbox preview
      if (onOpenLightbox && target.tagName.toLowerCase() === "img") {
        const img = target as HTMLImageElement;
        e.stopPropagation();
        onOpenLightbox({
          type: "image",
          src: img.src,
          alt: img.alt || "图片预览",
          title: img.title || img.alt || "图片预览",
        });
        return;
      }

      // 3. Check if clicking a Mermaid chart for Lightbox preview
      if (onOpenLightbox) {
        const mermaidPre = target.closest<HTMLElement>("pre.mermaid");
        if (mermaidPre) {
          const svg = mermaidPre.querySelector("svg");
          if (svg) {
            e.stopPropagation();
            let serializedSvg: string;
            try {
              serializedSvg = new XMLSerializer().serializeToString(svg);
            } catch {
              serializedSvg = svg.outerHTML;
            }
            onOpenLightbox({
              type: "mermaid",
              svgHtml: serializedSvg,
              title: "Mermaid 架构图预览",
            });
            return;
          }
        }
      }
    },
    [containerRef, onOpenLightbox, onWikiLinkClick, onToggleTask],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!onElementClick) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Don't trigger selection jump if clicking copy button or lightbox media
      if (
        target.closest(".code-header-bar") ||
        target.tagName.toLowerCase() === "img" ||
        target.closest("pre.mermaid")
      ) {
        return;
      }
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString() : "";
      onElementClick(target, selectedText);
    },
    [onElementClick],
  );

  // Decorate code blocks with language badge and copy button. Over the whole
  // article (which, virtualized, is just the current window) on every render;
  // newly materialized blocks are also decorated from the controller's
  // onMaterialize, so this covers settle renders and the fallback path.
  useLayoutEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    decorateCodeHeaders(node);
  }, [chapter?.html]);

  // Mermaid rendering pipeline: a viewport-aware lazy pool (plan §6.3 2-5).
  //
  // The old pass rendered every diagram in the document the moment it mounted;
  // a 30-chart page paid 161-368ms of Mermaid before the reader saw the first
  // viewport settle. Now the pool renders only diagrams approaching the
  // scroller's viewport (plus a preload margin), one per idle task, ordered by
  // distance from the viewport. The end DOM is unchanged — scrolling to a
  // diagram or printing flushes the rest — the work is just deferred.
  //
  // The token guard survives, now carried by a live-pool ref rather than only
  // the article's dataset: a new checksum or theme cancels the old pool
  // (queue dropped, in-flight renders vetoed from committing) before the new
  // pool observes the document, so a stale async pass cannot paint a newer
  // document. A ref-keyed guard also closes the dev-mode hole: React's
  // StrictMode double-mount runs setup → cleanup → setup, and the dataset
  // version said "a pass is scheduled" after the first pass had already been
  // cancelled, silently skipping the second setup and losing every diagram.
  useLayoutEffect(() => {
    const node = articleRef.current;
    if (!node) return undefined;
    // The pool must exist for the WHOLE document when any diagram exists, not
    // just when one happens to be in the current virtual window: a diagram
    // scrolled into view later is handed to `pool.observe` by the controller.
    // For non-virtual chapters the querySelector check is the cheap guard it
    // always was.
    if (!chapter?.hasMermaid && !node.querySelector("pre.mermaid")) return undefined;
    const renderToken = `${chapter?.checksum ?? ""}:${mermaidTheme}`;
    if (mermaidPoolRef.current?.token === renderToken) return undefined;
    mermaidPoolRef.current?.pool?.cancel();
    node.dataset.mermaidRenderToken = renderToken;
    node.dataset.mermaidRenderStatus = "scheduled";
    const pool = createMermaidRenderPool(node, {
      theme: mermaidTheme,
      // The scroller is this pane's own main.reader-pane; diagrams outside it
      // are invisible even though they sit inside the browser window.
      root: node.closest<HTMLElement>(".reader-pane"),
      onComplete: () => {
        node.dataset.mermaidRenderStatus = "done";
      },
      onError: () => {
        node.dataset.mermaidRenderStatus = "error";
        onMermaidError();
      },
    });
    mermaidPoolRef.current = { token: renderToken, pool };
    pool.start();
    // Printing and PDF export capture the *live* DOM: a diagram the reader
    // never scrolled to would otherwise print as raw source text. beforeprint
    // flushes the whole pool; interactive printing leaves ample time for the
    // sequential render, and the pool's no-op skip keeps already-rendered
    // diagrams out of the cost.
    //
    // ORDERING (2-2): the virtualizer's beforeprint listener (registered in
    // the effect above, i.e. earlier, so it fires first) materializes the
    // whole window first; THIS listener runs after it, so `liveDiagrams()`
    // sees every diagram the now-fully-materialized article contains. A
    // beforeprint flush that ran before virtualize-flush would render only
    // the diagrams in the last window and print the rest as raw source.
    const flushForPrint = () => {
      void pool.flush().catch(() => {
        // renderDiagram handles per-diagram failures internally; a throw here
        // is unexpected, and there is nothing left to cancel the print for.
      });
    };
    window.addEventListener("beforeprint", flushForPrint);
    return () => {
      window.removeEventListener("beforeprint", flushForPrint);
      pool.cancel();
      if (mermaidPoolRef.current?.pool === pool) {
        mermaidPoolRef.current = null;
      }
    };
  }, [chapter?.checksum, chapter?.hasMermaid, mermaidTheme, onMermaidError, documentKey]);

  return (
    <main
      className="reader-pane"
      ref={attachReader}
      style={{ "--reader-scale": fontScale } as React.CSSProperties}
    >
      {chapter?.frontMatter ? <FrontMatterCard data={chapter.frontMatter} /> : null}
      {/* No React children and no dangerouslySetInnerHTML: the article's
          content is owned by the block-reconciliation effect above, so a
          settle render mutates one block instead of handing the whole
          article subtree to React. */}
      <article
        key={documentKey}
        className={`markdown-body ${showLineNumbers ? "show-line-numbers" : ""}`}
        ref={attachArticle}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      />
      {backlinksCount !== undefined && backlinksCount > 0 && onOpenBacklinks ? (
        <div
          className="article-backlinks-footer"
          onClick={onOpenBacklinks}
          title="在侧边栏打开反向链接面板"
        >
          <GitFork size={14} className="text-cyan" />
          <span>
            本文已被引用 <strong>{backlinksCount}</strong> 次
          </span>
          <span className="article-backlinks-action">在侧栏查看 ➔</span>
        </div>
      ) : null}
      {hoverPopover && (
        <div
          className="wikilink-preview-popover"
          style={{ left: hoverPopover.x, top: hoverPopover.y }}
          onClick={(e) => {
            e.stopPropagation();
            if (onWikiLinkClick) {
              setHoverPopover(null);
              onWikiLinkClick(hoverPopover.target);
            }
          }}
          onMouseEnter={() => {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => setHoverPopover(null)}
        >
          <div className="wikilink-popover-header">
            <span className="wikilink-popover-icon">🔗</span>
            <span className="wikilink-popover-title">{hoverPopover.label}</span>
          </div>
          {hoverPopover.path ? (
            <div className="wikilink-popover-path">{hoverPopover.path}</div>
          ) : null}
          <div className="wikilink-popover-status">
            {hoverPopover.exists ? (
              <span className="wikilink-status-exists">✓ 文档已存在，点击跳转阅读</span>
            ) : (
              <span className="wikilink-status-missing">⚡ 尚未创建，点击即可自动新建</span>
            )}
          </div>
        </div>
      )}
    </main>
  );
});

function FrontMatterCard({ data }: { data: Record<string, unknown> }) {
  const title = typeof data.title === "string" ? data.title : null;
  const description = typeof data.description === "string" ? data.description : null;
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  return (
    <section className="frontmatter-card">
      {title ? <strong>{title}</strong> : null}
      {description ? <p>{description}</p> : null}
      {tags.length ? (
        <div>
          {tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
