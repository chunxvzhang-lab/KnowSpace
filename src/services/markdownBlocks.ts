import DOMPurify from "dompurify";
import type { Config } from "dompurify";
import type MarkdownIt from "markdown-it";
import type { RenderedBlock } from "../core/types";

/*
 * Block-granular rendering machinery for the markdown pipeline (phase 2,
 * wave 2-1). Part of the markdown service re-exported by `./markdown`.
 *
 * `renderMarkdown` still parses the whole document (markdown-it has no
 * cheaper split — the parse span stays ~25ms), but from there the pipeline
 * works per BLOCK: the top-level token array is cut into groups (nesting
 * returns to 0), each group is rendered to its own raw HTML string, and each
 * string is sanitized through a content-addressed cache keyed by the raw
 * block. A keystroke inside a 100k-char document then re-sanitizes ONE block
 * instead of the whole document, and the reader can splice ONE block instead
 * of replacing the whole article (see ReaderPane).
 *
 * Two correctness properties hold for every document the block path runs on;
 * both are pinned by markdown-blocks.test.ts against real fixtures:
 *
 *  1. concat of the per-group raw renders === `md.render(source)`, byte for
 *     byte. The renderer special-cases the first token of its slice for
 *     newline placement after a PRECEDING HIDDEN token — which only bites
 *     when the hidden token sits at top level in front of a group
 *     (markdown-it-front-matter marks its token hidden). Tight-list
 *     paragraphs are hidden too but never leave their group, so only a
 *     level-0 hidden token fails this.
 *  2. concat of the per-group DOMPurify sanitizations === sanitizing the
 *     joined raw once. DOMPurify parses each input standalone, so a block
 *     that ends with an unclosed raw tag (`<div>` followed by a blank line)
 *     would be auto-closed early and the rest of the document reparented.
 *     That can only happen when a group's HTML is not self-contained, so
 *     the block path requires every group's raw render to be tag-balanced.
 *
 * A document that fails either gate — or whose sanitized block count does not
 * line up 1:1 with its token groups after post-processing (e.g. a wikilink
 * embed whose `<div>` auto-closes its `<p>`, splitting one group into two
 * elements) — falls back to exactly today's whole-document sanitize, byte for
 * byte, and simply carries no `blocks` for the reader to reuse.
 *
 * Gate placement matters for the hot path: the tag-balance scan (property 2)
 * runs where a proven result can be *skipped* — every block whose raw is in
 * the sanitize cache was scanned and sanitized before, so a settle render
 * after typing scans only the one changed block. The scan therefore lives in
 * `sanitizeBlockPlan`, not in the per-render parse.
 */

type Token = ReturnType<MarkdownIt["parse"]>[number];

