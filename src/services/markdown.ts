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
import katex from "katex";
import MarkdownIt from "markdown-it";
import frontMatterPlugin from "markdown-it-front-matter";
import taskLists from "markdown-it-task-lists";
import { sha256, uniqueSlug } from "../core/ids";
import type { Heading, RenderedChapter, SearchResult } from "../core/types";
import { parseSearchQuery } from "./searchIndexService";

let capturedFrontMatter = "";
const maxHighlightedCodeLength = 50_000;

type MarkdownBlockToken = {
  block: boolean;
  content: string;
  markup: string;
  map: [number, number] | null;
};

type MarkdownBlockState = {
  bMarks: number[];
  eMarks: number[];
  line: number;
  src: string;
  tShift: number[];
  push: (type: string, tag: string, nesting: -1 | 0 | 1) => MarkdownBlockToken;
};

type MarkdownInlineState = {
  pos: number;
  src: string;
  push: (type: string, tag: string, nesting: -1 | 0 | 1) => {
    content: string;
    markup: string;
  };
};

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

function sourceLineMappingPlugin(md: MarkdownIt) {
  md.core.ruler.push("source_line_mapping", (state) => {
    for (const token of state.tokens) {
      if (token.map) {
        if (token.nesting === 1) {
          token.attrSet("data-source-line", String(token.map[0] + 1));
          token.attrSet("data-source-line-end", String(token.map[1]));
        } else if (token.nesting === 0 && (token.type === "fence" || token.type === "code_block" || token.type === "hr")) {
          token.attrSet("data-source-line", String(token.map[0] + 1));
          token.attrSet("data-source-line-end", String(token.map[1]));
        }
      }
    }
  });

  const prevFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"` : "";
    const rendered = prevFence ? prevFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<pre")) {
      return rendered.replace("<pre", `<pre${lineAttr}`);
    }
    return rendered;
  };

  const prevCodeBlock = md.renderer.rules.code_block;
  md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"` : "";
    const rendered = prevCodeBlock ? prevCodeBlock(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<pre")) {
      return rendered.replace("<pre", `<pre${lineAttr}`);
    }
    return rendered;
  };

  const prevHr = md.renderer.rules.hr;
  md.renderer.rules.hr = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lineAttr = token.map ? ` data-source-line="${token.map[0] + 1}" data-source-line-end="${token.map[1]}"` : "";
    const rendered = prevHr ? prevHr(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    if (lineAttr && rendered.startsWith("<hr")) {
      return rendered.replace("<hr", `<hr${lineAttr}`);
    }
    return rendered;
  };
}

const markdown: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (source: string, language: string): string => {
    const languageName = normalizeFenceLanguage(language);
    if (isMermaidFence(languageName)) {
      // Store the raw source as base64 so the renderer reads it back without
      // any HTML-entity distortion (e.g. --> would become --&gt; if escaped).
      const b64 = btoa(unescape(encodeURIComponent(source)));
      return `<pre class="mermaid" data-mermaid-src="${b64}">${markdown.utils.escapeHtml(source)}</pre>`;
    }
    const displayLang = languageName || "";
    if (source.length <= maxHighlightedCodeLength && languageName && hljs.getLanguage(languageName)) {
      try {
        return `<pre class="hljs" data-language="${displayLang}"><code class="language-${displayLang}">${hljs.highlight(source, { language: languageName }).value}</code></pre>`;
      } catch {
        // Fall back to escaping below.
      }
    }
    return `<pre class="hljs" data-language="${displayLang}"><code class="language-${displayLang}">${markdown.utils.escapeHtml(source)}</code></pre>`;
  },
})
  .use(sourceLineMappingPlugin)
  .use(mathPlugin)
  .use(blockAnchorPlugin)
  .use(wikiLinkPlugin)
  .use(taskLists, { enabled: true, label: true })
  .use(frontMatterPlugin, (frontMatter: string) => {
    capturedFrontMatter = frontMatter;
  });

markdown.disable("lheading");

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

  let result = "";
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

