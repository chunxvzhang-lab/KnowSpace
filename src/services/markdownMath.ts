import katex from "katex";
import type MarkdownIt from "markdown-it";

/*
 * The math plugin for the markdown pipeline: `$$…$$` and `\(…\)` inline math,
 * `$$…$$` / `\[…\]` / `\begin{…}` blocks, rendered to HTML by KaTeX behind a
 * render cache. Part of the markdown service re-exported by `./markdown`.
 */

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
  push: (
    type: string,
    tag: string,
    nesting: -1 | 0 | 1,
  ) => {
    content: string;
    markup: string;
  };
};

const MAX_KATEX_CACHE_SIZE = 500;
const katexCache = new Map<string, string>();

export function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before("fence", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.inline.ruler.before("escape", "math_inline", mathInlineRule);

  md.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index].content, false);
  md.renderer.rules.math_block = (tokens, index) => `${renderMath(tokens[index].content, true)}\n`;
}

function mathBlockRule(
  state: MarkdownBlockState,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
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
  const cacheKey = `${displayMode ? 1 : 0}:${source}`;
  const cached = katexCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = katex.renderToString(source, {
    displayMode,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });

  if (katexCache.size >= MAX_KATEX_CACHE_SIZE) {
    const firstKey = katexCache.keys().next().value;
    if (firstKey !== undefined) katexCache.delete(firstKey);
  }
  katexCache.set(cacheKey, result);
  return result;
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
