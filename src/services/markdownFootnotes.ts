import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";

/*
 * Footnotes: CommonMark-style `[^label]` and Obsidian-style `[^label^]`.
 *
 * The manual advertises footnote rendering (USER_MANUAL 4.x 渲染管线); this
 * is the pipeline that actually delivers it.
 *
 * Semantics, pinned by markdown-footnotes.test.ts:
 *  - A definition is `[^label]: text` at the start of a line (optionally the
 *    `[^label^]:` caret form), followed by any number of continuation lines
 *    indented by 2+ spaces. Definitions are collected at the BLOCK level, so
 *    nothing renders where the definition sits - it only ever shows up in the
 *    footnote list at the end of the document.
 *  - An inline `[^label]` / `[^label^]` whose definition exists renders as a
 *    numbered superscript link. One without a definition stays LITERAL text:
 *    a dead reference reads as what it is instead of a link that goes
 *    nowhere (rule 10: failures must be visible).
 *  - The footnote list is appended only when at least one reference exists,
 *    numbered in first-reference order; unreferenced definitions are dropped
 *    (same as Obsidian).
 *  - Labels may contain spaces (`[^my note]`). Ids replace whitespace with
 *    '-'.
 *  - Every jump element carries the source line of its target
 *    (`data-fn-def-line` on the reference, `data-fn-ref-line` on the
 *    back-reference) so the reader can bring a virtualized-out target into
 *    the window on click (ReaderPane routes these through ensureBlockVisible
 *    exactly like the other jump paths).
 */

type FootnoteDefinition = {
  label: string;
  /** Whitespace folded to '-' for use inside id/href. */
  anchor: string;
  text: string;
  /** [startLine, endLineExclusive] of the definition, 0-based. */
  lines: [number, number];
  /** Reference ordinal (1-based, first-reference order); 0 until assigned. */
  number: number;
  /** 1-based source line of the first reference (backref jump target). */
  firstRefLine: number;
};

type FootnoteEnv = {
  defs: Map<string, FootnoteDefinition>;
  /** Set while the tail rule renders definition text (see ref rule). */
  parsingDefinition?: boolean;
};

const footnoteEnv = (state: { env: Record<string, unknown> }): FootnoteEnv =>
  ((state.env.ksFootnotes as FootnoteEnv | undefined) ??= { defs: new Map() });

const readFootnoteEnv = (state: { env: Record<string, unknown> }): FootnoteEnv | undefined =>
  state.env.ksFootnotes as FootnoteEnv | undefined;

// label: no brackets, no leading/trailing whitespace; a caret before the
// closing bracket is the Obsidian form. Hand-rolled scanning rather than a
// regex literal: the label alphabet trips static-analysis heuristics on
// every reformat, and the reader is clearer either way.
function readFootnoteTag(
  text: string,
  mode: "definition" | "reference",
): { label: string; headEnd: number } | null {
  if (text.charCodeAt(0) !== 0x5b) return null; // [
  if (text.charCodeAt(1) !== 0x5e) return null; // ^
  const close = text.indexOf("]", 2);
  if (close < 0) return null;
  let raw = text.slice(2, close);
  if (raw.endsWith("^")) raw = raw.slice(0, -1); // eat the Obsidian caret
  if (raw.length === 0) return null;
  if (raw !== raw.trim()) return null; // no padding whitespace in the label
  if (mode === "definition") {
    if (text.charAt(close + 1) !== ":") return null;
    return { label: raw, headEnd: close + 2 };
  }
  // A reference must not swallow a definition-like `[^x]:`.
  if (text.charAt(close + 1) === ":") return null;
  return { label: raw, headEnd: close + 1 };
}

const anchorFor = (label: string): string => label.replace(/\s+/g, "-");

function footnoteDefinitionRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (silent) return false; // definitions never interrupt a paragraph
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (start >= max) return false;
  const firstLine: string = state.src.slice(start, max);
  const tag = readFootnoteTag(firstLine, "definition");
  if (!tag) return false;
  const lines: string[] = [firstLine.slice(tag.headEnd).trim()];

  let next = startLine + 1;
  while (next < endLine) {
    const lineEnd = state.eMarks[next];
    if (state.bMarks[next] >= lineEnd) break; // blank ends the definition
    const rest = state.src.slice(state.bMarks[next], lineEnd);
    const indent = rest.length - rest.trimStart().length;
    if (indent < 2) break; // continuation needs 2+ spaces
    lines.push(rest.trim());
    next += 1;
  }

  const env = footnoteEnv(state);
  if (!env.defs.has(tag.label)) {
    // First definition of a label wins; the number is assigned when the tail
    // rule walks the references.
    env.defs.set(tag.label, {
      label: tag.label,
      anchor: anchorFor(tag.label),
      text: lines.filter((line) => line.length > 0).join("\n"),
      lines: [startLine, next],
      number: 0,
      firstRefLine: 0,
    });
  }
  state.line = next;
  return true;
}

