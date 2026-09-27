import type { FsrsCard, FsrsProgress, FsrsState } from "./fsrsScheduler";
import { parseFlashcards } from "./fsrsCards";

/*
 * The on-disk progress metadata: the `<!-- fsrs:begin … fsrs:end -->` block
 * codec, plus reading the legacy single-line `<!-- fsrs: … -->` comments.
 * Part of the FSRS service re-exported by `./fsrsService`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Progress metadata persistence
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_BEGIN = "<!-- fsrs:begin";
const BLOCK_END = "fsrs:end -->";

const STATE_CODES: Record<FsrsState, string> = {
  new: "new",
  learning: "learning",
  review: "review",
  relearning: "relearning",
};

/** Serialises one card's progress onto a single line. */
function formatLine(id: string, progress: FsrsProgress): string {
  const parts = [
    id,
    `S=${progress.stability.toFixed(4)}`,
    `D=${progress.difficulty.toFixed(4)}`,
    `due=${progress.due}`,
    `reps=${progress.reps}`,
    `lapses=${progress.lapses}`,
    `state=${STATE_CODES[progress.state] ?? "review"}`,
  ];
  if (progress.last) parts.push(`last=${progress.last}`);
  return parts.join(" ");
}

/** Parses one metadata line back into progress. Returns null when malformed. */
function parseLine(line: string): { id: string; progress: FsrsProgress } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("<!--")) return null;

  const tokens = trimmed.split(/\s+/);
  const id = tokens.shift();
  if (!id) return null;

  const fields: Record<string, string> = {};
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq > 0) fields[token.slice(0, eq)] = token.slice(eq + 1);
  }

  const due = fields.due;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due ?? "")) return null;

  const state = fields.state as FsrsState;

  return {
    id,
    progress: {
      stability: Number(fields.S ?? 0) || 0,
      difficulty: Number(fields.D ?? 0) || 0,
      due,
      reps: Number(fields.reps ?? 0) || 0,
      lapses: Number(fields.lapses ?? 0) || 0,
      state: STATE_CODES[state] ? state : "review",
      last: /^\d{4}-\d{2}-\d{2}$/.test(fields.last ?? "") ? fields.last : undefined,
    },
  };
}

/**
 * Reads every card's progress out of a note.
 *
 * Only `<!-- fsrs … -->` comments are consulted, so the result is identical
 * whether or not a third-party editor has touched the file. Older single-line
 * comments (`<!-- fsrs: S=… D=… due=… -->`) are accepted too and matched
 * positionally, which keeps notes written by early builds working.
 */
export function parseFsrsMetadata(
  markdown: string,
  /**
   * The note's cards, when the caller has already parsed them.
   *
   * Only the legacy single-line metadata form needs them — it carries no card id
   * and is matched to cards by order. Passing them in keeps `parseNote` from
   * parsing every note twice, which for a vault-sized source was half the work
   * of the scan.
   */
  parsedCards?: FsrsCard[],
): Map<string, FsrsProgress> {
  const result = new Map<string, FsrsProgress>();
  if (!markdown) return result;

  const lines = markdown.split(/\r?\n/);
  const orphanProgress: FsrsProgress[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock && line.includes(BLOCK_BEGIN)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.includes(BLOCK_END)) {
        inBlock = false;
        continue;
      }
      const parsed = parseLine(line);
      if (parsed) result.set(parsed.id, parsed.progress);
      continue;
    }

    // Legacy single-line form: <!-- fsrs: S=1.2 D=3.4 due=2026-09-22 -->
    const single = /<!--\s*fsrs[:\s]([^>]*?)-->/i.exec(line);
    if (single && !single[1].includes("begin")) {
      // This form carries no card id, so it is parsed purely by field name —
      // running it through parseLine() would treat the leading `S=1.2` as the
      // id and silently drop the stability. Values are matched to cards by
      // order further down, which keeps notes written by early builds readable.
      const fields: Record<string, string> = {};
      for (const token of single[1].replace(/:/g, " ").split(/\s+/)) {
        const eq = token.indexOf("=");
        if (eq > 0) fields[token.slice(0, eq)] = token.slice(eq + 1);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(fields.due ?? "")) {
        const state = fields.state as FsrsState;
        orphanProgress.push({
          stability: Number(fields.S ?? 0) || 0,
          difficulty: Number(fields.D ?? 0) || 0,
          due: fields.due,
          reps: Number(fields.reps ?? 0) || 0,
          lapses: Number(fields.lapses ?? 0) || 0,
          state: STATE_CODES[state] ? state : "review",
          last: /^\d{4}-\d{2}-\d{2}$/.test(fields.last ?? "") ? fields.last : undefined,
        });
      }
    }
  }

  // Attach legacy values to the parsed cards in order.
  if (orphanProgress.length > 0) {
    const cards = parsedCards ?? parseFlashcards(markdown);
    cards.forEach((card, index) => {
      if (index < orphanProgress.length && !result.has(card.id)) {
        result.set(card.id, orphanProgress[index]);
      }
    });
  }

  return result;
}

