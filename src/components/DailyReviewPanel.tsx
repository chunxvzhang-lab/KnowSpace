import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RotateCw,
  GraduationCap,
  Eye,
  CheckCircle2,
  Inbox,
  Keyboard,
  AlertCircle,
  FolderOpen,
  Undo2,
} from "lucide-react";
import {
  addParsedNote,
  buildQueueFromParsed,
  emptyParsedSource,
  parseFlashcards,
  parseFsrsMetadata,
  parseNote,
  review,
  serializeFsrsMetadata,
  summarizeParsed,
  upsertFsrsMetadata,
  type FsrsCardKind,
  type FsrsProgress,
  type FsrsRating,
  type ParsedNote,
  type ParsedReviewSource,
} from "../services/fsrsService";
import { useVaultCards } from "../hooks/useVaultCards";
import { MAX_REVIEW_FOLDERS, useReviewFolders } from "../hooks/useReviewFolders";
import { describeScanTruncation, describeScanUnreadable } from "../core/scanNotice";
import type { ReviewSourceDocument } from "../services/reviewSources";

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
  written: Map<string, string>
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

type DailyReviewPanelProps = {
  /**
   * Documents from the parent's own source — the Space folder, in practice.
   *
   * Typed as the two fields the review actually uses rather than as the full
   * summary the timeline works with, so a knowledge-base chapter can be passed
   * in as-is — it has no date, time or tag list for the caller to invent.
   */
  notes: ReviewSourceDocument[];
  /**
   * The document the reader has open, as a card source of its own.
   *
   * `dirty` is what the review needs to know about it: a rating writes into the file,
   * and a document saved afterwards from a buffer loaded before the review would write
   * that progress away. Null when nothing is open, or when what is open is not a
   * Markdown document.
   */
  currentDocument?: { filePath: string; content: string; dirty: boolean } | null;
  loading?: boolean;
  onOpenNoteFile?: (filePath: string) => void;
  /** Called after a rating is persisted, so the parent can refresh its summary. */
  onProgressSaved?: () => void;
  /**
   * Rendered under the title row. The parent passes its tab switcher in, so the
   * review view keeps the same navigation as the timeline and todo views
   * instead of trapping the user in a panel they cannot leave.
   */
  tabsSlot?: React.ReactNode;
  /**
   * Whether the review is the view on screen.
   *
   * The panel stays mounted while the reader is on the timeline — that is what
   * keeps the parse cache and the session's rated-card set alive — so it has to
   * be told when it is not the one being looked at. False means: do not parse,
   * and do not take the keyboard.
   *
   * Undefined is treated as active, so a caller that does not know about this
   * gets the old behaviour rather than a panel that never runs.
   */
  active?: boolean;
};

/** The four places cards can come from. */
type ReviewSourceKind = "space" | "vault" | "folder" | "document";

/**
 * The empty source list, as one shared value.
 *
 * A fresh `[]` per render would be a new identity each time, and `activeNotes`
 * feeds the parsing effect — so the "nothing to review" state would re-run the
 * parse sweep on every render, which is the busiest state to be wasteful in.
 */
const EMPTY_NOTES: ReviewSourceDocument[] = [];

const REVIEW_SOURCE_KEY = "knowspace.review-source";

/**
 * The source the reader was last using.
 *
 * Reviewing usually draws on the same place — a folder of their own, or the whole
 * workspace — and starting on Space every time is a click nobody asked for. An
 * unreadable or unrecognised value falls back rather than failing: this is a
 * convenience, and it is not allowed to be the reason the panel does not open.
 */
function readStoredSource(): ReviewSourceKind {
  try {
    const raw = localStorage.getItem(REVIEW_SOURCE_KEY);
    if (raw === "vault" || raw === "folder" || raw === "document") return raw;
  } catch {
    // Storage can be unavailable; Space is always there.
  }
  return "space";
}

/** Rating labels, matching FSRS semantics (1 = forgot, 4 = trivial). */
const RATING_META: Record<FsrsRating, { key: string; label: string; hint: string; className: string }> = {
  1: { key: "1", label: "重来", hint: "完全没想起来", className: "again" },
  2: { key: "2", label: "困难", hint: "想起来了，但很吃力", className: "hard" },
  3: { key: "3", label: "良好", hint: "顺利回忆", className: "good" },
  4: { key: "4", label: "简单", hint: "毫不费力", className: "easy" },
};

