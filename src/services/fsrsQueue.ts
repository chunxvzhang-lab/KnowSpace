import {
  createNewProgress,
  currentRetrievability,
  toDateKey,
  type FsrsCard,
  type FsrsProgress,
} from "./fsrsScheduler";
import { parseFlashcards } from "./fsrsCards";
import { parseFsrsMetadata } from "./fsrsMetadata";

/*
 * Review-queue and dashboard helpers: parse each note once, then build the
 * due queue and the header counters from the parsed source. Part of the FSRS
 * service re-exported by `./fsrsService`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Review queue helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A card paired with its current progress, ready for review. */
export interface FsrsQueueItem {
  card: FsrsCard;
  progress: FsrsProgress;
  /** Retrievability right now, for sorting the queue. */
  retrievability: number;
}

/**
 * One note, parsed once.
 *
 * Parsing is the expensive part of a review session — a real vault is tens of
 * megabytes and every line of every document has to be looked at — so it happens
 * once per note and the result is carried around. `buildReviewQueue` and
 * `summarize` take notes rather than parsed notes, and each of them parses
 * everything again: calling the three of them over the same vault used to read it
 * three times over, on the render thread, which is where a large vault froze the
 * window.
 */
export interface ParsedNote {
  path: string;
  content: string;
  cards: FsrsCard[];
  progress: Map<string, FsrsProgress>;
}

/**
 * A source of cards, parsed once.
 *
 * `owner` is the duplicate rule written down: a card's identity is its content, so
 * the same question in two notes is one card, and the first note to carry it is
 * the one whose progress and text win. Both the queue and the counters read this,
 * so they cannot disagree about which note a card belongs to.
 */
export interface ParsedReviewSource {
  notes: ParsedNote[];
  owner: Map<string, ParsedNote>;
}

export function emptyParsedSource(): ParsedReviewSource {
  return { notes: [], owner: new Map() };
}

export function parseNote(note: { path: string; content: string }): ParsedNote {
  // Parsed once and shared with the metadata reader. Both used to call
  // parseFlashcards themselves — and the metadata reader could call it a second
  // time on top of that for legacy notes — so a single note was walked three
  // times over before a card was shown.
  const cards = parseFlashcards(note.content);
  return {
    path: note.path,
    content: note.content,
    cards,
    progress: parseFsrsMetadata(note.content, cards),
  };
}

/**
 * Files one parsed note into a source under construction.
 *
 * Meant to be called once per note while a source is being built — in the panel
 * that happens a few notes at a time, between frames, so that a big vault makes
 * the progress line move rather than the window stop answering.
 */
export function addParsedNote(source: ParsedReviewSource, note: ParsedNote): void {
  source.notes.push(note);
  for (const card of note.cards) {
    if (!source.owner.has(card.id)) source.owner.set(card.id, note);
  }
}

/**
 * Parses a set of notes in one go.
 *
 * The convenience path, for callers that hold every note already and do not need
 * to show progress — tests, mostly. Anything that reads a vault the reader is
 * waiting on should build the source in pieces instead.
 */
export function parseReviewSource(
  notes: Array<{ path: string; content: string }>,
): ParsedReviewSource {
  const source = emptyParsedSource();
  for (const note of notes) addParsedNote(source, parseNote(note));
  return source;
}

/**
 * Today's review queue, from a source that has already been parsed.
 *
 * Cards are ordered by retrievability ascending — the ones most likely to be
 * forgotten come first — with never-seen cards placed ahead of everything else
 * so new material is never starved by a backlog.
 */
export function buildQueueFromParsed(
  source: ParsedReviewSource,
  now = new Date(),
): FsrsQueueItem[] {
  const today = toDateKey(now);
  const items: FsrsQueueItem[] = [];
  const seen = new Set<string>();

  for (const note of source.notes) {
    for (const card of note.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      const entry = note.progress.get(card.id) ?? createNewProgress(today);
      if (entry.due > today) continue;
      items.push({
        card,
        progress: entry,
        retrievability:
          entry.state === "new" || !entry.last
            ? 0
            : currentRetrievability(entry.last, entry.stability, now),
      });
    }
  }

  return items.sort((a, b) => {
    const aNew = a.progress.state === "new" ? 0 : 1;
    const bNew = b.progress.state === "new" ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return a.retrievability - b.retrievability;
  });
}

/**
 * Builds today's review queue from a set of notes.
 *
 * Cards are ordered by retrievability ascending — the ones most likely to be
 * forgotten come first — with never-seen cards placed ahead of everything else
 * so new material is never starved by a backlog.
 *
 * A card's identity is its content (`computeCardId`), so the same question written
 * into two notes is **one card**: the first note that carries it supplies the
 * progress, and the duplicate is not queued again. It was queued twice before, and
 * the panel — which skips a card id it has already rated — could only ever show the
 * first of the two, so the header promised a card the session could not deliver.
 */
export function buildReviewQueue(
  notes: Array<{ path: string; content: string }>,
  now = new Date(),
): FsrsQueueItem[] {
  return buildQueueFromParsed(parseReviewSource(notes), now);
}

/** Aggregate counters for the review panel header. */
export interface FsrsStats {
  total: number;
  due: number;
  fresh: number;
  learning: number;
  review: number;
  /** Cards reviewed at least once, i.e. with a non-zero stability. */
  tracked: number;
}

/**
 * Dashboard counters, from a source that has already been parsed.
 *
 * Counts cards, not occurrences: the same question in two notes is one card, the
 * same way the queue lists it once. Counting it twice made the header disagree with
 * the session — "共 2 张" above a caption that could only ever reach "1 / 1".
 */
export function summarizeParsed(source: ParsedReviewSource, now = new Date()): FsrsStats {
  const stats: FsrsStats = { total: 0, due: 0, fresh: 0, learning: 0, review: 0, tracked: 0 };
  const seen = new Set<string>();

  for (const note of source.notes) {
    for (const card of note.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      stats.total += 1;
      const entry = note.progress.get(card.id);
      if (!entry) {
        stats.fresh += 1;
        stats.due += 1;
        continue;
      }
      if (entry.stability > 0) stats.tracked += 1;
      if (entry.due <= toDateKey(now)) stats.due += 1;
      if (entry.state === "learning" || entry.state === "relearning") stats.learning += 1;
      else if (entry.state === "review") stats.review += 1;
    }
  }

  return stats;
}

/**
 * Summarises a set of notes for the review dashboard.
 *
 * Parses everything it is given, so a caller that is about to build a queue as
 * well should parse once and use the two `…FromParsed` functions instead.
 */
export function summarize(
  notes: Array<{ path: string; content: string }>,
  now = new Date(),
): FsrsStats {
  return summarizeParsed(parseReviewSource(notes), now);
}
