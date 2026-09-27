import type { FsrsCard, FsrsCardKind } from "./fsrsScheduler";

/*
 * The three flashcard syntaxes KnowSpace recognises, parsed out of a note in
 * source order. Part of the FSRS service re-exported by `./fsrsService`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Syntax parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fenced code blocks are skipped wholesale: a note teaching FSRS syntax would
 * otherwise turn every example into a real card, and code samples containing
 * `::` or `{{c1::…}}` are common.
 *
 * Computed once for the whole note rather than asked per line. The obvious
 * shape — "is line *i* inside a fence?" answered by walking the lines above it —
 * is O(n) per call and O(n²) per note, and it was called for every line by all
 * three extractors: a 2000-line note cost roughly six million fence checks
 * before a single card was looked for. That is the whole reason a vault-sized
 * review froze the window. One pass over the lines answers every query at once.
 *
 * `mask[i]` is the fence state *before* line `i` is read, which is exactly what
 * the per-line walk used to return: a fence marker line is not itself "inside" a
 * fence, and everything between the opening and closing markers is.
 */
function computeFenceMask(lines: string[]): Uint8Array {
  const mask = new Uint8Array(lines.length);
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    mask[i] = fence !== null ? 1 : 0;
    const match = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (!match) continue;
    if (fence === null) fence = match[1][0];
    else if (match[1][0] === fence) fence = null;
  }
  return mask;
}

/** Blocks that must never contribute cards. */
function isInsideMetadata(line: string): boolean {
  return /<!--\s*fsrs/i.test(line);
}

/** Strips markdown emphasis/links so card text reads cleanly in the review UI. */
function cleanCardText(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*>\s?/, "")
    .trim();
}

/**
 * Stable card id.
 *
 * Derived from the kind and the prompt text rather than from the position, so
 * reordering a note — or inserting a card above — does not detach a card from
 * its scheduling history. Only genuine edits to the question reset progress,
 * which is the behaviour a reviewer expects.
 */
export function computeCardId(kind: FsrsCardKind, front: string): string {
  const input = `${kind}\u0000${front.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fsrs-${(hash >>> 0).toString(36)}`;
}

/** `Q: … / A: …` question-answer pairs, with continuation lines on the answer. */
function extractQaPairs(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (fence[i] || isInsideMetadata(lines[i])) continue;

    const question = /^\s*Q[:：]\s*(.+)$/.exec(lines[i]);
    if (!question) continue;

    const front = cleanCardText(question[1]);
    if (!front) continue;

    // The answer may continue over several lines until the next Q:/A: or a
    // blank line followed by another block.
    const answerParts: string[] = [];
    let j = i + 1;
    let started = false;

    for (; j < lines.length; j += 1) {
      const line = lines[j];
      const answerStart = /^\s*A[:：]\s*(.*)$/.exec(line);

      if (answerStart) {
        answerParts.push(answerStart[1]);
        started = true;
        continue;
      }
      if (/^\s*Q[:：]/.test(line)) break;
      if (fence[j]) break;
      if (!started && !line.trim()) continue;
      if (started && !line.trim()) break;
      // Indented or plain continuation lines belong to the answer
      if (started) answerParts.push(line.replace(/^\s{2,}/, ""));
      else break;
    }

    const back = cleanCardText(answerParts.join("\n"));
    if (!back) continue;

    cards.push({ id: computeCardId("qa", front), kind: "qa", front, back, line: i + 1 });
    i = j - 1;
  }

  return cards;
}

/** Inline `front :: back` cards, one per line. */
function extractInlineCards(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence[i] || isInsideMetadata(line)) continue;
    // A QA block body must not be re-read as an inline card
    if (/^\s*[QA][:：]/.test(line)) continue;
    // A cloze carries its own `::` inside `{{c1::…}}` (and a hint after a second
    // `::`), so it would otherwise be captured as an inline card too — the same
    // line producing two cards. `==highlight==` clozes are excluded as well.
    if (/\{\{c\d+::/.test(line) || /==[^=]+==/.test(line)) continue;

    const body = line.replace(/^\s*[-*+]\s+/, "").trim();
    const separator = body.indexOf("::");
    if (separator <= 0) continue;
    // `:::` or more is a directive, not a delimiter
    if (body[separator + 2] === ":") continue;

    const front = cleanCardText(body.slice(0, separator));
    const back = cleanCardText(body.slice(separator + 2));
    if (!front || !back) continue;

    cards.push({ id: computeCardId("inline", front), kind: "inline", front, back, line: i + 1 });
  }

  return cards;
}

/** `{{c1::answer}}` and `==highlight==` clozes. */
function extractClozeCards(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];
  const clozeRe = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g;
  const highlightRe = /==([^=]+)==/g;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence[i] || isInsideMetadata(line)) continue;

    const blanks: string[] = [];
    let matched = false;
    let text = line;

    text = text.replace(clozeRe, (_m, answer: string) => {
      matched = true;
      blanks.push(answer.trim());
      return "[...]";
    });
    // `==highlight==` behaves as a cloze with a single blank
    text = text.replace(highlightRe, (_m, answer: string) => {
      matched = true;
      blanks.push(answer.trim());
      return "[...]";
    });
    if (!matched || blanks.length === 0) continue;

    const front = cleanCardText(text);
    if (!front) continue;

    cards.push({
      id: computeCardId("cloze", front),
      kind: "cloze",
      front,
      back: blanks.join(" / "),
      line: i + 1,
      blanks,
    });
  }

  return cards;
}

/**
 * Extracts every flashcard from a note, in source order.
 *
 * Recognised syntaxes:
 *
 * | Syntax                        | Kind     |
 * | :---------------------------- | :------- |
 * | `Q: …` / `A: …`               | `qa`     |
 * | `front :: back`               | `inline` |
 * | `{{c1::answer}}`, `==answer==`| `cloze`  |
 *
 * Fenced code blocks and existing `<!-- fsrs … -->` metadata are ignored.
 */
export function parseFlashcards(markdown: string): FsrsCard[] {
  if (!markdown || typeof markdown !== "string") return [];

  const lines = markdown.split(/\r?\n/);
  // One pass for all three extractors, rather than each of them asking per line.
  const fence = computeFenceMask(lines);
  const found = [
    ...extractQaPairs(lines, fence),
    ...extractInlineCards(lines, fence),
    ...extractClozeCards(lines, fence),
  ];

  // QA pairs claim whole blocks, so an inline card can only appear on a line the
  // QA parser skipped. Deduplicate by id and restore reading order.
  const seen = new Map<string, FsrsCard>();
  for (const card of found) {
    if (!seen.has(card.id)) seen.set(card.id, card);
  }
  return [...seen.values()].sort((a, b) => a.line - b.line);
}

/** Convenience wrapper: how many cards does this note contain? */
export function countFlashcards(markdown: string): number {
  return parseFlashcards(markdown).length;
}
