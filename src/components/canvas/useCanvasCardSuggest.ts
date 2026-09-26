import { useCallback, useRef, useState } from "react";
import {
  applySlashCommand,
  detectSlashTrigger,
  matchSlashCommands,
  type SlashCommand,
} from "../../services/slashCommands";
import type { CanvasCardSuggestState } from "./CanvasCardView";
import type { CanvasCardSuggestItem } from "./CanvasCardSuggestMenu";

type AllChapters = Array<{ id: string; title: string; src: string; absolutePath?: string }>;

/**
 * The in-card suggestion engine: the `[[` / `/` popup that opens inside a
 * card's textarea while it is being edited.
 *
 * Extracted from CanvasView (wave 6 of the CanvasView decomposition). The
 * popup's state, its trigger detection and the insertions live here; the
 * textarea's keydown wiring stays in the card JSX (`CanvasCardView`) and the
 * `CanvasCardSuggestMenu` portal stays in CanvasView — both consume this
 * hook's returns. The editor draft itself (`editingText`) stays in CanvasView
 * because the document hook's save paths commit it.
 */
type UseCanvasCardSuggestParams = {
  /** The workspace's notes — what `[[` offers. */
  allChapters: AllChapters;
  /** The card editor's live draft (owned by CanvasView). */
  editingText: string;
  /** Writes the draft back; the draft state itself stays in CanvasView. */
  setEditingText: (text: string) => void;
};

