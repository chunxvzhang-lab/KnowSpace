import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";
import frontMatterPlugin from "markdown-it-front-matter";
import taskLists from "markdown-it-task-lists";
import { sha256 } from "../core/ids";
import type { RenderedChapter } from "../core/types";
import {
  addHeadingIds,
  extractPlainText,
  optimizeImages,
  rewriteRelativeUrls,
} from "./markdownDom";
import { mathPlugin } from "./markdownMath";
import { blockAnchorPlugin, sourceLineMappingPlugin, wikiLinkPlugin } from "./markdownPlugins";
import {
  buildBlockPlan,
  PROD_FRAGMENT_CONFIG,
  sanitizeBlockPlan,
  serializeBlockUnits,
  toRenderedBlocks,
} from "./markdownBlocks";
import type { BlockGroup } from "./markdownBlocks";

/*
 * The markdown rendering pipeline: one MarkdownIt instance whose plugins and
 * post-processing live in ./markdownPlugins, ./markdownMath and ./markdownDom,
 * with chapter search in ./markdownSearch and the block-granular segmentation
 * (phase 2, wave 2-1) in ./markdownBlocks — all re-exported here so importers
 * keep one entry point.
 */

let capturedFrontMatter = "";
const maxHighlightedCodeLength = 50_000;

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownLanguage);
hljs.registerLanguage("md", markdownLanguage);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("xml", xml);

const MAX_HIGHLIGHT_CACHE_SIZE = 250;
const highlightCache = new Map<string, string>();

const MAX_RENDER_CACHE_SIZE = 30;
const renderedMarkdownCache = new Map<string, RenderedChapter>();

/**
 * 构建渲染管线的一个实例。
 *
 * 生产用下面的模块单例；成本分解 bench（bench-render-breakdown）也走这里
 * 拿同一条管线——复制一份管线配置的基准测的是另一条管线，数字再漂亮也不
 * 代表生产（规则 1）。frontMatter 回调是实例间唯一的差异点，提成参数。
 */
export function buildMarkdownIt(onFrontMatter: (frontMatter: string) => void): MarkdownIt {
  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (source: string, language: string): string => {
      const languageName = normalizeFenceLanguage(language);
      if (isMermaidFence(languageName)) {
        // Store the raw source as base64 so the renderer reads it back without
        // any HTML-entity distortion (e.g. --> would become --&gt; if escaped).
        const b64 = btoa(unescape(encodeURIComponent(source)));
        return `<pre class="mermaid" data-mermaid-src="${b64}">${md.utils.escapeHtml(source)}</pre>`;
      }
      const displayLang = languageName || "";
      if (
        source.length <= maxHighlightedCodeLength &&
        languageName &&
        hljs.getLanguage(languageName)
      ) {
        const hlKey = `${languageName}:${source}`;
        const cached = highlightCache.get(hlKey);
        if (cached !== undefined) return cached;
        try {
          const highlighted = `<pre class="hljs" data-language="${displayLang}"><code class="language-${displayLang}">${hljs.highlight(source, { language: languageName }).value}</code></pre>`;
          if (highlightCache.size >= MAX_HIGHLIGHT_CACHE_SIZE) {
            const firstKey = highlightCache.keys().next().value;
            if (firstKey !== undefined) highlightCache.delete(firstKey);
          }
          highlightCache.set(hlKey, highlighted);
          return highlighted;
        } catch {
          // Fall back to escaping below.
        }
      }
      return `<pre class="hljs" data-language="${displayLang}"><code class="language-${displayLang}">${md.utils.escapeHtml(source)}</code></pre>`;
    },
  })
    .use(sourceLineMappingPlugin)
    .use(mathPlugin)
    .use(blockAnchorPlugin)
    .use(wikiLinkPlugin)
    .use(taskLists, { enabled: true, label: true })
    .use(frontMatterPlugin, onFrontMatter);

  md.disable("lheading");
  return md;
}

const markdown: MarkdownIt = buildMarkdownIt((frontMatter) => {
  capturedFrontMatter = frontMatter;
});