export async function renderMarkdown(source: string, baseUrl = window.location.href): Promise<RenderedChapter> {
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
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  }) as unknown as DocumentFragment;
  const headings = addHeadingIds(fragment);
  rewriteRelativeUrls(fragment, baseUrl);
  optimizeImages(fragment);
  const plainText = extractPlainText(fragment);
  const hasMermaid = Boolean(fragment.querySelector("pre.mermaid"));
  const frontMatter = parseFrontMatter(capturedFrontMatter);
  const template = document.createElement("template");
  template.content.append(fragment);
  return {
    html: template.innerHTML,
    headings,
    frontMatter,
    checksum: await checksumPromise,
    plainText,
    hasMermaid,
  };
}

type SourceBlock = {
  startLine: number;
  endLine: number;
  text: string;
};

function parseSourceBlocks(sourceMarkdown: string): SourceBlock[] {
  const lines = sourceMarkdown.split("\n");
  const blocks: SourceBlock[] = [];
  let inCodeBlock = false;
  let currentBlockLines: string[] = [];
  let currentStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fences
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        // Flush previous block
        if (currentBlockLines.length > 0) {
          blocks.push({
            startLine: currentStartLine,
            endLine: lineNumber - 1,
            text: currentBlockLines.join("\n"),
          });
          currentBlockLines = [];
        }
        inCodeBlock = true;
        currentStartLine = lineNumber;
        currentBlockLines.push(line);
      } else {
        // Closing code fence
        currentBlockLines.push(line);
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      currentBlockLines.push(line);
      continue;
    }

    // Blank line indicates paragraph boundary
    if (trimmed === "") {
      if (currentBlockLines.length > 0) {
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
      }
      continue;
    }

    // Headings are independent single-line blocks
    if (trimmed.startsWith("#")) {
      if (currentBlockLines.length > 0) {
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
      }
      blocks.push({
        startLine: lineNumber,
        endLine: lineNumber,
        text: line,
      });
      continue;
    }

    // Regular line in paragraph/list/table
    if (currentBlockLines.length === 0) {
      currentStartLine = lineNumber;
    }
    currentBlockLines.push(line);
  }

  if (currentBlockLines.length > 0) {
    blocks.push({
      startLine: currentStartLine,
      endLine: lines.length,
      text: currentBlockLines.join("\n"),
    });
  }

  return blocks;
}