function footnoteReferenceRule(state: StateInline, silent: boolean): boolean {
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 0x5b) return false; // [
  if (state.src.charCodeAt(pos + 1) !== 0x5e) return false; // ^
  const tag = readFootnoteTag(state.src.slice(pos), "reference");
  if (!tag) return false;
  const env = readFootnoteEnv(state);
  if (env?.parsingDefinition) return false; // refs inside a definition stay literal
  const def = env?.defs.get(tag.label);
  if (!def) return false; // unresolved -> literal text, not a dead link
  if (!silent) {
    const token = state.push("footnote_ref", "", 0);
    token.meta = { def };
  }
  state.pos += tag.headEnd;
  return true;
}

export function footnotePlugin(md: MarkdownIt): void {
  // Definitions must be consumed before the link-reference rule and before
  // paragraphs absorb the line as lazy continuation.
  md.block.ruler.before("reference", "footnote_def", footnoteDefinitionRule);
  // Registered after wikilink (same before("link") anchor): `[[` is never a
  // footnote and `[^` is never a wiki link, so the two rules cannot both
  // claim an input.
  md.inline.ruler.before("link", "footnote_ref", footnoteReferenceRule);

  const { escapeHtml } = md.utils;
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const def = (tokens[idx] as Token).meta.def as FootnoteDefinition;
    const line = def.lines[0] + 1;
    return (
      `<sup class="footnote-ref" id="fnref-${escapeHtml(def.anchor)}">` +
      `<a href="#fn-${escapeHtml(def.anchor)}" data-fn-def-line="${line}">${def.number}</a></sup>`
    );
  };
  md.renderer.rules.footnote_backref = (tokens, idx) => {
    const def = (tokens[idx] as Token).meta.def as FootnoteDefinition;
    return (
      `<a class="footnote-backref" href="#fnref-${escapeHtml(def.anchor)}"` +
      ` data-fn-ref-line="${def.firstRefLine}" aria-label="返回正文"> ↩</a>`
    );
  };

  // Runs after the inline core rule (pushed last), so every footnote_ref
  // token exists and can be numbered; builds the trailing section as real
  // tokens so the block pipeline groups it as one self-contained unit.
  md.core.ruler.push("footnote_tail", (state: StateCore) => {
    const env = readFootnoteEnv(state);
    if (!env || env.defs.size === 0) return;

    let number = 0;
    const referenced: FootnoteDefinition[] = [];
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== "footnote_ref") continue;
        const def = child.meta.def as FootnoteDefinition;
        if (!def.number) {
          def.number = ++number;
          referenced.push(def);
        }
        if (!def.firstRefLine && token.map) def.firstRefLine = token.map[0] + 1;
      }
    }
    if (referenced.length === 0) return;

    const defs = referenced.slice().sort((a, b) => a.number - b.number);

    const firstDefLine = Math.min(...defs.map((d) => d.lines[0]));
    const lastDefLine = Math.max(...defs.map((d) => d.lines[1]));

    const { Token: TokenCtor } = state;
    const sectionOpen = new TokenCtor("footnotes_open", "div", 1);
    sectionOpen.map = [firstDefLine, lastDefLine];
    sectionOpen.attrSet("class", "footnotes");
    // source_line_mapping already ran, so stamp the mapping manually (the
    // reader's anchor interpolation and jump paths read these).
    sectionOpen.attrSet("data-source-line", String(firstDefLine + 1));
    sectionOpen.attrSet("data-source-line-end", String(lastDefLine));
    const listOpen = new TokenCtor("footnotes_list_open", "ol", 1);
    listOpen.map = sectionOpen.map;

    const items: Token[] = [];
    for (const def of defs) {
      const liOpen = new TokenCtor("footnotes_item_open", "li", 1);
      liOpen.map = [def.lines[0], def.lines[1]];
      liOpen.attrSet("id", `fn-${def.anchor}`);
      liOpen.attrSet("class", "footnote-def");
      liOpen.attrSet("data-source-line", String(def.lines[0] + 1));
      liOpen.attrSet("data-source-line-end", String(def.lines[1]));

      const inlineTokens: Token[] = [];
      env.parsingDefinition = true;
      try {
        md.inline.parse(def.text, md, state.env, inlineTokens);
      } finally {
        env.parsingDefinition = false;
      }
      const backref = new TokenCtor("footnote_backref", "", 0);
      backref.meta = { def };
      backref.map = liOpen.map;
      inlineTokens.push(backref);

      const inline = new TokenCtor("inline", "", 0);
      inline.map = liOpen.map;
      inline.level = 2;
      inline.children = inlineTokens;

      const paraOpen = new TokenCtor("paragraph_open", "p", 1);
      paraOpen.map = liOpen.map;
      const paraClose = new TokenCtor("paragraph_close", "p", -1);
      const liClose = new TokenCtor("footnotes_item_close", "li", -1);
      items.push(liOpen, paraOpen, inline, paraClose, liClose);
    }

    const listClose = new TokenCtor("footnotes_list_close", "ol", -1);
    const sectionClose = new TokenCtor("footnotes_close", "div", -1);

    state.tokens.push(sectionOpen, listOpen, ...items, listClose, sectionClose);
  });
}