const cardMarkdownCache = new Map<string, string>();
const MAX_CARD_CACHE_SIZE = 250;

/**
 * Renders concise, sanitized HTML for infinite canvas text cards.
 * Preserves headings, lists, task list checkboxes, inline code, bold, links.
 * Cached to ensure buttery-smooth 60fps canvas panning and dragging.
 */
export function renderCardMarkdown(source: string): string {
  if (!source || typeof source !== "string") return "";
  const cached = cardMarkdownCache.get(source);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    const raw = markdown.render(source);
    result = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true, mathMl: true },
      ADD_TAGS: ["input", "annotation", "semantics"],
      ADD_ATTR: [
        "type",
        "checked",
        "disabled",
        "class",
        "data-source-line",
        "target",
        "rel",
        "href",
        "data-wikilink-target",
        "data-wikilink-label",
      ],
    }) as string;
  } catch {
    result = DOMPurify.sanitize(source) as string;
  }

  if (cardMarkdownCache.size >= MAX_CARD_CACHE_SIZE) {
    const firstKey = cardMarkdownCache.keys().next().value;
    if (firstKey !== undefined) cardMarkdownCache.delete(firstKey);
  }
  cardMarkdownCache.set(source, result);
  return result;
}

/*
 * Permanent pipeline marks for the render long-task (plan §6.3 / phase-2 决策数据).
 *
 * These three measures are unconditional: performance.mark/measure costs ~µs,
 * negligible next to the 100ms+ segments they bracket, and having the anatomy
 * of every render in the real browser timeline is the point (the jsdom bench
 * only gives direction, not Chromium magnitudes).
 *
 * Buffer discipline: before each new pair we clear the previous marks and the
 * measure of the same name, so the timeline buffer holds exactly the LATEST
 * render of each segment (user-timing entries would otherwise accumulate and
 * the browser's buffer overflow would silently drop the oldest — we do not
 * want the harness to read a stale render's number). Consequently
 * getEntriesByName(name, "measure") yields at most one entry per segment:
 * in the typing scenario the render that lands after the 350ms debounce IS
 * the long-task's render, i.e. the one whose anatomy we want.
 */