function nearestHeadingForLine(lines: string[], headings: Heading[], targetLine: number): Heading | undefined {
  for (let i = targetLine - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("#")) {
      const headingText = line.replace(/^#+\s*/, "").trim();
      const matchedHeading = headings.find((h) => h.text.toLowerCase() === headingText.toLowerCase());
      if (matchedHeading) return matchedHeading;
      return {
        id: uniqueSlug(headingText, new Map()),
        text: headingText,
        level: line.match(/^#+/)?.[0].length ?? 1,
      };
    }
  }
  return headings[0];
}

export function findInChapter(
  query: string,
  plainText: string,
  headings: Heading[],
  sourceMarkdown?: string,
): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const parsed = parseSearchQuery(q);
  if (parsed.isEmpty) return [];
  const qLower = q.toLowerCase();

  const results: SearchResult[] = [];

  if (sourceMarkdown) {
    const lines = sourceMarkdown.split("\n");
    const blocks = parseSourceBlocks(sourceMarkdown);

    // If structured filters exist (tag:#, link:[[, "phrase", -exclude)
    if (parsed.hasFilters) {
      for (let bIdx = 0; bIdx < blocks.length && results.length < 50; bIdx++) {
        const block = blocks[bIdx];
        const blockText = block.text;
        const blockLower = blockText.toLowerCase();

        // Check exclusions
        if (parsed.excludeTerms.some((ex) => blockLower.includes(ex))) {
          continue;
        }

        // Check phrases
        if (parsed.phrases.some((p) => !blockLower.includes(p.toLowerCase()))) {
          continue;
        }

        // Check tags
        if (parsed.tags.some((t) => !blockLower.includes(`#${t}`))) {
          continue;
        }

        // Check links
        if (parsed.links.some((l) => !blockLower.includes(`[[${l}`))) {
          continue;
        }

        // Check include terms
        if (parsed.includeTerms.some((t) => !blockLower.includes(t.toLowerCase()))) {
          continue;
        }

        let firstPos = 0;
        let primaryMatchText = q;
        if (parsed.phrases.length > 0) {
          firstPos = blockLower.indexOf(parsed.phrases[0].toLowerCase());
          primaryMatchText = parsed.phrases[0];
        } else if (parsed.tags.length > 0) {
          firstPos = blockLower.indexOf(`#${parsed.tags[0]}`);
          primaryMatchText = `#${parsed.tags[0]}`;
        } else if (parsed.links.length > 0) {
          firstPos = blockLower.indexOf(`[[${parsed.links[0]}`);
          primaryMatchText = `[[${parsed.links[0]}]]`;
        } else if (parsed.includeTerms.length > 0) {
          firstPos = blockLower.indexOf(parsed.includeTerms[0].toLowerCase());
          primaryMatchText = parsed.includeTerms[0];
        }
        if (firstPos === -1) firstPos = 0;

        const heading = nearestHeadingForLine(lines, headings, block.startLine);
        const start = Math.max(0, firstPos - 40);
        const end = Math.min(blockText.length, firstPos + primaryMatchText.length + 100);

        let category: SearchResult["category"] = "text";
        if (parsed.tags.length > 0) category = "tag";
        else if (parsed.links.length > 0) category = "link";
        else if (parsed.phrases.length > 0) category = "phrase";

        results.push({
          id: `block-${block.startLine}-${block.endLine}`,
          index: firstPos,
          matchIndex: results.length,
          lineNumber: block.startLine,
          lineEndNumber: block.endLine,
          lineOffset: firstPos,
          query: q,
          title: heading?.text ?? (block.startLine === block.endLine ? `第 ${block.startLine} 行` : `第 ${block.startLine}-${block.endLine} 行`),
          headingId: heading?.id,
          excerpt: compactWhitespace(blockText.length > 180 ? blockText.slice(start, end) : blockText),
          matchedText: blockText.slice(firstPos, firstPos + primaryMatchText.length),
          matchCountInBlock: 1,
          category,
        });
      }
      if (results.length > 0) return results;
    }

    const qLower = q.toLowerCase();
    for (let bIdx = 0; bIdx < blocks.length && results.length < 50; bIdx++) {
      const block = blocks[bIdx];
      const blockText = block.text;
      const blockLower = blockText.toLowerCase();

      const firstPos = blockLower.indexOf(qLower);
      if (firstPos === -1) continue;

      // Count occurrences in this block
      let occurrences = 0;
      let p = 0;
      while ((p = blockLower.indexOf(qLower, p)) !== -1) {
        occurrences++;
        p += Math.max(1, q.length);
      }

      const heading = nearestHeadingForLine(lines, headings, block.startLine);
      const start = Math.max(0, firstPos - 40);
      const end = Math.min(blockText.length, firstPos + q.length + 100);

      results.push({
        id: `block-${block.startLine}-${block.endLine}`,
        index: firstPos,
        matchIndex: results.length,
        lineNumber: block.startLine,
        lineEndNumber: block.endLine,
        lineOffset: firstPos,
        query: q,
        title: heading?.text ?? (block.startLine === block.endLine ? `第 ${block.startLine} 行` : `第 ${block.startLine}-${block.endLine} 行`),
        headingId: heading?.id,
        excerpt: compactWhitespace(blockText.length > 180 ? blockText.slice(start, end) : blockText),
        matchedText: blockText.slice(firstPos, firstPos + q.length),
        matchCountInBlock: occurrences,
      });
    }
    if (results.length > 0) return results;
  }

  const paragraphs = plainText.split(/\n+/);
  let globalOffset = 0;
  for (let pIdx = 0; pIdx < paragraphs.length && results.length < 50; pIdx++) {
    const para = paragraphs[pIdx].trim();
    if (!para) continue;
    const paraLower = para.toLowerCase();
    const firstPos = paraLower.indexOf(qLower);
    if (firstPos !== -1) {
      let occurrences = 0;
      let p = 0;
      while ((p = paraLower.indexOf(qLower, p)) !== -1) {
        occurrences++;
        p += Math.max(1, q.length);
      }
      const heading = nearestHeadingForOffset(headings, plainText, globalOffset + firstPos);
      const start = Math.max(0, firstPos - 40);
      const end = Math.min(para.length, firstPos + q.length + 100);
      results.push({
        id: `para-${pIdx}`,
        index: globalOffset + firstPos,
        matchIndex: results.length,
        headingId: heading?.id,
        query: q,
        title: heading?.text ?? "章节匹配",
        excerpt: compactWhitespace(para.length > 180 ? para.slice(start, end) : para),
        matchedText: para.slice(firstPos, firstPos + q.length),
        matchCountInBlock: occurrences,
      });
    }
    globalOffset += paragraphs[pIdx].length + 1;
  }
  return results;
}

