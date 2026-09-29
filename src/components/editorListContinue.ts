import { keymap } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";

/*
 * Enter on a list line continues the list: bullets repeat, ordered numbers
 * bump, checked boxes reset to unchecked, and pressing Enter on an EMPTY
 * item exits the list instead of piling empty markers - the Word/Obsidian
 * behavior. Mid-line Enter keeps CodeMirror's default split, and non-list
 * lines are untouched (the command returns false and the default keymap
 * answers).
 *
 * The decision is a pure function of the state so the tests run without a
 * mounted editor; the keymap below is the thin dispatch half. The line is
 * parsed by hand rather than one regex literal: the marker alphabet trips
 * static-analysis heuristics on every reformat (same as markdownFootnotes).
 */

export type ListContinueEdit =
  { kind: "continue"; insert: string; cursorOffset: number } | { kind: "exit" };

type ListLineParts = { indent: string; marker: string; content: string };

const isSpace = (code: number): boolean => code === 0x20 /* space */ || code === 0x09; /* tab */

function parseListLine(line: string): ListLineParts | null {
  let i = 0;
  while (i < line.length && isSpace(line.charCodeAt(i))) i += 1;
  const indent = line.slice(0, i);

  let marker: string;
  const ch = line.charAt(i);
  if (ch === "-" || ch === "*" || ch === "+") {
    marker = ch;
    i += 1;
  } else {
    let d = i;
    while (d < line.length && line.charCodeAt(d) >= 0x30 && line.charCodeAt(d) <= 0x39) d += 1;
    if (d > i && (line.charAt(d) === "." || line.charAt(d) === ")")) {
      marker = line.slice(i, d + 1);
      i = d + 1;
    } else {
      return null;
    }
  }

  // Optional task checkbox, folded into the marker.
  if (
    line.charAt(i) === "[" &&
    line.charAt(i + 2) === "]" &&
    (line.charAt(i + 1) === " " || line.charAt(i + 1) === "x" || line.charAt(i + 1) === "X")
  ) {
    marker += line.slice(i, i + 3);
    i += 3;
  }

  // Whitespace after the marker (required unless end of line), then an
  // OPTIONAL task checkbox living after that whitespace, then more
  // whitespace, then the content. "-apple" is a word, not a list item
  // (CommonMark agrees).
  let j = i;
  while (j < line.length && isSpace(line.charCodeAt(j))) j += 1;
  if (j === i && j < line.length) return null;
  if (
    line.charAt(j) === "[" &&
    line.charAt(j + 2) === "]" &&
    (line.charAt(j + 1) === " " || line.charAt(j + 1) === "x" || line.charAt(j + 1) === "X")
  ) {
    marker += line.slice(i, j) + line.slice(j, j + 3);
    j += 3;
    let k = j;
    while (k < line.length && isSpace(line.charCodeAt(k))) k += 1;
    if (k === j && k < line.length) return null;
    return { indent, marker, content: line.slice(k) };
  }
  return { indent, marker, content: line.slice(j) };
}

export function listContinueEdit(state: EditorState): ListContinueEdit | null {
  const selection = state.selection.main;
  if (!selection.empty) return null;
  const from = selection.from;
  const line = state.doc.lineAt(from);
  if (from !== line.to) return null; // mid-line: keep the default split
  const parts = parseListLine(line.text);
  if (!parts) return null;
  if (parts.content.trim() === "") return { kind: "exit" };

  const ordered = /^\d+[.)]$/.test(parts.marker)
    ? { digits: parts.marker.slice(0, -1), delim: parts.marker.slice(-1) }
    : null;
  const nextMarker = ordered
    ? `${Number(ordered.digits) + 1}${ordered.delim}`
    : parts.marker.replace("x", " ").replace("X", " ");
  const prefix = `${parts.indent}${nextMarker} `;
  return { kind: "continue", insert: `\n${prefix}`, cursorOffset: 1 + prefix.length };
}

export const listContinueKeymap = keymap.of([
  {
    key: "Enter",
    run: (view) => {
      const edit = listContinueEdit(view.state);
      if (!edit) return false;
      if (edit.kind === "exit") {
        const line = view.state.doc.lineAt(view.state.selection.main.from);
        view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
        return true;
      }
      const from = view.state.selection.main.from;
      view.dispatch({
        changes: { from, insert: edit.insert },
        selection: { anchor: from + edit.cursorOffset },
      });
      return true;
    },
  },
]);