const KIND_LABEL: Record<FsrsCardKind, string> = {
  qa: "问答",
  inline: "行内",
  cloze: "挖空",
};

/**
 * One rated card, kept for the end-of-session summary — and for the one step of undo.
 *
 * `previous` is the scheduling the card had before this rating, and `filePath` is the
 * document it lives in. Both are kept here rather than looked up at undo time: the
 * sources are re-read after every rating, so the queue's own view of the card is
 * already the new one by then, and a source the reader has since switched away from
 * has no view of it at all.
 */
type ReviewLogEntry = {
  cardId: string;
  rating: FsrsRating;
  intervalDays: number;
  filePath: string;
  previous: FsrsProgress;
};

export const DailyReviewPanel: React.FC<DailyReviewPanelProps> = ({
  notes,
  currentDocument = null,
  loading = false,
  onOpenNoteFile,
  onProgressSaved,
  tabsSlot,
  active = true,
}) => {
  const desktop =
    typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  /**
   * Where the cards come from.
   *
   * Space is the default: it is where the app's own capture flow files things,
   * and the parent already has it loaded. The knowledge base and a folder of the
   * reader's own are fetched only when they are chosen — reading every document is
   * the expensive part, and most sessions draw on Space.
   *
   * All three are the same shape on purpose (`activeNotes`), so nothing below this
   * point knows which one is running.
   */
  const [reviewSource, setReviewSource] = useState<ReviewSourceKind>(() => readStoredSource());
  const vault = useVaultCards();
  // Gated on being the visible view: the panel stays mounted now, so this would
  // otherwise list the reader's remembered folders at app start for a review they
  // may not open.
  const folder = useReviewFolders(active);
  const isVaultSource = reviewSource === "vault";
  const isFolderSource = reviewSource === "folder";
  const isDocumentSource = reviewSource === "document";

  /**
   * Whether the open document can be reviewed, and why not when it cannot.
   *
   * It cannot while it has unsaved changes, and that is not a warning but a rule: a
   * rating writes its scheduling into the file, and there is no autosave here — so the
   * reader's next save, made from a buffer that was loaded before the review ran, would
   * write the progress away again. Reviewing the saved document, and saying so while it
   * is not saved, makes that impossible rather than merely warned about.
   */
  const documentSourceRefusal = !currentDocument
    ? "没有打开的文档"
    : currentDocument.dirty
      ? "这一篇有未保存的改动，先保存再复习"
      : null;
  const canReviewDocument = documentSourceRefusal === null;

  // Remember what the reader was using, so the next session opens where they left off.
  useEffect(() => {
    try {
      localStorage.setItem(REVIEW_SOURCE_KEY, reviewSource);
    } catch {
      // Storage being unavailable is not worth telling them about; it only costs the
      // convenience back.
    }
  }, [reviewSource]);

  /** Whether the fallback below has already had its say. */
  const startedSourceRef = useRef(false);

  /**
   * Loads whichever source is in use, and — once, at the start — steps back to Space
   * when the remembered one is not there.
   *
   * Loading lives here rather than in the click handlers so that it happens for a
   * source nobody clicked, which is the whole point of remembering one; a handler that
   * also loaded would read everything twice for a source that *was* clicked.
   *
   * The fallback happens only on that first pass. A source the reader picks during the
   * session is theirs: a document that becomes unsaved under them is answered by the
   * panel saying so, not by taking the choice away mid-review.
   */
  useEffect(() => {
    if (!startedSourceRef.current) {
      startedSourceRef.current = true;
      const remembered = reviewSource;
      const unavailable =
        (remembered === "vault" && vault.chapterCount === 0) ||
        (remembered === "folder" && folder.choices.length === 0) ||
        (remembered === "document" && !canReviewDocument);
      if (unavailable) {
        setReviewSource("space");
        return;
      }
    }

    if (reviewSource === "vault" && vault.chapterCount > 0 && !vault.loaded) void vault.load();
    if (reviewSource === "folder" && folder.choices.length > 0 && !folder.loaded) {
      void folder.load();
    }
  }, [
    reviewSource,
    vault.chapterCount,
    vault.loaded,
    vault.load,
    folder.choices,
    folder.loaded,
    folder.load,
    canReviewDocument,
  ]);

  /**
   * The documents this session draws from.
   *
   * Switching source mid-session is allowed, and it starts a fresh round — the
   * queue is derived from this, so changing it rebuilds the queue exactly as a
   * changed note list would.
   *
   * Memoised, and that is load-bearing rather than a micro-optimisation: this is
   * a dependency of the parsing effect below, and the `document` branch builds a
   * fresh one-element array on every render. Without the memo the effect re-ran
   * on every render, and the `publishedKey` guard inside it could only stop the
   * *publish* — the key join and the per-note staleness sweep had already run.
   *
   * The dependencies are chosen to be value-stable as well as correct: the two
   * source arrays come from `useState`, and the open document is read through
   * its path and its text rather than through the object, because `App` rebuilds
   * that object on every edit. So identity now changes exactly when the review's
   * input changes, and a content edit still reaches the parser — which a
   * path-only signature would have missed.
   */
  const activeNotes: ReviewSourceDocument[] = useMemo(() => {
    if (isVaultSource) return vault.documents;
    if (isFolderSource) return folder.documents;
    if (isDocumentSource) {
      return canReviewDocument && currentDocument
        ? [{ filePath: currentDocument.filePath, content: currentDocument.content }]
        : EMPTY_NOTES;
    }
    return notes;
  }, [
    isVaultSource,
    isFolderSource,
    isDocumentSource,
    vault.documents,
    folder.documents,
    canReviewDocument,
    currentDocument?.filePath,
    currentDocument?.content,
    notes,
  ]);
  /**
   * How far the card-finding has got, when it is running.
   *
   * Declared before the loading state because that state needs it: to the reader,
   * reading the files and finding the cards in them are one wait, and the second is
   * the longer one by far.
   */
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null);

  /**
   * Reading the source and finding cards in it, as one wait.
   *
   * To the reader these are the same thing — a source was picked and cards are
   * coming — but they used to look different: reading was a bare spinner, and
   * only the parse that followed it counted anything. The read reports its own
   * numbers now, so the count starts at the first file instead of appearing
   * partway through, and it never runs backwards because the read is finished
   * before the parse begins.
   */
  const readProgress = isVaultSource ? vault.progress : isFolderSource ? folder.progress : null;
  const activeProgress = parseProgress ?? readProgress;

  // The open document needs no fetching — its text is already here — so it is never
  // in a loading state, whatever the Space list above is doing.
  //
  // Parsing is folded in here rather than reported separately, for the reason above.
  const isLoading =
    parseProgress !== null ||
    readProgress !== null ||
    (isVaultSource
      ? vault.loading
      : isFolderSource
        ? folder.loading
        : isDocumentSource
          ? false
          : Boolean(loading));
  /** What went wrong for the source in use, if anything. */
  const sourceError = isVaultSource ? vault.error : isFolderSource ? folder.error : null;

  /**
   * Cards rated in this session, by card id.
   *
   * Advancement is tracked by identity rather than by a position in the queue.
   * Rating a card tells the parent to reload, the queue is rebuilt, and a card
   * that has just been scheduled into the future is no longer in it — so a
   * position-based cursor was reset to zero on every rebuild, which is why
   * rating appeared to do nothing at all. Identity survives the rebuild, and it
   * also keeps a card rated "重来" from being shown again in the same session
   * while still coming back on its new due date.
   */
  const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [log, setLog] = useState<ReviewLogEntry[]>([]);

  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 2000);
  }, []);

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
      while (index < stale.length && performance.now() - startedAt < 8) {
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
   * Everything the render needs, from the finished parse.
   *
   * Cheap by construction: the parsing has happened, and this walks the cards once.
   * The card id → note mapping is needed on every rating, to merge the new
   * scheduling state back into the right file.
   */
  const { queue: initialQueue, stats, sourceMap } = useMemo(() => {
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

  /**
   * The card being asked about, and how many are left — in one pass.
   *
   * The card is the first in the queue not rated yet this session; derived
   * rather than stored, so a queue rebuild cannot move it backwards. The count
   * is measured against what the session started with, which keeps the numbers
   * still as rated cards drop out of the queue: each rating adds one to `done`
   * and takes one off `remaining`, so the total does not shrink under the reader.
   *
   * Both walk the queue against the session's rated set, and both used to do it
   * on every render. The first stopped at the first unrated card, but the count
   * had to look at all of them — so a queue of a few thousand cards cost a few
   * thousand set lookups per render, and this panel re-renders on every reveal
   * and every rating. Memoised, and sharing the walk, they cost that once per
   * rating instead.
   */
  const { current, remaining } = useMemo(() => {
    let unrated = 0;
    let firstUnrated: (typeof initialQueue)[number] | undefined;
    for (const item of initialQueue) {
      if (reviewedIds.has(item.card.id)) continue;
      unrated += 1;
      if (firstUnrated === undefined) firstUnrated = item;
    }
    return { current: firstUnrated, remaining: unrated };
  }, [initialQueue, reviewedIds]);

  const done = reviewedIds.size;
  const total = done + remaining;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  /**
   * Interval each rating would produce, shown on the buttons so the cost of
   * "困难" versus "简单" is visible before committing.
   */
  const previews = useMemo(() => {
    if (!current || !revealed) return null;
    return ([1, 2, 3, 4] as FsrsRating[]).map((rating) => {
      try {
        return review(current.card, current.progress, rating).intervalDays;
      } catch {
        return null;
      }
    });
  }, [current, revealed]);

  const handleRate = useCallback(
    async (rating: FsrsRating) => {
      if (!current || saving) return;

      const source = sourceMap.get(current.card.id);
      if (!source) {
        showToast("找不到卡片来源，请刷新后重试");
        return;
      }

      const result = review(current.card, current.progress, rating);

      setSaving(true);
      try {
        if (!desktop?.saveMarkdownFile) throw new Error("当前环境不支持写回笔记");

        // The note is read again before it is written to, and the new scheduling is
        // merged into *that* rather than into the copy this panel loaded.
        //
        // A review can sit open for a while, and the file it is about is not private:
        // another editor, a sync client or the capture flow may have written to it in
        // the meantime. Writing the loaded copy back whole would throw those edits away
        // — and the only thing a rating means to change is its own metadata block, so
        // there is no need to. Merging into what is actually there also settles the
        // other direction: a card the reader deleted while the review was open no longer
        // parses, so its row is dropped instead of being written back for a card that
        // is not there.
        //
        // A read that fails is not a reason to refuse the rating: the copy in hand is
        // what there is, which is what the panel used to write unconditionally.
        let baseContent = source.content;
        try {
          const fresh = await desktop.readMarkdownFile?.(source.path);
          if (typeof fresh?.markdown === "string") baseContent = fresh.markdown;
        } catch {
          // Falls through to the copy in hand.
        }

        const updatedContent = upsertFsrsMetadata(
          baseContent,
          new Map([[current.card.id, result.progress]])
        );

        const res = await desktop.saveMarkdownFile({
          absolutePath: source.path,
          content: updatedContent,
          // Still forced, and now for a narrower reason: the version check would refuse
          // this write whenever anyone else touched the file, and what is being written
          // is their content plus one metadata block — the merge above is what makes
          // that safe, so a refusal here would only block reviewing.
          force: true,
        });

        if (!res?.success) throw new Error(res?.message || "保存失败");

        // Optimistic advance: move to the next card immediately, and remember
        // the new content so a second rating on the same note merges on top of
        // it rather than reverting the first.
        source.content = updatedContent;
        // The parsed view of that one note is brought up to date as well, and the
        // published source rebuilt from it: the queue and the counters are derived from
        // it, and a rating is exactly the thing they should be saying something new
        // about. One note re-parsed — not the vault, and not on the render thread.
        noteWritten(source.path, updatedContent);
        setLog((prev) => [
          ...prev,
          {
            cardId: current.card.id,
            rating,
            intervalDays: result.intervalDays,
            filePath: source.path,
            previous: current.progress,
          },
        ]);
        // Mark rather than advance: the parent reload below rebuilds the queue,
        // and this is what keeps the next card in front of the reader.
        setReviewedIds((prev) => new Set(prev).add(current.card.id));
        setRevealed(false);
        // The parent owns the Space list and refreshes it. The vault documents
        // are this panel's own, so it has to refresh those itself.
        onProgressSaved?.();
        // Updated in place, not re-read. The panel knows what it just wrote, and
        // re-reading a vault to learn it again is the cost that made a rating on a
        // large vault take a second or two — and, before the parsing was split up,
        // freeze the window while it did. The one document that changed is the one
        // answer that changed.
        if (isVaultSource) vault.applySaved(source.path, updatedContent);
        if (isFolderSource) folder.applySaved(source.path, updatedContent);
      } catch (err) {
        showToast(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        setSaving(false);
      }
    },
    // vault.reloadIfLoaded rather than the whole vault object, whose identity is
    // new on every render — depending on it would re-register the key listener
    // below on every keystroke.
    [
      current,
      saving,
      sourceMap,
      desktop,
      showToast,
      onProgressSaved,
      isVaultSource,
      isFolderSource,
      vault.applySaved,
      folder.applySaved,
      noteWritten,
    ]
  );

  /**
   * Takes back the last rating of this session.
   *
   * A rating is one keypress, and "重来" sits one key away from "良好" on the same row:
   * the wrong one moves the card's schedule — a lapse it did not have, an interval it
   * did not earn — and afterwards nothing on screen says so. One step of undo is the
   * step that mis-click needs, and it is the step the reader just took.
   *
   * The card returns to the round as well: what is being restored is the schedule it
   * had, and a card whose schedule was taken back has not been reviewed.
   */
  const handleUndo = useCallback(async () => {
    if (saving) return;
    const last = log.at(-1);
    if (!last) return;

    // A card that had never been reviewed has no row of its own in the file, so taking
    // the rating back means taking the row away again. (Writing the "new" progress back
    // instead would say the same thing in a row that was not there before — and a note
    // whose only card is undone this way should end up with no block at all, which is
    // what removing it gives.)
    const restoreIsRemoval = last.previous.state === "new" && last.previous.reps === 0;

    setSaving(true);
    try {
      if (!desktop?.saveMarkdownFile) throw new Error("当前环境不支持写回笔记");

      // Read first, like a rating does: the file may have been written to since, and
      // what is being written back is one card's scheduling, not a whole document.
      let baseContent = "";
      try {
        const fresh = await desktop.readMarkdownFile?.(last.filePath);
        if (typeof fresh?.markdown === "string") baseContent = fresh.markdown;
      } catch {
        // Falls through to the refusal below: without the file's own text there is
        // nothing to put one row back into, and guessing at it would be worse.
      }
      if (!baseContent) throw new Error("读不到这篇笔记");

      const progress = parseFsrsMetadata(baseContent);
      if (restoreIsRemoval) progress.delete(last.cardId);
      else progress.set(last.cardId, last.previous);

      const undoneContent = serializeFsrsMetadata(baseContent, progress);
      const res = await desktop.saveMarkdownFile({
        absolutePath: last.filePath,
        content: undoneContent,
        force: true,
      });
      if (!res?.success) throw new Error(res?.message || "保存失败");

      setLog((prev) => prev.slice(0, -1));
      setReviewedIds((prev) => {
        const next = new Set(prev);
        next.delete(last.cardId);
        return next;
      });
      setRevealed(false);
      // The sources hold their own copies, so they are told the same way a rating
      // tells them: one note, updated in place rather than re-read.
      onProgressSaved?.();
      noteWritten(last.filePath, undoneContent);
      if (isVaultSource) vault.applySaved(last.filePath, undoneContent);
      if (isFolderSource) folder.applySaved(last.filePath, undoneContent);
      showToast("已撤销上一次评分");
    } catch (err) {
      showToast(`撤销失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [
    desktop,
    folder.applySaved,
    isFolderSource,
    isVaultSource,
    log,
    noteWritten,
    onProgressSaved,
    saving,
    showToast,
    vault.applySaved,
  ]);

  /**
   * Keyboard review flow: Space reveals, 1-4 grade.
   *
   * Registered once, and dispatched through a ref that always holds the latest
   * handler. Two things changed when the panel started staying mounted:
   *
   * - It must do nothing while the review is not the view on screen. A global
   *   Space handler left live under 时间轴 would swallow the key for the whole
   *   app, which is a far worse bug than the re-binding it replaced.
   * - It must not be re-bound on every rating. The listener used to depend on
   *   `handleRate`, which is rebuilt whenever the queue moves — so every single
   *   rating tore the listener down and put it back up. The ref makes the
   *   registration depend on nothing, and the handler still sees current state
   *   because the ref is refreshed on each render.
   */
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (!active) return;

    // Narrow to an Element before probing: `event.target` is not always one
    // (it is the window for synthetic events, and can be the document when
    // nothing holds focus), and calling `.closest()` on those throws.
    const target = event.target instanceof HTMLElement ? event.target : null;
    const isEditing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable === true ||
      target?.closest(".cm-editor") != null;
    if (isEditing) return;

    // Ctrl/Cmd+Z only reaches here from outside a text field — the guard above has
    // already let the editor keep its own undo.
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      void handleUndo();
      return;
    }

    if (event.code === "Space" || event.key === " ") {
      // Stop the page from scrolling, and don't re-fire the button's own
      // click handler.
      event.preventDefault();
      setRevealed((r) => !r);
      return;
    }

    if (!revealed || saving) return;
    const rating = Number(event.key);
    if (rating >= 1 && rating <= 4) {
      event.preventDefault();
      void handleRate(rating as FsrsRating);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentSourceName = current
    ? sourceMap.get(current.card.id)?.path.split(/[\\/]/).pop() ?? ""
    : "";

  const correctCount = log.filter((entry) => entry.rating >= 3).length;

  return (
    <div className="space-timeline-container">
      {/* Panel Top Header */}
      <div className="space-panel-header dr-header">
        <div className="space-panel-title-row">
          <div className="space-panel-title">
            <GraduationCap size={16} />
            <span>每日复盘</span>
            <span className="space-count-badge">{stats.due} 张待复习</span>
          </div>
          <div className="space-header-actions">
            {/* Only reachable while there is a rating to take back, which is also what
                makes it a one-step undo rather than a history: the step the reader has
                just taken is the step a mis-key needs. */}
            {log.length > 0 ? (
              <button
                type="button"
                className="space-icon-btn"
                onClick={() => void handleUndo()}
                disabled={saving}
                title="撤销上一次评分（Ctrl+Z）"
              >
                <Undo2 size={13} />
              </button>
            ) : null}
            <button
              type="button"
              className="space-icon-btn"
              onClick={() => {
                // A new round, read from the sources as they are: the notes this panel
                // wrote to belong to the sources again, and what was written is still on
                // disk, so nothing is undone by forgetting it here. What it does undo is
                // the panel's own view — without this, a card rated a moment ago would
                // stay out of the round even though the file it came from is the one the
                // round is reading.
                writtenContent.current.clear();
                parsedNotes.current.clear();
                publishedKey.current = null;
                setParseRevision((revision) => revision + 1);
                setReviewedIds(new Set());
                setRevealed(false);
                setLog([]);
                if (isVaultSource) vault.reloadIfLoaded();
                if (isFolderSource) folder.reloadIfLoaded();
                onProgressSaved?.();
                showToast("已重新排队");
              }}
              title="重新开始本轮"
            >
              <RotateCw size={13} />
            </button>
          </div>
        </div>

        {tabsSlot}

        {/* Card source. Space is where the capture flow files things; the vault
            is everything else the app can already read. Reuses the tab styling
            so the two switch rows read as the same kind of control. */}
        <div className="space-tab-switcher dr-source-switcher" role="group" aria-label="卡片来源">
          <button
            type="button"
            className={`space-tab-btn ${reviewSource === "space" ? "active" : ""}`}
            onClick={() => setReviewSource("space")}
          >
            <span>闪念 Space</span>
          </button>
          <button
            type="button"
            className={`space-tab-btn ${reviewSource === "vault" ? "active" : ""}`}
            // Reading happens in the effect above, so that a remembered source and a
            // clicked one are loaded by the same code.
            onClick={() => setReviewSource("vault")}
            disabled={vault.chapterCount === 0}
            title={
              vault.chapterCount === 0
                ? "尚未打开知识库"
                : `从当前知识库的 ${vault.chapterCount} 篇文档中复习`
            }
          >
            <span>当前知识库</span>
          </button>
          <button
            type="button"
            className={`space-tab-btn ${isFolderSource ? "active" : ""}`}
            onClick={() => {
              setReviewSource("folder");
              // Nothing chosen yet means nothing to read, so the first click asks for a
              // folder rather than opening an empty review and leaving the reader to
              // work out why. `choose` adds one to the list; the effect above reads it.
              if (folder.choices.length === 0) void folder.choose();
            }}
            title={
              folder.choices.length > 0
                ? `复习 ${folder.choices.length} 个文件夹里的 ${folder.fileCount} 篇文档`
                : "选一个文件夹作为卡片来源"
            }
          >
            <span>自定义文件夹</span>
          </button>
          <button
            type="button"
            className={`space-tab-btn ${isDocumentSource ? "active" : ""}`}
            onClick={() => setReviewSource("document")}
            disabled={!canReviewDocument}
            title={
              documentSourceRefusal
                ? documentSourceRefusal
                : `只复习《${currentDocument?.filePath.split(/[\\/]/).pop() ?? ""}》里的卡片`
            }
          >
            <span>当前文档</span>
          </button>
        </div>

        {/* Which folders, and what one might want to do about them. Only while that
            source is in use: these are rows about the source, not a permanent part of
            the header.

            Rendered even with nothing chosen. The way to add the first folder is the
            row this list holds, so hiding the list when it is empty hides the only
            route to filling it — the reader is left on a source with no folders and no
            visible way to add one. */}
        {isFolderSource ? (
          <div className="dr-folder-list" role="list" aria-label="复习的文件夹">
            {folder.choices.length === 0 ? (
              <div className="dr-folder-empty">
                还没有选择文件夹。卡片会从所选文件夹里的所有 Markdown 文档中提取。
              </div>
            ) : null}
            {folder.choices.map((choice) => (
              <div className="dr-folder-row" key={choice.rootPath} role="listitem">
                <FolderOpen size={12} />
                <span className="dr-folder-name" title={choice.rootPath}>
                  {choice.name}
                </span>
                <span
                  className={
                    choice.scanTruncated || choice.scanUnreadable
                      ? "dr-folder-count is-truncated"
                      : "dr-folder-count"
                  }
                  title={
                    [
                      describeScanTruncation(choice.scanTruncated),
                      describeScanUnreadable(choice.scanUnreadable),
                    ]
                      .filter(Boolean)
                      .join("\n") || undefined
                  }
                >
                  {choice.paths.length} 篇
                  {choice.scanTruncated || choice.scanUnreadable ? " ⚠" : ""}
                </span>
                <button
                  type="button"
                  className="dr-folder-action"
                  onClick={() => folder.remove(choice.rootPath)}
                  title={`不再复习「${choice.name}」`}
                >
                  移除
                </button>
              </div>
            ))}
            <div className="dr-folder-row">
              <button
                type="button"
                className="dr-folder-action"
                onClick={() => void folder.choose()}
                disabled={!folder.canAddMore}
                title={
                  folder.canAddMore
                    ? "再加一个文件夹"
                    : `一轮最多复习 ${MAX_REVIEW_FOLDERS} 个文件夹；再多就用「当前知识库」来源`
                }
              >
                添加文件夹
              </button>
            </div>
          </div>
        ) : null}

        {/* Session progress */}
        <div className="dr-progress-track" aria-label="本轮进度">
          <div className="dr-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="dr-progress-caption">
          <span>
            {done} / {total}
          </span>
          <span>
            共 {stats.total} 张 · 已追踪 {stats.tracked} 张
          </span>
        </div>

        {feedback && <div className="space-feedback-toast">{feedback}</div>}
      </div>

      {/* Panel Body */}
      <div className="space-panel-body">
        {isLoading ? (
          <div className="space-empty-state">
            <RotateCw size={24} />
            <p>
              {isFolderSource
                ? "正在读取这个文件夹..."
                : isVaultSource
                  ? "正在读取知识库文档..."
                  : "正在载入 Space 闪念库..."}
            </p>
            {activeProgress && (
              <p className="dr-empty-hint">
                {parseProgress
                  ? `正在查找卡片 ${activeProgress.done} / ${activeProgress.total} 篇…`
                  : `正在读取文档 ${activeProgress.done} / ${activeProgress.total} 篇…`}
              </p>
            )}
          </div>
        ) : sourceError ? (
          <div className="space-empty-state">
            <AlertCircle size={32} />
            <p>{isFolderSource ? "读取文件夹失败" : "读取知识库失败"}</p>
            <p className="dr-empty-hint">{sourceError}</p>
          </div>
        ) : isDocumentSource && documentSourceRefusal ? (
          <div className="space-empty-state">
            <AlertCircle size={32} />
            <p>{documentSourceRefusal}</p>
            <p className="dr-empty-hint">
              {currentDocument?.dirty
                ? "复习会把进度写进文件，而保存会用手里的文字覆盖它 —— 先保存，两件事就都对了。"
                : "打开一篇 Markdown 文档，就能只复习它里面的卡片。"}
            </p>
          </div>
        ) : stats.total === 0 && isDocumentSource ? (
          <div className="space-empty-state">
            <Inbox size={32} />
            <p>这一篇里还没有闪卡</p>
            <p className="dr-empty-hint">
              在这篇文档里写下 <code>问题 :: 答案</code>、<code>Q: / A:</code> 或{" "}
              <code>{"{{c1::答案}}"}</code>，保存后即可复习。
            </p>
          </div>
        ) : isFolderSource && folder.choices.length === 0 ? (
          <div className="space-empty-state">
            <FolderOpen size={32} />
            <p>还没有选择文件夹</p>
            <p className="dr-empty-hint">
              挑一个放着笔记的文件夹（最多 {MAX_REVIEW_FOLDERS} 个），它里面的卡片就会进入复习
              —— 只是复习，不会把它打开成工作区。
            </p>
            <button
              type="button"
              className="space-btn-primary"
              onClick={() => void folder.choose()}
            >
              <FolderOpen size={14} />
              <span>选择文件夹</span>
            </button>
          </div>
        ) : stats.total === 0 ? (
          <div className="space-empty-state">
            <Inbox size={32} />
            <p>
              {isFolderSource
                ? "这些文件夹里还没有闪卡"
                : isVaultSource
                  ? "知识库里还没有闪卡"
                  : "Space 里还没有闪卡"}
            </p>
            <p className="dr-empty-hint">
              {isFolderSource ? (
                <>
                  在这个文件夹的任意文档里写下 <code>问题 :: 答案</code>、
                  <code>Q: / A:</code> 或 <code>{"{{c1::答案}}"}</code>，即可生成卡片。
                </>
              ) : isVaultSource ? (
                <>
                  在当前知识库的任意文档里写下 <code>问题 :: 答案</code>、
                  <code>Q: / A:</code> 或 <code>{"{{c1::答案}}"}</code>，即可生成卡片。
                </>
              ) : (
                <>
                  在闪念里写下 <code>问题 :: 答案</code>、<code>Q: / A:</code> 或{" "}
                  <code>{"{{c1::答案}}"}</code> 即可生成卡片。
                </>
              )}
            </p>
          </div>
        ) : !current ? (
          <div className="space-empty-state">
            <CheckCircle2 size={32} />
            <p>今日复习完成 🎉</p>
            {log.length > 0 ? (
              <div className="dr-session-summary">
                <div className="dr-summary-row">
                  <span>本轮复习</span>
                  <strong>{log.length} 张</strong>
                </div>
                <div className="dr-summary-row">
                  <span>回忆顺利</span>
                  <strong>
                    {correctCount} 张（{Math.round((correctCount / log.length) * 100)}%）
                  </strong>
                </div>
                <div className="dr-summary-row">
                  <span>下次到期</span>
                  <strong>
                    {log.filter((e) => e.intervalDays <= 1).length} 张明日再来
                  </strong>
                </div>
              </div>
            ) : (
              <p className="dr-empty-hint">
                没有到期的卡片。今日仍有 {stats.tracked} 张已在计划中，明天再来。
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Flashcard */}
            <div
              className={`dr-card ${revealed ? "is-revealed" : ""}`}
              onClick={() => !revealed && setRevealed(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !revealed) setRevealed(true);
              }}
            >
              <div className="dr-card-meta">
                <span className={`dr-kind dr-kind-${current.card.kind}`}>
                  {KIND_LABEL[current.card.kind]}
                </span>
                {currentSourceName && (
                  <button
                    type="button"
                    className="dr-source"
                    title="打开来源笔记"
                    onClick={(e) => {
                      e.stopPropagation();
                      const source = sourceMap.get(current.card.id);
                      if (source) onOpenNoteFile?.(source.path);
                    }}
                  >
                    {currentSourceName}
                  </button>
                )}
              </div>

              <div className="dr-question">{current.card.front}</div>

              {revealed ? (
                <div className="dr-answer">{current.card.back}</div>
              ) : (
                <div className="dr-reveal-hint">
                  <Keyboard size={12} />
                  <span>
                    按 <kbd>Space</kbd> 显示答案
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            {revealed ? (
              <div className="dr-actions">
                {([1, 2, 3, 4] as FsrsRating[]).map((rating, i) => {
                  const meta = RATING_META[rating];
                  const days = previews?.[i];
                  return (
                    <button
                      key={rating}
                      type="button"
                      className={`dr-rate-btn dr-rate-${meta.className}`}
                      disabled={saving}
                      onClick={() => void handleRate(rating)}
                      title={meta.hint}
                    >
                      <span className="dr-rate-key">{meta.key}</span>
                      <span className="dr-rate-label">{meta.label}</span>
                      <span className="dr-rate-interval">
                        {days === null || days === undefined
                          ? "—"
                          : days <= 1
                          ? "明天"
                          : `${days} 天后`}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                className="space-btn-primary dr-reveal-btn"
                onClick={() => setRevealed(true)}
              >
                <Eye size={14} />
                <span>显示答案</span>
              </button>
            )}

            {revealed && (
              <div className="dr-hint-bar">
                数字键 <kbd>1</kbd>–<kbd>4</kbd> 评分 · <kbd>Space</kbd> 翻回正面
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
