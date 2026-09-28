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

/*
 * The markdown rendering pipeline: one MarkdownIt instance whose plugins and
 * post-processing live in ./markdownPlugins, ./markdownMath and ./markdownDom,
 * with chapter search in ./markdownSearch — all re-exported here so importers
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
  const raw = markdown.render(source);
  const fragment = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, mathMl: true },
    RETURN_DOM_FRAGMENT: true,
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
  }) as unknown as DocumentFragment;
  const headings = addHeadingIds(fragment);
  rewriteRelativeUrls(fragment, baseUrl);
  optimizeImages(fragment);
  const plainText = extractPlainText(fragment);
  const hasMermaid = Boolean(fragment.querySelector("pre.mermaid"));
  const frontMatter = parseFrontMatter(capturedFrontMatter);
  const template = document.createElement("template");
  template.content.append(fragment);
  const result: RenderedChapter = {
    html: template.innerHTML,
    headings,
    frontMatter,
    checksum: await checksumPromise,
    plainText,
    hasMermaid,
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