/** Builds the metadata block body for the given progress map. */
export function serializeFsrsMetadata(
  markdown: string,
  progress: Map<string, FsrsProgress>,
  /** The note's cards, when the caller has already parsed them. */
  parsedCards?: FsrsCard[],
): string {
  // An empty map is not "nothing to say" — it is "nothing to keep", and what the
  // document still holds belongs to cards that are no longer in the map, so it goes.
  // The shortcut that used to be here (`if (progress.size === 0) return markdown`)
  // read the other way round, and undoing a rating is what found it out: taking back
  // the only rating a note had left the row behind, because the map that would have
  // removed it was empty.

  // Only keep entries that still correspond to a card in the note, so deleted cards
  // do not accumulate forever.
  //
  // The check is unconditional, and the first version of it was not: it read
  // `liveIds.size > 0 && !liveIds.has(id)`, which skipped the filter entirely once a
  // note had no cards left — so deleting the last card and then rating anything wrote
  // every row back, leaving a file that claims scheduling history for cards that are
  // not in it. With no cards the block is empty, and an empty block is removed below,
  // which is what that guard was reaching for in the first place.
  const liveIds = new Set((parsedCards ?? parseFlashcards(markdown)).map((c) => c.id));
  const lines: string[] = [];
  for (const [id, value] of progress) {
    if (!liveIds.has(id)) continue;
    lines.push(formatLine(id, value));
  }
  if (lines.length === 0) return stripFsrsMetadata(markdown);

  const block = [BLOCK_BEGIN, ...lines, BLOCK_END].join("\n");
  const stripped = stripFsrsMetadata(markdown).replace(/\s+$/, "");
  return `${stripped}\n\n${block}\n`;
}

/** Removes any fsrs metadata from a note, leaving the body untouched. */
export function stripFsrsMetadata(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock && line.includes(BLOCK_BEGIN)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.includes(BLOCK_END)) inBlock = false;
      continue;
    }
    if (/<!--\s*fsrs[:\s](?!begin)/i.test(line)) continue;
    kept.push(line);
  }

  // Trailing blank lines go too, so a note that has had its last rating taken back
  // reads exactly like a note that was never rated — the block was appended after a
  // blank line, and leaving that blank line behind is a mark of its own.
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

/** Merges updated progress into a note, replacing any previous metadata. */
export function upsertFsrsMetadata(markdown: string, updates: Map<string, FsrsProgress>): string {
  // Parsed once for both halves. Each used to parse the note itself, so rating a
  // single card walked the whole note twice to write one line.
  const cards = parseFlashcards(markdown);
  const merged = parseFsrsMetadata(markdown, cards);
  for (const [id, value] of updates) merged.set(id, value);
  return serializeFsrsMetadata(markdown, merged, cards);
}