export function extractExcerpt(container: HTMLElement, activeHeadingId?: string): string {
  const start = activeHeadingId ? container.querySelector(`#${CSS.escape(activeHeadingId)}`) : null;
  const text =
    start?.nextElementSibling?.textContent ??
    start?.textContent ??
    firstVisibleParagraph(container)?.textContent ??
    "已保存位置";
  return compactWhitespace(text).slice(0, 150);
}

function addHeadingIds(fragment: DocumentFragment): Heading[] {
  const seen = new Map<string, number>();
  const headings = Array.from(fragment.querySelectorAll("h1, h2, h3")).map((node) => {
    const element = node as HTMLElement;
    const text = compactWhitespace(element.textContent ?? "");
    const id = uniqueSlug(text, seen);
    element.id = id;
    element.setAttribute("data-heading-id", id);
    const rawLine = element.getAttribute("data-source-line");
    const lineNum = rawLine ? parseInt(rawLine, 10) : undefined;
    return {
      id,
      text,
      level: Number(element.tagName.slice(1)),
      line: lineNum && !Number.isNaN(lineNum) && lineNum > 0 ? lineNum : undefined,
    };
  });
  fragment.querySelectorAll("a[href^='http']").forEach((node) => {
    const anchor = node as HTMLAnchorElement;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  });
  return headings;
}

export function extractHeadingsFromSource(source: string): Heading[] {
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  const lines = source.split("\n");
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      if (level <= 3) {
        const cleanText = match[2]
          .replace(/[*_~`]/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
        const text = compactWhitespace(cleanText || match[2]);
        const id = uniqueSlug(text, seen);
        headings.push({ id, text, level, line: i + 1 });
      }
    }
  }
  return headings;
}

export function findHeadingLineInSource(source: string, targetHeading: Heading): number {
  if (typeof targetHeading.line === "number" && targetHeading.line > 0) {
    return targetHeading.line;
  }
  const lines = source.split("\n");
  let inCodeBlock = false;
  const targetText = targetHeading.text.trim().toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2]
        .replace(/[*_~`]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim()
        .toLowerCase();
      if (level === targetHeading.level && (rawText === targetText || rawText.includes(targetText) || targetText.includes(rawText))) {
        return i + 1; // 1-indexed line number
      }
    }
  }
  return -1;
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

function rewriteRelativeUrls(fragment: DocumentFragment, baseUrl: string): void {
  fragment.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = image.getAttribute("src");
    if (src && isRelativeUrl(src)) image.setAttribute("src", new URL(src, baseUrl).toString());
  });
  fragment.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href && isRelativeUrl(href) && !href.startsWith("#")) {
      anchor.setAttribute("href", new URL(href, baseUrl).toString());
    }
  });
}

