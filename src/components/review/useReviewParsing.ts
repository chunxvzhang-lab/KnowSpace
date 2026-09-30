import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addParsedNote,
  buildQueueFromParsed,
  emptyParsedSource,
  parseNote,
  summarizeParsed,
  type ParsedNote,
  type ParsedReviewSource,
} from "../../services/fsrsService";
import type { ReviewSourceDocument } from "../../services/reviewSources";

/**
 * The parse time slice in ms. 8 is about half a frame on the render thread
 * (see the step loop below). Test seam: `__setParseTimeSlice(0)` finishes the
 * whole parse inside one synchronous step, so a test's first screen is
 * deterministic instead of racing the handoff — under a loaded full suite the
 * slice hands off even for three notes, and the panel's suite kept hitting
 * that intermittent one test at a time. Same pattern as readerVirtual's
 * `__resetHeightTables`.
 */
let parseTimeSliceMs = 8;
export function __setParseTimeSlice(ms: number): void {
  parseTimeSliceMs = ms;
}

/**
 * The parsed notes that belong to the active source, in the order the source lists
 * them.
 *
 * Order matters and is the source's, not the cache's: the first note to carry a card
 * id is the one whose progress and text win, so building this in any other order
 * would change which note a card is attributed to when the same question appears in
 * two documents.
 *
 * `written` is what this panel has already saved into a note. It has to win over the
 * text the source was handed: the Space source is a prop, and the parent's copy of a
 * note cannot know about a rating that happened a moment ago — so without this, the
 * next rating would merge into the note as it was before the review started and the
 * first rating would be silently written away.
 */
function sourceFrom(
  notes: ReviewSourceDocument[],
  cache: Map<string, { content: string; parsed: ParsedNote }>,
  written: Map<string, string>,
): ParsedReviewSource {
  const source = emptyParsedSource();
  for (const note of notes) {
    const entry = cache.get(note.filePath);
    if (!entry) continue;
    const saved = written.get(note.filePath);
    addParsedNote(source, saved === undefined ? entry.parsed : { ...entry.parsed, content: saved });
  }
  return source;
}

type UseReviewParsingParams = {
  /** The documents of the source in use, from `useReviewSource`. */
  activeNotes: ReviewSourceDocument[];
  /** Whether the review is the view on screen; a hidden panel does not parse. */
  active: boolean;
};

/**
 * The parse pipeline: read the active source's notes once, in slices, and publish
 * the parsed source the rest of the review renders from.
 *
 * Extracted from DailyReviewPanel (decomposition of the review view), verbatim —
 * and it owns the parse cache refs (`parsedNotes`, `writtenContent`, `publishedKey`).
 * THE REFS LIVE HERE AND NOWHERE ELSE: they are the shared writers the survey on
 * 2026-09-26 flagged as the panel's knot. Everyone else — the rating/undo hook, the
 * requeue button — reaches them through two stable APIs instead:
 *
 * - `writeNote(path, content)` files what was just saved to a note back into the
 *   cache and republishes; `useReviewRating` calls it after each rating and undo.
 * - `resetCache()` clears the cache for a new round; DailyReviewPanel calls it from
 *   the requeue handler, alongside the session reset in `useReviewRating`.
 *
 * Handing the refs themselves across hooks would let a second writer rebuild a note
 * without bumping `parseRevision` or clearing `publishedKey` — exactly the missed
 * publish that breaks the optimistic-advance invariant.
 */
