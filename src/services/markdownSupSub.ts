import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

/*
 * Inline notations wired to the editor's right-click format ribbon:
 * superscript `^text^`, subscript `~text~` (Pandoc / Obsidian style), and
 * highlight `==text==` (the ribbon button has always inserted it; the
 * pipeline never had a rule for it - same story the footnotes had).
 *
 * Semantics, pinned by markdown-supsub.test.ts:
 *  - the content is plain text: it starts with a non-space, ends with a
 *    non-space, never crosses a newline, and may not be empty;
 *  - `~~text~~` stays the built-in strikethrough (a single `~` followed by
 *    another `~` is handed over, never claimed here);
 *  - a caret right after `[` is NOT a superscript: that is the footnote
 *    reference shape `[^1^]`, which (unresolved) must survive as literal
 *    text instead of becoming `[` + sup(1) + `]`;
 *  - a paragraph-trailing ` ^block-id` (KnowSpace block anchor, no closing
 *    caret) never reaches this rule because the closing delimiter is
 *    required - the anchor keeps working;
 *  - highlight content must not start or end with `=`, so `===` runs and
 *    setext-like input never get eaten mid-run;
 *  - content is emitted as a plain text child, so the sanitizer needs
 *    nothing new (sup/sub/mark are in the html profile).
 */

const isSpaceChar = (code: number): boolean => code === 0x20 /* space */ || code === 0x09; /* tab */

function superscriptRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x5e /* ^ */) return false;
  // `[^1^]` unresolved footnote: the caret is preceded by `[`.
  if (pos > 0 && src.charCodeAt(pos - 1) === 0x5b) return false;
  const contentStart = pos + 1;
  if (contentStart >= state.posMax) return false;
  if (isSpaceChar(src.charCodeAt(contentStart))) return false;
  let i = contentStart;
  while (i < state.posMax) {
    const code = src.charCodeAt(i);
    if (code === 0x0a) return false; // never cross a newline
    if (code === 0x5e /* ^ */) {
      if (i === contentStart) return false; // empty
      if (isSpaceChar(src.charCodeAt(i - 1))) return false; // padding space
      break;
    }
    i += 1;
  }
  if (i >= state.posMax) return false; // no closing caret
  if (!silent) {
    const open = state.push("sup_open", "sup", 1);
    open.markup = "^";
    const text = state.push("text", "", 0);
    text.content = src.slice(contentStart, i);
    const close = state.push("sup_close", "sup", -1);
    close.markup = "^";
  }
  state.pos = i + 1;
  return true;
}

function subscriptRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x7e /* ~ */) return false;
  // `~~` is the built-in strikethrough's territory.
  if (src.charCodeAt(pos + 1) === 0x7e) return false;
  const contentStart = pos + 1;
  if (contentStart >= state.posMax) return false;
  if (isSpaceChar(src.charCodeAt(contentStart))) return false;
  let i = contentStart;
  while (i < state.posMax) {
    const code = src.charCodeAt(i);
    if (code === 0x0a) return false;
    if (code === 0x7e /* ~ */) {
      if (i === contentStart) return false;
      if (isSpaceChar(src.charCodeAt(i - 1))) return false;
      break;
    }
    i += 1;
  }
  if (i >= state.posMax) return false;
  if (!silent) {
    const open = state.push("sub_open", "sub", 1);
    open.markup = "~";
    const text = state.push("text", "", 0);
    text.content = src.slice(contentStart, i);
    const close = state.push("sub_close", "sub", -1);
    close.markup = "~";
  }
  state.pos = i + 1;
  return true;
}

function highlightRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x3d /* = */) return false;
  if (src.charCodeAt(pos + 1) !== 0x3d /* = */) return false;
  const contentStart = pos + 2;
  if (contentStart >= state.posMax) return false;
  if (isSpaceChar(src.charCodeAt(contentStart))) return false;
  if (src.charCodeAt(contentStart) === 0x3d) return false; // no `===` runs
  let i = contentStart;
  while (i < state.posMax) {
    const code = src.charCodeAt(i);
    if (code === 0x0a) return false;
    if (code === 0x3d /* = */ && src.charCodeAt(i + 1) === 0x3d) {
      if (i === contentStart) return false;
      if (isSpaceChar(src.charCodeAt(i - 1))) return false;
      if (src.charCodeAt(i - 1) === 0x3d) return false; // no trailing `=` in content
      break;
    }
    i += 1;
  }
  if (i >= state.posMax) return false;
  if (!silent) {
    const open = state.push("mark_open", "mark", 1);
    open.markup = "==";
    const text = state.push("text", "", 0);
    text.content = src.slice(contentStart, i);
    const close = state.push("mark_close", "mark", -1);
    close.markup = "==";
  }
  state.pos = i + 2;
  return true;
}

export function supSubPlugin(md: MarkdownIt): void {
  // After the built-in strikethrough so `~~` is claimed there first, and
  // before emphasis/link: at a bare `^` or `~` none of those rules can
  // match anyway, the anchor only fixes evaluation order for `~~`.
  md.inline.ruler.after("strikethrough", "superscript", superscriptRule);
  md.inline.ruler.after("strikethrough", "subscript", subscriptRule);
  md.inline.ruler.after("strikethrough", "highlight", highlightRule);
  // Open/close tokens render by tag through the default renderer; nothing
  // to customize here.
}