function optimizeImages(fragment: DocumentFragment): void {
  fragment.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    if (!image.hasAttribute("loading")) image.setAttribute("loading", "lazy");
    if (!image.hasAttribute("decoding")) image.setAttribute("decoding", "async");
    if (!image.hasAttribute("referrerpolicy")) image.setAttribute("referrerpolicy", "no-referrer");
    if (!image.hasAttribute("draggable")) image.setAttribute("draggable", "false");
    image.classList.add("md-image");
    const parent = image.parentElement;
    if (parent && parent.tagName === "P" && isStandaloneImageParagraph(parent, image)) {
      image.classList.add("md-image-block");
    } else {
      image.classList.add("md-image-inline");
    }
  });
}

function isStandaloneImageParagraph(parent: HTMLElement, image: HTMLImageElement): boolean {
  return Array.from(parent.childNodes).every(
    (node) => node === image || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()),
  );
}

function isRelativeUrl(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
}

function normalizeFenceLanguage(language: string): string {
  return language.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

function isMermaidFence(language: string): boolean {
  return language === "mermaid" || language === "mmd" || language === "mindmap" || language === "mermind";
}

function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before("fence", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.inline.ruler.before("escape", "math_inline", mathInlineRule);

  md.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index].content, false);
  md.renderer.rules.math_block = (tokens, index) => `${renderMath(tokens[index].content, true)}\n`;
}

function mathBlockRule(state: MarkdownBlockState, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const firstLine = state.src.slice(start, max);
  const trimmed = firstLine.trim();

  const block = trimmed.startsWith("$$")
    ? collectDelimitedBlock(state, startLine, endLine, "$$", "$$")
    : trimmed.startsWith("\\[")
      ? collectDelimitedBlock(state, startLine, endLine, "\\[", "\\]")
      : collectEnvironmentBlock(state, startLine, endLine);

  if (!block) return false;
  if (silent) return true;

  const token = state.push("math_block", "div", 0);
  token.block = true;
  token.content = normalizeMathEnvironment(block.content.trim());
  token.markup = block.markup;
  token.map = [startLine, block.nextLine];
  state.line = block.nextLine;
  return true;
}

function mathInlineRule(state: MarkdownInlineState, silent: boolean): boolean {
  const marker = state.src[state.pos];
  const isParenMath = state.src.startsWith("\\(", state.pos);
  if (marker !== "$" && !isParenMath) return false;

  const opener = isParenMath ? "\\(" : "$";
  const closer = isParenMath ? "\\)" : "$";
  if (opener === "$" && state.src[state.pos + 1] === "$") return false;
  if (opener === "$" && !isValidDollarOpen(state.src, state.pos)) return false;

  const close = findClosingMathDelimiter(state.src, state.pos + opener.length, closer);
  if (close === -1) return false;
  if (opener === "$" && !isValidDollarClose(state.src, close)) return false;

  const content = state.src.slice(state.pos + opener.length, close);
  if (!content.trim() || content.includes("\n")) return false;

  if (!silent) {
    const token = state.push("math_inline", "span", 0);
    token.content = content.trim();
    token.markup = opener;
  }
  state.pos = close + closer.length;
  return true;
}

function collectDelimitedBlock(
  state: MarkdownBlockState,
  startLine: number,
  endLine: number,
  opener: string,
  closer: string,
): { content: string; markup: string; nextLine: number } | null {
  const lines: string[] = [];
  let line = startLine;
  let first = getLine(state, line).trim();
  if (!first.startsWith(opener)) return null;
  first = first.slice(opener.length);

  const sameLineClose = findUnescaped(first, closer);
  if (sameLineClose !== -1) {
    return {
      content: first.slice(0, sameLineClose),
      markup: opener,
      nextLine: startLine + 1,
    };
  }

  if (first.trim()) lines.push(first);
  line += 1;
  while (line < endLine) {
    const current = getLine(state, line);
    const closeIndex = findUnescaped(current, closer);
    if (closeIndex !== -1) {
      const beforeClose = current.slice(0, closeIndex);
      if (beforeClose.trim()) lines.push(beforeClose);
      return {
        content: lines.join("\n"),
        markup: opener,
        nextLine: line + 1,
      };
    }
    lines.push(current);
    line += 1;
  }
  return null;
}