function perfMarkable(): boolean {
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

function perfMeasured<T>(name: string, fn: () => T): T {
  if (!perfMarkable()) return fn();
  const start = `${name}:start`;
  const end = `${name}:end`;
  performance.clearMarks(start);
  performance.clearMarks(end);
  performance.clearMeasures(name);
  performance.mark(start);
  try {
    return fn();
  } finally {
    // finally: a throwing segment still gets an end mark + measure, so a
    // broken render shows up as a real (failed) span instead of missing data.
    performance.mark(end);
    performance.measure(name, start, end);
  }
}

export async function renderMarkdown(
  source: string,
  baseUrl = window.location.href,
): Promise<RenderedChapter> {
  const cacheKey = `${baseUrl}:::${source}`;
  const cached = renderedMarkdownCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  capturedFrontMatter = "";
  const checksumPromise = sha256(source);
  // Wave 2-1 (block-granular preview): the parse span still brackets the
  // whole synchronous parse — markdown-it cannot segment cheaper than that,
  // and the harness's typing_parse_max_ms keeps its meaning — but the parse
  // now also cuts the token stream into per-block groups, so the sanitize
  // span below can work block by block.
  const plan = perfMeasured("ks:md-render-parse", () => buildBlockPlan(markdown, source));
  const { fragment, groups } = perfMeasured("ks:md-render-sanitize", () => {
    if (plan.mode === "whole") {
      // Today's exact path, byte for byte (documents that cannot be
      // segmented from the token stream at all: empty, or a level-0 hidden
      // token — front matter). PROD_FRAGMENT_CONFIG is the same options
      // object literal the whole-document call always passed.
      return {
        fragment: DOMPurify.sanitize(plan.raw, PROD_FRAGMENT_CONFIG) as unknown as DocumentFragment,
        groups: null as BlockGroup[] | null,
      };
    }
    // Adaptive per-block sanitize (./markdownBlocks): a settle render after
    // typing re-sanitizes the ONE block whose raw HTML changed and replays
    // the rest from the content-addressed cache; a cold document takes one
    // whole-document pass (which is cheaper than N small ones) and back-fills
    // that same cache; an unsafe block (raw HTML bleeding across blocks)
    // degrades to today's whole-document path without blocks. The warm
    // path's joined sanitized HTML — byte-equal to a whole-document sanitize
    // by the two segmentation properties — is parsed once with plain
    // innerHTML (native parse, no scrubbing pass).
    const sanitized = sanitizeBlockPlan(plan.groups);
    if (sanitized.mode === "cold") {
      return { fragment: sanitized.fragment, groups: plan.groups as BlockGroup[] | null };
    }
    if (sanitized.mode === "unsafe") {
      return {
        fragment: DOMPurify.sanitize(
          sanitized.raw,
          PROD_FRAGMENT_CONFIG,
        ) as unknown as DocumentFragment,
        groups: null as BlockGroup[] | null,
      };
    }
    const buildTemplate = document.createElement("template");
    buildTemplate.innerHTML = sanitized.joined;
    const blockFragment = document.createDocumentFragment();
    blockFragment.append(buildTemplate.content);
    return { fragment: blockFragment, groups: plan.groups as BlockGroup[] | null };
  });
  // Bracketing choice (unchanged): the measured dom span covers addHeadingIds
  // → reading the final HTML — all of it synchronous main-thread DOM work.
  // In block mode the final HTML is the concat of the block units cut from
  // the same post-processed fragment, i.e. the same serializer over the same
  // nodes; sha256 stays awaited OUTSIDE every measured span.
  const { html, headings, plainText, hasMermaid, frontMatter, blocks } = perfMeasured(
    "ks:md-render-dom",
    () => {
      const headings = addHeadingIds(fragment);
      rewriteRelativeUrls(fragment, baseUrl);
      optimizeImages(fragment);
      const plainText = extractPlainText(fragment);
      const hasMermaid = Boolean(fragment.querySelector("pre.mermaid"));
      const frontMatter = parseFrontMatter(capturedFrontMatter);
      const template = document.createElement("template");
      template.content.append(fragment);
      // Blocks are the post-processed fragment cut at its top-level element
      // boundaries — one element per token group, heading ids/URL rewrites
      // already applied. When the boundary check fails (embed splits, dropped
      // comments) there are no blocks and `html` is read whole as before.
      const units = groups ? serializeBlockUnits(template.content, groups) : null;
      const segmented = units && groups ? toRenderedBlocks(units, groups) : null;
      return {
        html: segmented ? segmented.html : template.innerHTML,
        headings,
        plainText,
        hasMermaid,
        frontMatter,
        blocks: segmented?.blocks,
      };
    },
  );
  const result: RenderedChapter = {
    html,
    headings,
    frontMatter,
    checksum: await checksumPromise,
    plainText,
    hasMermaid,
    ...(blocks ? { blocks } : {}),
  };

  if (renderedMarkdownCache.size >= MAX_RENDER_CACHE_SIZE) {
    const firstKey = renderedMarkdownCache.keys().next().value;
    if (firstKey !== undefined) renderedMarkdownCache.delete(firstKey);
  }
  renderedMarkdownCache.set(cacheKey, result);
  return result;
}

function parseFrontMatter(frontMatter: string): Record<string, unknown> | null {
  if (!frontMatter.trim()) return null;
  try {
    const parsed = yaml.load(frontMatter);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeFenceLanguage(language: string): string {
  return language.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

function isMermaidFence(language: string): boolean {
  return (
    language === "mermaid" || language === "mmd" || language === "mindmap" || language === "mermind"
  );
}

export { extractExcerpt, findInChapter } from "./markdownSearch";
export { extractHeadingsFromSource, findHeadingLineInSource } from "./markdownDom";
export {
  buildBlockPlan,
  isSelfContainedHtml,
  PROD_FRAGMENT_CONFIG,
  sanitizeBlockGroups,
  sanitizeBlockPlan,
} from "./markdownBlocks";
export type { BlockGroup, BlockPlan, BlockSanitize } from "./markdownBlocks";