/** The sanitizer options of the production whole-document render, single source. */
const PROD_SANITIZE_BASE: Config = {
  USE_PROFILES: { html: true, mathMl: true },
  ADD_TAGS: ["annotation", "foreignObject", "semantics"],
  ADD_ATTR: [
    "aria-hidden",
    "aria-label",
    "class",
    "data-language",
    "data-mermaid-src",
    "data-source-line",
    "data-source-line-end",
    "data-wikilink-target",
    "data-wikilink-label",
    "data-block-id",
    "data-embed-target",
    "data-fn-def-line",
    "data-fn-ref-line",
    "decoding",
    "encoding",
    "fetchpriority",
    "id",
    "loading",
    "referrerpolicy",
    "rel",
    "style",
    "target",
    "draggable",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
};

/** Same options, fragment mode — what today's whole-document call passes. */
export const PROD_FRAGMENT_CONFIG: Config = {
  ...PROD_SANITIZE_BASE,
  RETURN_DOM_FRAGMENT: true,
};

export type BlockGroup = {
  /** The group's raw (unsanitized) HTML, exactly as it appears in `md.render`. */
  raw: string;
  /** 1-based source lines of the group's token map; -1 when it carries none. */
  sourceStart: number;
  sourceEnd: number;
};

export type BlockPlan = { mode: "blocks"; groups: BlockGroup[] } | { mode: "whole"; raw: string };

/**
 * Parse `source` and cut it into per-block groups.
 *
 * Returns `{ mode: "whole" }` — the exact `md.render` string, today's path —
 * only when segmentation is impossible from the token stream itself (empty
 * document, level-0 hidden tokens). The per-block tag-balance check (property
 * 2) is deferred to `sanitizeBlockPlan`, where a cached block skips it —
 * otherwise the scan would cost every group on every settle render, which
 * measured as the parse span doubling (25ms -> 52ms on the perf corpus).
 */
export function buildBlockPlan(md: MarkdownIt, source: string): BlockPlan {
  const tokens = md.parse(source, {});
  // Only a TOP-LEVEL hidden token moves newlines between slices (property 1,
  // and markdown-it's renderToken rule "newline after a preceding hidden
  // token" — a hidden token nested inside a group, e.g. the tight-list
  // paragraphs, keeps its `idx > 0` position in every slice, so per-group
  // renders still concatenate byte-exactly). `front_matter` is exactly such a
  // level-0 hidden token.
  if (tokens.length === 0 || tokens.some((token) => token.hidden && token.level === 0)) {
    return { mode: "whole", raw: md.render(source) };
  }
  const groups: BlockGroup[] = [];
  let depth = 0;
  let current: Token[] = [];
  const closeGroup = (): void => {
    groups.push(toBlockGroup(md, current));
    current = [];
  };
  for (const token of tokens) {
    current.push(token);
    depth += token.nesting;
    if (depth === 0) closeGroup();
  }
  if (current.length > 0) closeGroup();
  return { mode: "blocks", groups };
}

function toBlockGroup(md: MarkdownIt, tokens: Token[]): BlockGroup {
  const raw = md.renderer.render(tokens, md.options, {});
  let sourceStart = -1;
  let sourceEnd = -1;
  for (const token of tokens) {
    if (!token.map) continue;
    if (sourceStart < 0) sourceStart = token.map[0] + 1;
    if (token.map[1] > sourceEnd) sourceEnd = token.map[1];
  }
  return { raw, sourceStart, sourceEnd };
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CDATA_RE = /<!\[CDATA\[[\s\S]*?\]\]>/g;
const PROCESSING_RE = /<\?[^>]*\?>/g;
const DECLARATION_RE = /<![^>]*>/g;
const TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/)?>/g;

/**
 * True when `raw` parses identically inside the whole document and inside a
 * standalone fragment: every tag it opens it also closes, no stray close,
 * and no `<` left that is not part of a well-formed (or removed) markup run.
 *
 * Conservative by design — false always means "use the whole-document path",
 * never "render differently". Entities (`&lt;`) are inert here because
 * markdown-it escapes raw `<` in text; literal `<` only comes from real tags.
 */
export function isSelfContainedHtml(raw: string): boolean {
  if (!raw.includes("<")) return true;
  let stripped = raw;
  if (stripped.includes("<!") || stripped.includes("<?")) {
    stripped = stripped
      .replace(HTML_COMMENT_RE, "")
      .replace(CDATA_RE, "")
      .replace(PROCESSING_RE, "")
      .replace(DECLARATION_RE, "");
    // An unterminated `<!--` / `<![CDATA[` / `<?…` is markup I cannot reason
    // about: refuse and let the whole-document path handle it.
    if (stripped.includes("<!")) return false;
    if (!stripped.includes("<")) return true;
  }
  const stack: string[] = [];
  // Residual `<` tracking without slicing: the next raw `<` must always be
  // the start of the next tag match — a `<` strictly BEFORE it is text that
  // the HTML parser may read as a tag opening (property 2 only holds when
  // every `<` is a well-formed tag).
  let nextLt = stripped.indexOf("<");
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(stripped)) !== null) {
    if (nextLt < match.index) return false;
    const end = match.index + match[0].length;
    nextLt = stripped.indexOf("<", end);
    const name = match[2].toLowerCase();
    if (match[1]) {
      // Closing tag: must match the innermost open tag.
      if (stack.pop() !== name) return false;
    } else if (!match[3] && !VOID_TAGS.has(name)) {
      stack.push(name);
    }
  }
  if (nextLt !== -1) return false;
  return stack.length === 0;
}

/**
 * Cache bounds.
 *
 * The byte budget is the binding one (8MB of strings, same family as the
 * existing render caches); the entry cap only exists to keep the Map from
 * holding millions of tiny fragments. It has to clear a whole long document
 * (the 100k-char perf corpus is 2,282 top-level blocks) or the LRU thrashes
 * and every settle re-sanitizes everything — measured: a 400-entry cap made
 * the typing sanitize cost MORE than the whole-document path it replaced.
 */