function collectEnvironmentBlock(
  state: MarkdownBlockState,
  startLine: number,
  endLine: number,
): { content: string; markup: string; nextLine: number } | null {
  const first = getLine(state, startLine).trim();
  const match = first.match(/^\\begin\{([a-zA-Z*]+)\}/);
  if (!match) return null;
  const environment = match[1];
  const lines: string[] = [];
  let line = startLine;
  while (line < endLine) {
    const current = getLine(state, line);
    lines.push(current);
    if (current.includes(`\\end{${environment}}`)) {
      return {
        content: lines.join("\n"),
        markup: environment,
        nextLine: line + 1,
      };
    }
    line += 1;
  }
  return null;
}

function getLine(state: MarkdownBlockState, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function renderMath(source: string, displayMode: boolean): string {
  return katex.renderToString(source, {
    displayMode,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });
}

function normalizeMathEnvironment(source: string): string {
  const trimmed = source.trim();
  const equation = trimmed.match(/^\\begin\{equation\*?\}([\s\S]*)\\end\{equation\*?\}$/);
  if (equation) return equation[1].trim();

  const align = trimmed.match(/^\\begin\{align\*?\}([\s\S]*)\\end\{align\*?\}$/);
  if (align) return `\\begin{aligned}${align[1]}\\end{aligned}`;

  const gather = trimmed.match(/^\\begin\{gather\*?\}([\s\S]*)\\end\{gather\*?\}$/);
  if (gather) return `\\begin{gathered}${gather[1]}\\end{gathered}`;

  return trimmed;
}

function findClosingMathDelimiter(source: string, start: number, delimiter: string): number {
  let index = start;
  while (index < source.length) {
    const found = source.indexOf(delimiter, index);
    if (found === -1) return -1;
    if (!isEscaped(source, found)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

function findUnescaped(source: string, delimiter: string): number {
  let index = 0;
  while (index < source.length) {
    const found = source.indexOf(delimiter, index);
    if (found === -1) return -1;
    if (!isEscaped(source, found)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

function isValidDollarOpen(source: string, position: number): boolean {
  const next = source[position + 1];
  const previous = source[position - 1];
  return Boolean(next && !/\s/.test(next) && previous !== "\\");
}

function isValidDollarClose(source: string, position: number): boolean {
  const previous = source[position - 1];
  const next = source[position + 1];
  return Boolean(previous && !/\s/.test(previous) && !/[0-9]/.test(next ?? ""));
}

function isEscaped(source: string, position: number): boolean {
  let slashes = 0;
  let cursor = position - 1;
  while (cursor >= 0 && source[cursor] === "\\") {
    slashes += 1;
    cursor -= 1;
  }
  return slashes % 2 === 1;
}

function extractPlainText(fragment: DocumentFragment): string {
  return compactWhitespace(fragment.textContent ?? "");
}

function nearestHeadingForOffset(
  headings: Heading[],
  plainText: string,
  offset: number,
): Heading | undefined {
  let selected: Heading | undefined;
  for (const heading of headings) {
    const headingIndex = plainText.toLowerCase().indexOf(heading.text.toLowerCase());
    if (headingIndex <= offset && headingIndex !== -1) {
      selected = heading;
    }
  }
  return selected;
}

function firstVisibleParagraph(container: HTMLElement): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>("p, li, blockquote")).find(
    (item) => item.textContent?.trim(),
  ) ?? null;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function blockAnchorPlugin(md: MarkdownIt): void {
  const blockRegex = /\s\^([a-zA-Z0-9_-]+)$/;
  md.core.ruler.push("block_anchor", (state) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type === "inline" && blockToken.children && blockToken.children.length > 0) {
        const lastChild = blockToken.children[blockToken.children.length - 1];
        if (lastChild && lastChild.type === "text" && blockRegex.test(lastChild.content)) {
          const match = lastChild.content.match(blockRegex);
          if (match) {
            const blockId = match[1];
            // Remove the ^blockId from visible text
            lastChild.content = lastChild.content.replace(blockRegex, "").trimEnd();

            // Push anchor token
            const anchorToken = new (state.Token as any)("block_anchor", "span", 0);
            anchorToken.attrs = [
              ["id", `^${blockId}`],
              ["class", "block-anchor"],
              ["data-block-id", blockId],
              ["title", `块引用指纹: ^${blockId} (点击复制块引用)`],
            ];
            anchorToken.meta = { blockId };
            blockToken.children.push(anchorToken);
          }
        }
      }
    }
  });

  md.renderer.rules.block_anchor = (tokens, idx) => {
    const token = tokens[idx];
    const blockId = token.meta?.blockId || token.attrGet("data-block-id") || "";
    return `<span id="^${blockId}" class="block-anchor" data-block-id="${blockId}" title="块引用指纹: ^${blockId}"><span class="block-anchor-symbol">^</span><span class="block-anchor-id">${blockId}</span></span>`;
  };
}

function wikiLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state: any, silent: boolean) => {
    let isEmbed = false;
    let start = state.pos;
    if (
      state.src.charCodeAt(start) === 0x21 /* ! */ &&
      state.src.charCodeAt(start + 1) === 0x5b /* [ */ &&
      state.src.charCodeAt(start + 2) === 0x5b /* [ */
    ) {
      isEmbed = true;
      start += 1;
    } else if (
      state.src.charCodeAt(start) !== 0x5b /* [ */ ||
      state.src.charCodeAt(start + 1) !== 0x5b /* [ */
    ) {
      return false;
    }

    const max = state.posMax;
    const close = state.src.indexOf("]]", start + 2);
    if (close === -1 || close > max) return false;

    const raw = state.src.slice(start + 2, close);
    if (raw.includes("\n") || !raw.trim()) return false;

    if (!silent) {
      let target = raw.trim();
      let label = target;
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx !== -1) {
        target = raw.slice(0, pipeIdx).trim();
        label = raw.slice(pipeIdx + 1).trim() || target;
      }

      const isBlockRef = target.includes("#^");
      const token = state.push(isEmbed ? "wikilink_embed" : "wikilink", isEmbed ? "div" : "a", 0);
      token.attrs = [
        ["class", isEmbed ? "wikilink-embed-card" : isBlockRef ? "wikilink wikilink-block" : "wikilink"],
        ["href", `#wikilink:${encodeURIComponent(target)}`],
        ["data-wikilink-target", target],
        ["data-wikilink-label", label],
      ];
      token.content = label;
      token.meta = { isBlockRef, isEmbed };
    }

    state.pos = close + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, index) => {
    const token = tokens[index];
    const target = token.attrGet("data-wikilink-target") || "";
    const label = token.attrGet("data-wikilink-label") || target;
    const isBlockRef = token.meta?.isBlockRef || target.includes("#^");
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(label);
    const encodedTarget = encodeURIComponent(target);

    if (isBlockRef) {
      return `<a class="wikilink wikilink-block" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" data-wikilink-label="${escapedLabel}" title="跳转至块引用: ${escapedTarget}"><span class="wikilink-bracket">[[</span><span class="wikilink-block-symbol">⚓ </span><span class="wikilink-text">${escapedLabel}</span><span class="wikilink-bracket">]]</span></a>`;
    }

    return `<a class="wikilink" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" data-wikilink-label="${escapedLabel}" title="跳转至: ${escapedTarget}"><span class="wikilink-bracket">[[</span><span class="wikilink-text">${escapedLabel}</span><span class="wikilink-bracket">]]</span></a>`;
  };

  md.renderer.rules.wikilink_embed = (tokens, index) => {
    const token = tokens[index];
    const target = token.attrGet("data-wikilink-target") || "";
    const label = token.attrGet("data-wikilink-label") || target;
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(label);
    const encodedTarget = encodeURIComponent(target);

    return `<div class="wikilink-embed-card" data-embed-target="${escapedTarget}"><div class="embed-header"><span class="embed-tag">🔗 块级内联引用</span><a class="embed-source-link" href="#wikilink:${encodedTarget}" data-wikilink-target="${escapedTarget}" title="跳转至原出处">${escapedTarget}</a></div><div class="embed-content">${escapedLabel}</div></div>`;
  };
}