export function useReviewParsing({ activeNotes, active }: UseReviewParsingParams) {
  /**
   * How far the card-finding has got, when it is running.
   *
   * Declared before the loading state because that state needs it: to the reader,
   * reading the files and finding the cards in them are one wait, and the second is
   * the longer one by far.
   */
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null);
  /**
   * The parsed source, built a few notes at a time.
   *
   * This is the expensive part of the panel, and the reason for its shape. A vault
   * is tens of megabytes and every line of every document has to be looked at; on
   * the render thread that was **7.5 seconds** of a window that did not answer for a
   * 5.8 MB vault, and longer for a real one — the reason a vault-sized source looked
   * like a freeze. Worse, it happened three times over, because the panel parsed
   * every note and then `buildReviewQueue` and `summarize` each parsed them again.
   *
   * So: parse once, in slices, handing the thread back between them and saying how
   * far along it is. Parsed notes are kept by path, so a rating re-parses the one
   * note it wrote to instead of the whole vault, and an array that arrives with a new
   * identity but the same contents costs one comparison rather than a full parse.
   */
  const parsedNotes = useRef(new Map<string, { content: string; parsed: ParsedNote }>());
  /**
   * What this panel last wrote for a note.
   *
   * The Space source is a prop and the vault and folder sources are lists the panel
   * reads once; none of them can know about a rating that happened a moment ago, and
   * two ratings on one note have to land on top of each other rather than on top of
   * the file as it was when the review opened.
   */
  const writtenContent = useRef(new Map<string, string>());
  const publishedKey = useRef<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReviewSource>(() => emptyParsedSource());
  /**
   * Bumped when the cache is edited behind the effect's back.
   *
   * A rating re-parses the one note it wrote to and files it straight into the cache —
   * waiting for the effect to notice would mean publishing on the next render for a
   * reason the effect cannot see. This is the effect being told.
   */
  const [parseRevision, setParseRevision] = useState(0);

  useEffect(() => {
    // Nothing to parse for a view nobody is looking at. The cache is a ref, so
    // it survives the visit and there is nothing to catch up on when the review
    // comes back — this only stops the panel from working while it is hidden.
    if (!active) return undefined;

    let cancelled = false;
    const cache = parsedNotes.current;
    const key = activeNotes.map((note) => note.filePath).join("\u0000");

    const present = new Set(activeNotes.map((note) => note.filePath));
    for (const path of Array.from(cache.keys())) {
      if (!present.has(path)) cache.delete(path);
    }

    const stale = activeNotes.filter((note) => {
      const wanted = writtenContent.current.get(note.filePath) ?? note.content;
      return cache.get(note.filePath)?.content !== wanted;
    });
    if (stale.length === 0) {
      // Same notes, same contents, same order: what is published is still true, and
      // republishing it would re-render the panel for nothing — which, on a source
      // whose array gets a fresh identity on every render, is a loop rather than a
      // saving.
      if (publishedKey.current === key) return undefined;
      setParsed(sourceFrom(activeNotes, cache, writtenContent.current));
      publishedKey.current = key;
      setParseProgress(null);
      return undefined;
    }

    setParseProgress({ done: 0, total: stale.length });
    let index = 0;
    const step = () => {
      if (cancelled) return;
      const startedAt = performance.now();
      // Eight milliseconds is about half a frame: long enough that the parsing is not
      // dominated by the handovers, short enough that the window keeps answering.
      // A slice of 0 or less means "no limit": the whole parse finishes in
      // this one synchronous step (the test seam above).
      while (
        index < stale.length &&
        (parseTimeSliceMs <= 0 || performance.now() - startedAt < parseTimeSliceMs)
      ) {
        const note = stale[index];
        const wanted = writtenContent.current.get(note.filePath) ?? note.content;
        cache.set(note.filePath, {
          content: wanted,
          parsed: parseNote({ path: note.filePath, content: wanted }),
        });
        index += 1;
      }
      if (index < stale.length) {
        setParseProgress({ done: index, total: stale.length });
        setTimeout(step, 0);
        return;
      }
      setParsed(sourceFrom(activeNotes, cache, writtenContent.current));
      publishedKey.current = key;
      setParseProgress(null);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [active, activeNotes, parseRevision]);

  /**
   * Files what was just written to a note back into the panel's own view of it.
   *
   * A rating and an undo both write one note and both know exactly what it now says,
   * and the sources this panel was handed cannot: the Space source is a prop, and the
   * vault and folder lists were read once. Recording it here is what makes a second
   * rating merge on top of the first instead of reverting it, and what makes the
   * queue and the counters say something true about what the reader just did —
   * without re-reading anything.
   */
  const noteWritten = useCallback((filePath: string, content: string) => {
    writtenContent.current.set(filePath, content);
    parsedNotes.current.set(filePath, {
      content,
      parsed: parseNote({ path: filePath, content }),
    });
    publishedKey.current = null;
    setParseRevision((revision) => revision + 1);
  }, []);

  /**
   * Forgets the cache, for a new round.
   *
   * The cache half of the requeue handler (its session half — the rated set, the
   * reveal, the log — is `useReviewRating`'s `resetSession`). A new round reads
   * from the sources as they are: the notes this panel wrote to belong to the
   * sources again, and what was written is still on disk, so nothing is undone by
   * forgetting it here. What it does undo is the panel's own view — without this,
   * a card rated a moment ago would stay out of the round even though the file it
   * came from is the one the round is reading.
   */
  const resetCache = useCallback(() => {
    writtenContent.current.clear();
    parsedNotes.current.clear();
    publishedKey.current = null;
    setParseRevision((revision) => revision + 1);
  }, []);

  /**
   * Everything the render needs, from the finished parse.
   *
   * Cheap by construction: the parsing has happened, and this walks the cards once.
   * The card id → note mapping is needed on every rating, to merge the new
   * scheduling state back into the right file.
   */
  const { queue, stats, sourceMap } = useMemo(() => {
    const sources = new Map<string, { path: string; content: string }>();
    for (const [cardId, note] of parsed.owner) {
      sources.set(cardId, { path: note.path, content: note.content });
    }

    return {
      queue: buildQueueFromParsed(parsed),
      stats: summarizeParsed(parsed),
      sourceMap: sources,
    };
  }, [parsed]);

  return {
    /** Today's queue, from the finished parse. */
    queue,
    stats,
    sourceMap,
    parseProgress,
    /**
     * The write-behind API: the only way in from outside for the cache refs.
     * Stable (`useCallback([])`), so `useReviewRating` can depend on it without
     * re-registering its keyboard listener.
     */
    noteWritten,
    resetCache,
  };
}