const MAX_BLOCK_CACHE_ENTRIES = 20_000;
const MAX_BLOCK_CACHE_BYTES = 8 * 1024 * 1024;
/**
 * raw block HTML -> sanitized block HTML.
 *
 * Content-addressed: DOMPurify's output depends only on the input string and
 * the (frozen) config, so entries are valid across documents — the 2,281
 * untouched blocks of a 100k-character document replay from here on every
 * keystroke settle. LRU: `Map` iterates in insertion order, a hit re-inserts
 * at the end, and eviction takes from the front — same discipline as the
 * existing render caches, bounded by entries AND bytes.
 */
const blockSanitizeCache = new Map<string, string>();
let blockCacheBytes = 0;

function rememberBlock(raw: string, clean: string): void {
  blockSanitizeCache.set(raw, clean);
  blockCacheBytes += raw.length + clean.length;
  while (
    blockSanitizeCache.size > MAX_BLOCK_CACHE_ENTRIES ||
    blockCacheBytes > MAX_BLOCK_CACHE_BYTES
  ) {
    const oldestKey = blockSanitizeCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestValue = blockSanitizeCache.get(oldestKey);
    if (oldestValue !== undefined) blockCacheBytes -= oldestKey.length + oldestValue.length;
    blockSanitizeCache.delete(oldestKey);
  }
}

export function sanitizeBlockHtmlCached(raw: string): string {
  const hit = blockSanitizeCache.get(raw);
  if (hit !== undefined) {
    blockSanitizeCache.delete(raw);
    blockSanitizeCache.set(raw, hit);
    return hit;
  }
  const clean = DOMPurify.sanitize(raw, PROD_SANITIZE_BASE);
  rememberBlock(raw, clean);
  return clean;
}

/** Concatenated sanitized block strings — byte-equal to a whole-document
 *  sanitize whenever every group passed `isSelfContainedHtml` (property 2). */
export function sanitizeBlockGroups(groups: BlockGroup[]): string {
  let out = "";
  for (const group of groups) out += sanitizeBlockHtmlCached(group.raw);
  return out;
}

/**
 * Adaptive block sanitization — this is where property 2 is enforced.
 *
 * A block whose raw is already in the cache was scanned and sanitized before
 * (only safe raws ever enter the cache), so a warm settle re-scans NOTHING
 * and re-sanitizes only the changed blocks. A cold document (every block a
 * miss) is cheaper to sanitize the way the old pipeline did — one DOMPurify
 * pass over the whole raw render — than as N small passes (per-call overhead
 * measured worse than the shared work); its blocks are scanned up front and
 * the result is BACK-FILLED into the per-block cache by cutting the
 * sanitized fragment at its element boundaries: by property 2 the run of
 * nodes belonging to one element is exactly the string DOMPurify's string
 * mode would have returned for that block's raw — so warm and cold paths
 * become interchangeable from the next render on.
 *
 * More than two-thirds of the blocks missing counts as cold: a 1-keystroke
 * settle is 1/2282 misses (warm), opening a new document is n/n (cold), and
 * a mixed session edit stays on whichever side of the ratio it falls.
 *
 * `unsafe` means a block failed the balance scan: the caller must sanitize
 * `raw` (the exact `md.render` string, property 1) whole — today's path.
 */
export type BlockSanitize =
  | { mode: "warm"; joined: string }
  | { mode: "cold"; fragment: DocumentFragment }
  | { mode: "unsafe"; raw: string };

export function sanitizeBlockPlan(groups: BlockGroup[]): BlockSanitize {
  let misses = 0;
  for (const group of groups) {
    if (!blockSanitizeCache.has(group.raw)) misses += 1;
  }
  if (misses * 3 > groups.length * 2) {
    // Cold: the whole-document pass is only safe when every block passes the
    // balance scan (property 2); scan once here, then never again for these
    // raws because the cache remembers the verdict via the entry itself.
    for (const group of groups) {
      if (!isSelfContainedHtml(group.raw)) return { mode: "unsafe", raw: concatGroups(groups) };
    }
    const fragment = DOMPurify.sanitize(
      concatGroups(groups),
      PROD_FRAGMENT_CONFIG,
    ) as unknown as DocumentFragment;
    populateBlockCache(groups, fragment);
    return { mode: "cold", fragment };
  }
  let joined = "";
  for (const group of groups) {
    const cached = blockSanitizeCache.get(group.raw);
    if (cached !== undefined) {
      blockSanitizeCache.delete(group.raw);
      blockSanitizeCache.set(group.raw, cached);
      joined += cached;
      continue;
    }
    if (!isSelfContainedHtml(group.raw)) return { mode: "unsafe", raw: concatGroups(groups) };
    joined += sanitizeBlockHtmlCached(group.raw);
  }
  return { mode: "warm", joined };
}

