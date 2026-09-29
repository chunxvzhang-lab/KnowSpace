import { useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import { generateMarkdownTable } from "../../services/tableGenerator";

type UseEditorEditActionsParams = {
  /** The CodeMirror editor the menu was opened on; every action dispatches into it. */
  view: EditorView;
  /** Closes the context menu after an action (or an inert click) completes. */
  onClose: () => void;
  /** Document path, threaded into block-reference links (`[[doc#^block-id]]`). */
  currentFilePath?: string;
  /** Obsidian-style "extract selection to note"; falls back to a `[[...]]` wrap. */
  onExtractToNote?: (selectedText: string, suggestedTitle: string) => void;
  /** Flash-capsule sink; falls back to the clipboard. */
  onSendToFlash?: (text: string) => void;
};

/**
 * The edit primitives and menu actions of the editor context menu.
 *
 * Extracted from EditorContextMenu (decomposition of the context menu): every
 * callback below is the original, moved verbatim, including its dependency
 * array.
 *
 * THE RENDER-TIME SNAPSHOT IS LOAD-BEARING. `selection`, `hasSelection` and
 * `selectedText` are read from `view.state` here, during render — not lazily
 * inside the click handlers. Every action callback closes over the snapshot of
 * the render in which it was created, and this hook re-runs on every render of
 * the menu (submenu opens, clamp nudges, parent updates), so the handlers the
 * user ends up clicking always carry the selection that was current when the
 * menu last rendered. Computing the snapshot inside the callbacks instead would
 * read a *newer* editor state than the tests (and the original) assert against
 * — the mount tests assert dispatch payloads built from exactly this snapshot.
 * The snapshot values are returned so the composition root can keep deriving
 * the word/char footer stats from them, as the original did.
 */
export function useEditorEditActions({
  view,
  onClose,
  currentFilePath,
  onExtractToNote,
  onSendToFlash,
}: UseEditorEditActionsParams) {
  const selection = view.state.selection.main;
  const hasSelection = !selection.empty;
  const selectedText = hasSelection ? view.state.sliceDoc(selection.from, selection.to) : "";
  const docText = view.state.doc.toString();

  // Helper: Toggle wrapping
  const wrapSelection = useCallback(
    (prefix: string, suffix: string = prefix, defaultContent = "文字") => {
      const from = selection.from;
      const to = selection.to;
      const doc = view.state.doc;

      if (hasSelection) {
        // Case 1: selection itself already has the markers at its edges → unwrap
        if (
          selectedText.startsWith(prefix) &&
          selectedText.endsWith(suffix) &&
          selectedText.length >= prefix.length + suffix.length
        ) {
          const inner = selectedText.slice(prefix.length, selectedText.length - suffix.length);
          view.dispatch({
            changes: { from, to, insert: inner },
            selection: { anchor: from, head: from + inner.length },
          });
          view.focus();
          onClose();
          return;
        }
        // Case 2: markers sit just outside the selection in the document → unwrap those
        const preFrom = Math.max(0, from - prefix.length);
        const postTo = Math.min(doc.length, to + suffix.length);
        const textBefore = doc.sliceString(preFrom, from);
        const textAfter = doc.sliceString(to, postTo);
        if (textBefore === prefix && textAfter === suffix) {
          view.dispatch({
            changes: [
              { from: preFrom, to: from, insert: "" },
              { from: to, to: postTo, insert: "" },
            ],
            selection: { anchor: preFrom, head: preFrom + selectedText.length },
          });
          view.focus();
          onClose();
          return;
        }
        // Case 3: not yet wrapped → wrap
        const replacement = `${prefix}${selectedText}${suffix}`;
        view.dispatch({
          changes: { from, to, insert: replacement },
          selection: {
            anchor: from + prefix.length,
            head: from + prefix.length + selectedText.length,
          },
        });
      } else {
        // No selection: detect whether cursor is currently inside markers on this line
        const line = doc.lineAt(from);
        const lineText = line.text;
        const colOffset = from - line.from;
        const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const markerRe = new RegExp(`${escapeRe(prefix)}([\\s\\S]*?)${escapeRe(suffix)}`, "g");
        let match: RegExpExecArray | null;
        let foundMatch: RegExpExecArray | null = null;
        while ((match = markerRe.exec(lineText)) !== null) {
          const matchStart = match.index;
          const matchEnd = match.index + match[0].length;
          if (colOffset >= matchStart && colOffset <= matchEnd) {
            foundMatch = match;
            break;
          }
        }
        if (foundMatch) {
          const absStart = line.from + foundMatch.index;
          const absEnd = line.from + foundMatch.index + foundMatch[0].length;
          const inner = foundMatch[1];
          view.dispatch({
            changes: { from: absStart, to: absEnd, insert: inner },
            selection: { anchor: absStart, head: absStart + inner.length },
          });
        } else {
          const replacement = `${prefix}${defaultContent}${suffix}`;
          view.dispatch({
            changes: { from, to, insert: replacement },
            selection: {
              anchor: from + prefix.length,
              head: from + prefix.length + defaultContent.length,
            },
          });
        }
      }
      view.focus();
      onClose();
    },
    [hasSelection, onClose, selectedText, selection.from, selection.to, view],
  );

  // Helper: Transform line prefix (Heading, list, todo, quote, plain text).
  //
  // The replacement is handed to String.replace so a "$1" in it means what
  // every caller has always intended: the line's leading whitespace, which
  // keeps indentation (Word-style nesting) across a transform. The previous
  // implementation stripped the prefix with `replace(pattern, "")` and then
  // CONCATENATED the replacement - so "$1- " entered the document as literal
  // `$1- ` text, which is exactly the reported bug: right-click list/heading/
  // quote commands produced unrenderable garbage instead of a list.
  // `newPrefix` may also be a function (indent, ordinal) => whole replacement,
  // used by 转为有序列表 to number items 1. 2. 3. as it converts.
  // Whitespace-only lines are skipped: a marker on an empty line is a stray
  // dangling bullet in the preview and splits the list apart.
  const transformLinePrefix = useCallback(
    (prefixPattern: RegExp, newPrefix: string | ((indent: string, ordinal: number) => string)) => {
      const doc = view.state.doc;
      const startLine = doc.lineAt(selection.from);
      const endLine = doc.lineAt(selection.to);
      const changes: { from: number; to: number; insert: string }[] = [];

      let ordinal = 0;
      for (let l = startLine.number; l <= endLine.number; l++) {
        const line = doc.line(l);
        const lineContent = line.text;
        if (lineContent.trim() === "") continue;
        ordinal += 1;
        const insert =
          typeof newPrefix === "string"
            ? lineContent.replace(prefixPattern, newPrefix)
            : lineContent.replace(prefixPattern, (_match: string, ...args: unknown[]) =>
                newPrefix(typeof args[0] === "string" ? args[0] : "", ordinal),
              );
        if (insert !== lineContent) {
          changes.push({ from: line.from, to: line.to, insert });
        }
      }

      if (changes.length > 0) {
        view.dispatch({ changes });
        view.focus();
      }
      onClose();
    },
    [onClose, selection.from, selection.to, view],
  );

  // Helper: Insert text at current cursor
  const insertAtCursor = useCallback(
    (text: string, cursorRelativeOffset?: number) => {
      const from = selection.from;
      const to = selection.to;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: {
          anchor: from + (cursorRelativeOffset ?? text.length),
        },
      });
      view.focus();
      onClose();
    },
    [onClose, selection.from, selection.to, view],
  );

  // Action: Insert Custom Table
  const handleInsertTableDimensions = useCallback(
    (r: number, c: number) => {
      const { markdown, cursorOffset } = generateMarkdownTable(r, c);
      insertAtCursor(markdown, cursorOffset);
    },
    [insertAtCursor],
  );

  // Action: Clipboard Cut
  const handleCut = useCallback(() => {
    if (hasSelection) {
      navigator.clipboard.writeText(selectedText);
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: "" },
      });
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, selectedText, selection.from, selection.to, view]);

  // Action: Clipboard Copy
  const handleCopy = useCallback(() => {
    if (hasSelection) {
      navigator.clipboard.writeText(selectedText);
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, selectedText, view]);

  // Action: Clipboard Paste
  const handlePaste = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: clip },
          selection: { anchor: selection.from + clip.length },
        });
      }
    } catch {
      // ignore clipboard permission error
    }
    view.focus();
    onClose();
  }, [onClose, selection.from, selection.to, view]);

  // Action: Extract selection to new note (Obsidian flagship)
  const handleExtractToNote = useCallback(() => {
    const defaultTitle = selectedText
      ? selectedText
          .split(/\r?\n/)[0]
          .replace(/[#*`_[\]]/g, "")
          .trim()
          .slice(0, 30)
      : "新笔记";
    if (onExtractToNote) {
      onExtractToNote(selectedText, defaultTitle || "未命名笔记");
    } else {
      wrapSelection("[[", "]]", defaultTitle || "新笔记");
    }
    onClose();
  }, [onClose, onExtractToNote, selectedText, wrapSelection]);

  // Action: Create Block Reference (Obsidian style ^block)
  const handleCreateBlockRef = useCallback(() => {
    const doc = view.state.doc;
    const line = doc.lineAt(selection.from);
    const lineText = line.text;
    const match = lineText.match(/\s\^([a-zA-Z0-9_-]+)$/);
    let blockId: string;

    if (match) {
      blockId = match[1];
    } else {
      blockId = "block-" + Math.random().toString(36).slice(2, 8);
      const insertPos = line.to;
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: ` ^${blockId}` },
      });
    }

    const docName = (currentFilePath?.split(/[\\/]/).pop() || "文档").replace(/\.md$/i, "");
    const refLink = `[[${docName}#^${blockId}]]`;
    navigator.clipboard.writeText(refLink);
    view.focus();
    onClose();
  }, [currentFilePath, onClose, selection.from, view]);

  // Action: Send to Flash Capsule
  const handleSendToFlash = useCallback(() => {
    const content = hasSelection ? selectedText : view.state.doc.lineAt(selection.from).text;
    if (content.trim()) {
      if (onSendToFlash) {
        onSendToFlash(content.trim());
      } else {
        navigator.clipboard.writeText(content.trim());
      }
    }
    view.focus();
    onClose();
  }, [hasSelection, onClose, onSendToFlash, selectedText, selection.from, view]);

  return {
    // Render-time selection snapshot (see the contract note above).
    selection,
    hasSelection,
    selectedText,
    docText,
    // Primitives
    wrapSelection,
    transformLinePrefix,
    insertAtCursor,
    // Actions
    handleInsertTableDimensions,
    handleCut,
    handleCopy,
    handlePaste,
    handleExtractToNote,
    handleCreateBlockRef,
    handleSendToFlash,
  };
}