export function useCanvasCardSuggest({
  allChapters,
  editingText,
  setEditingText,
}: UseCanvasCardSuggestParams) {
  /**
   * The suggestion popup inside a card's textarea.
   *
   * A card is Markdown like any other, and its editor is a plain textarea, so
   * both of the things the document editor offers while typing have to be offered
   * here too, by the same triggers: `[[` opens the workspace's notes, and `/`
   * opens the slash commands. They share one popup — and, for `/`, the very same
   * command list and trigger rule the document editor uses
   * (`services/slashCommands.ts`), so the two editors cannot drift apart.
   */
  const [cardSuggest, setCardSuggest] = useState<CanvasCardSuggestState | null>(null);
  const cardEditorRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Where the caret is, in screen pixels.
   *
   * The card editor is a monospace textarea inside a transformed canvas world,
   * so the popup is drawn through a portal at fixed coordinates — and the only
   * way to know those is to measure. CJK counts double, which is what a
   * monospace font does with it.
   */
  /**
   * Where the caret is on screen, for a given value and caret index.
   *
   * The value and the caret are passed in rather than read off the textarea: an
   * insertion has already computed them, and the DOM still holds the previous
   * value until React re-renders. Only the layout is read from the element.
   */
  const caretScreenPosition = useCallback(
    (textarea: HTMLTextAreaElement, text: string, caret: number) => {
      const style = getComputedStyle(textarea);
      const value = text.slice(0, caret);
      const lines = value.split("\n");
      const column = Array.from(lines[lines.length - 1] ?? "").reduce(
        (width, ch) => width + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1),
        0,
      );
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`;
      probe.textContent = "0000000000";
      document.body.appendChild(probe);
      const charWidth = probe.getBoundingClientRect().width / 10;
      probe.remove();
      const rect = textarea.getBoundingClientRect();
      const scale = rect.width / textarea.offsetWidth || 1;
      return {
        x: rect.left + (parseFloat(style.paddingLeft) || 0) * scale + column * charWidth * scale,
        y:
          rect.top +
          (parseFloat(style.paddingTop) || 0) * scale +
          (lines.length - 1) * (parseFloat(style.lineHeight) || 20) * scale,
      };
    },
    [],
  );

  /** Notes whose title or file name contains what has been typed so far. */
  const matchCardRefTargets = useCallback(
    (query: string) => {
      const clean = query.trim().toLowerCase();
      return allChapters
        .map((c) => ({
          title: c.title,
          relativePath: c.src,
          absolutePath: c.absolutePath,
        }))
        .filter((t) => {
          if (!clean) return true;
          const title = t.title.toLowerCase();
          const fileName = (t.relativePath.split("/").pop() ?? "").toLowerCase();
          return title.includes(clean) || fileName.includes(clean);
        })
        .slice(0, 8);
    },
    [allChapters],
  );

  /** The rows the popup shows, in the order it shows them. */
  const buildCardSuggestItems = useCallback(
    (kind: "note" | "command", query: string): CanvasCardSuggestItem[] => {
      if (kind === "command") {
        return matchSlashCommands(query).map((cmd) => ({
          key: `command:${cmd.id}`,
          icon: cmd.icon,
          title: cmd.title,
          subtitle: cmd.description,
        }));
      }
      return matchCardRefTargets(query).map((target) => ({
        key: `note:${target.relativePath}:${target.title}`,
        title: target.title,
        subtitle: target.relativePath,
      }));
    },
    [matchCardRefTargets],
  );

  /**
   * Open (or move) the popup for whatever the caret now sits in.
   *
   * Called on every keystroke, and again after an insertion, so picking `[[]]`
   * from the command list offers the notes straight away rather than waiting for
   * the next key — the document editor does the same.
   */
  const openCardSuggestFor = useCallback(
    (textarea: HTMLTextAreaElement, value: string, caret: number) => {
      const before = value.slice(0, caret);
      let kind: "note" | "command" | null = null;
      let query = "";
      let startIndex = 0;

      const wiki = before.match(/\[\[([^\]\n]*)$/);
      if (wiki) {
        kind = "note";
        query = wiki[1];
        startIndex = caret - wiki[0].length;
      } else {
        // The same rule the document editor uses, which is what keeps a slash in
        // the middle of a path or a URL from opening anything.
        const slash = detectSlashTrigger(value, caret);
        if (slash) {
          kind = "command";
          query = slash.query;
          startIndex = slash.startIndex;
        }
      }

      if (!kind || startIndex < 0) {
        setCardSuggest(null);
        return;
      }

      const caretPos = caretScreenPosition(textarea, value, caret);
      setCardSuggest({
        kind,
        query: query.toLowerCase(),
        startIndex,
        selectedIndex: 0,
        items: buildCardSuggestItems(kind, query),
        x: caretPos.x,
        y: caretPos.y,
      });
    },
    [buildCardSuggestItems, caretScreenPosition, setCardSuggest],
  );

  const handleCardEditorChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditingText(e.target.value);
      openCardSuggestFor(
        e.target,
        e.target.value,
        e.target.selectionStart ?? e.target.value.length,
      );
    },
    [openCardSuggestFor, setEditingText],
  );

  /**
   * Put the caret where an insertion left it, and re-open the popup for whatever
   * it landed in — picking `[[]]` from the command list offers the notes straight
   * away rather than waiting for the next key, the way the document editor does.
   *
   * The popup is refreshed before the frame is requested: it is positioned from
   * the value and caret we already have, so it does not have to wait for React to
   * write the new value into the textarea. Only the caret itself has to.
   */
  const commitCardEdit = useCallback(
    (next: string, caret: number) => {
      setEditingText(next);
      const textarea = cardEditorRef.current;
      if (!textarea) return;
      openCardSuggestFor(textarea, next, caret);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    },
    [cardEditorRef, openCardSuggestFor, setEditingText],
  );

  /**
   * Insert whatever row `index` of the open popup stands for.
   *
   * The rows are re-derived from the query rather than carried in the state:
   * both builders are pure and take the query the popup was drawn with, so the
   * inserted row cannot disagree with the row the user was looking at.
   */
  const pickCardSuggest = useCallback(
    (index: number) => {
      const suggest = cardSuggest;
      const textarea = cardEditorRef.current;
      if (!suggest || !textarea) return;
      const caret = textarea.selectionStart ?? editingText.length;

      if (suggest.kind === "command") {
        const command: SlashCommand | undefined = matchSlashCommands(suggest.query)[index];
        if (!command) return;
        const applied = applySlashCommand(
          editingText,
          { query: suggest.query, startIndex: suggest.startIndex },
          caret,
          command,
        );
        commitCardEdit(applied.text, applied.caret);
        return;
      }

      const target = matchCardRefTargets(suggest.query)[index];
      if (!target) return;
      const inserted = `[[${target.title}]]`;
      commitCardEdit(
        `${editingText.slice(0, suggest.startIndex)}${inserted}${editingText.slice(caret)}`,
        suggest.startIndex + inserted.length,
      );
    },
    [cardSuggest, cardEditorRef, commitCardEdit, editingText, matchCardRefTargets],
  );

  /** Move the popup's highlight by `delta`, wrapping at both ends. */
  const moveCardSuggest = useCallback(
    (delta: number) => {
      setCardSuggest((prev) =>
        prev && prev.items.length > 0
          ? {
              ...prev,
              selectedIndex: (prev.selectedIndex + delta + prev.items.length) % prev.items.length,
            }
          : prev,
      );
    },
    [setCardSuggest],
  );

  return {
    cardSuggest,
    setCardSuggest,
    cardEditorRef,
    handleCardEditorChange,
    pickCardSuggest,
    moveCardSuggest,
  };
}