function concatGroups(groups: BlockGroup[]): string {
  let out = "";
  for (const group of groups) out += group.raw;
  return out;
}

/**
 * Cut a container's children into runs: each top-level element plus the
 * nodes that FOLLOW it, with any leading text/comments attached to the
 * first run. Returns null when there are no elements at all.
 */
function collectNodeRuns(container: DocumentFragment): Node[][] | null {
  const nodes = Array.from(container.childNodes);
  let elementCount = 0;
  for (const node of nodes) {
    if (node.nodeType === 1) elementCount += 1;
  }
  if (elementCount === 0) return null;
  const runs: Node[][] = [];
  const leading: Node[] = [];
  let current: Node[] | null = null;
  for (const node of nodes) {
    if (node.nodeType === 1) {
      current = [node];
      runs.push(current);
    } else if (current) {
      current.push(node);
    } else {
      leading.push(node);
    }
  }
  if (leading.length > 0) runs[0].unshift(...leading);
  return runs;
}

/** Serialize each run through a template and put `raw -> runHtml` in the
 *  cache. The nodes are moved out to serialize and moved back afterwards,
 *  so the fragment ends up with exactly the same children in the same
 *  order — the post-processing pass downstream cannot tell this happened. */
function populateBlockCache(groups: BlockGroup[], fragment: DocumentFragment): void {
  if (groups.length === 0) return;
  const runs = collectNodeRuns(fragment);
  if (!runs || runs.length !== groups.length) return;
  const holder = fragment.ownerDocument.createElement("template");
  const serialized: string[] = [];
  for (const run of runs) {
    holder.content.append(...run);
    serialized.push(holder.innerHTML);
    holder.innerHTML = "";
  }
  for (const run of runs) fragment.append(...run);
  for (let i = 0; i < groups.length; i += 1) {
    if (!blockSanitizeCache.has(groups[i].raw)) rememberBlock(groups[i].raw, serialized[i]);
  }
}

/**
 * Cut the post-processed fragment into one serialized unit per token group:
 * each top-level element plus the text/comments that FOLLOW it (trailing, so
 * the unit only changes when its own block or the document end moves — text
 * attached to the *next* block would change a block's key merely because a
 * new block appeared after it). Any text before the first element is attached
 * to the first unit as a prefix.
 *
 * Returns null — keep the whole-document behavior, no block reuse — when the
 * fragment's top-level elements do not line up 1:1 with `groups` (an
 * auto-closing raw tag split a group, or DOMPurify dropped a group's only
 * node). The nodes are MOVED out of `container` while serializing, so on
 * success the caller must not read `container` again — it has no children.
 */
export function serializeBlockUnits(
  container: DocumentFragment,
  groups: BlockGroup[],
): string[] | null {
  const runs = collectNodeRuns(container);
  if (!runs || runs.length !== groups.length) return null;

  const units: string[] = [];
  // Serialize through the fragment's OWN document, not the `document` global:
  // L2 services keep the no-restricted-globals gate (plan 3.5).
  const holder = container.ownerDocument.createElement("template");
  for (const run of runs) {
    holder.content.append(...run);
    units.push(holder.innerHTML);
    holder.innerHTML = "";
  }
  return units;
}

/**
 * Pair the serialized units with their source ranges as `RenderedBlock`s.
 *
 * Each block's `html` is a slice of the joined string, not a second copy of
 * the document (V8 slices share the parent's storage), which is what keeps
 * the tier-1 chapter cache from doubling its HTML bytes.
 */
export function toRenderedBlocks(
  units: string[],
  groups: BlockGroup[],
): { html: string; blocks: RenderedBlock[] } {
  const html = units.join("");
  let offset = 0;
  const blocks = units.map((unit, index) => {
    const start = offset;
    offset += unit.length;
    return {
      html: html.slice(start, offset),
      sourceStart: groups[index].sourceStart,
      sourceEnd: groups[index].sourceEnd,
    };
  });
  return { html, blocks };
}
