import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseFsrsMetadata,
  review,
  serializeFsrsMetadata,
  upsertFsrsMetadata,
  type FsrsProgress,
  type FsrsQueueItem,
  type FsrsRating,
} from "../../services/fsrsService";

/**
 * One rated card, kept for the end-of-session summary — and for the one step of undo.
 *
 * `previous` is the scheduling the card had before this rating, and `filePath` is the
 * document it lives in. Both are kept here rather than looked up at undo time: the
 * sources are re-read after every rating, so the queue's own view of the card is
 * already the new one by then, and a source the reader has since switched away from
 * has no view of it at all.
 */
export type ReviewLogEntry = {
  cardId: string;
  rating: FsrsRating;
  intervalDays: number;
  filePath: string;
  previous: FsrsProgress;
};

type UseReviewRatingParams = {
  /** Today's queue, from the finished parse (`useReviewParsing`). */
  queue: FsrsQueueItem[];
  /** Card id → the note it was parsed from (`useReviewParsing`). */
  sourceMap: Map<string, { path: string; content: string }>;
  /**
   * The parsing hook's write-behind API — the ONLY access to the parse cache from
   * here, and deliberately not the raw refs: after a rating or an undo writes a
   * note, the cache has to be told through the same door that republishes, or the
   * optimistic advance would leave the queue and the counters looking at stale text.
   */
  writeNote: (filePath: string, content: string) => void;
  /** Called after a rating is persisted, so the parent can refresh its summary. */
  onProgressSaved?: () => void;
  isVaultSource: boolean;
  isFolderSource: boolean;
  /** The vault source's in-place refresh, from `useReviewSource`'s `vault`. */
  applyVaultSaved: (filePath: string, content: string) => void;
  /** The folder source's in-place refresh, from `useReviewSource`'s `folder`. */
  applyFolderSaved: (filePath: string, content: string) => void;
  /** Whether the review is the view on screen; hidden, the keyboard is not taken. */
  active: boolean;
};

/**
 * The review session itself: what the reader has rated, the rating and undo writes,
 * and the keyboard flow.
 *
 * Extracted from DailyReviewPanel (decomposition of the review view). `handleRate`
 * and `handleUndo` are the original, moved verbatim — the optimistic-advance
 * invariant (rate into the freshly read file, force-save, advance by marking the
 * card id, write the new note back through `writeNote`, refresh the source in
 * place) and the undo merge path are untouched. The session memos that used to sit
 * with the parse code (`current`/`remaining`/`previews`/`done`/`total`/`progressPct`)
 * moved here rather than into `useReviewParsing` because they read the session's
 * rated set and the reveal flag, which live in this hook: hook order runs
 * source → parsing → rating, so the other placement would be a cycle.
 *
 * The apply/reload functions arrive as params rather than as the whole `vault` and
 * `folder` objects for the reason the original already gave: those objects are new
 * on every render, and depending on them would re-register the key listener on
 * every keystroke.
 */
export function useReviewRating({
  queue,
  sourceMap,
  writeNote,
  onProgressSaved,
  isVaultSource,
  isFolderSource,
  applyVaultSaved,
  applyFolderSaved,
  active,
}: UseReviewRatingParams) {
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

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
    let firstUnrated: (typeof queue)[number] | undefined;
    for (const item of queue) {
      if (reviewedIds.has(item.card.id)) continue;
      unrated += 1;
      if (firstUnrated === undefined) firstUnrated = item;
    }
    return { current: firstUnrated, remaining: unrated };
  }, [queue, reviewedIds]);

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
        if (!desktop?.files.saveMarkdownFile) throw new Error("当前环境不支持写回笔记");

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
          const fresh = await desktop.files.readMarkdownFile?.(source.path);
          if (typeof fresh?.markdown === "string") baseContent = fresh.markdown;
        } catch {
          // Falls through to the copy in hand.
        }

        const updatedContent = upsertFsrsMetadata(
          baseContent,
          new Map([[current.card.id, result.progress]]),
        );

        const res = await desktop.files.saveMarkdownFile({
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
        writeNote(source.path, updatedContent);
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
        if (isVaultSource) applyVaultSaved(source.path, updatedContent);
        if (isFolderSource) applyFolderSaved(source.path, updatedContent);
      } catch (err) {
        showToast(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        setSaving(false);
      }
    },
    // The specific functions rather than the whole vault/folder objects, whose
    // identity is new on every render — depending on those would re-register the
    // key listener below on every keystroke.
    [
      current,
      saving,
      sourceMap,
      desktop,
      showToast,
      onProgressSaved,
      isVaultSource,
      isFolderSource,
      applyVaultSaved,
      applyFolderSaved,
      writeNote,
    ],
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
      if (!desktop?.files.saveMarkdownFile) throw new Error("当前环境不支持写回笔记");

      // Read first, like a rating does: the file may have been written to since, and
      // what is being written back is one card's scheduling, not a whole document.
      let baseContent = "";
      try {
        const fresh = await desktop.files.readMarkdownFile?.(last.filePath);
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
      const res = await desktop.files.saveMarkdownFile({
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
      writeNote(last.filePath, undoneContent);
      if (isVaultSource) applyVaultSaved(last.filePath, undoneContent);
      if (isFolderSource) applyFolderSaved(last.filePath, undoneContent);
      showToast("已撤销上一次评分");
    } catch (err) {
      showToast(`撤销失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [
    desktop,
    applyFolderSaved,
    isFolderSource,
    isVaultSource,
    log,
    writeNote,
    onProgressSaved,
    saving,
    showToast,
    applyVaultSaved,
  ]);

  /**
   * Forgets the session, for a new round.
   *
   * The session half of the requeue handler (its cache half — the written contents,
   * the parsed cache, the published key — is `useReviewParsing`'s `resetCache`).
   */
  const resetSession = useCallback(() => {
    setReviewedIds(new Set());
    setRevealed(false);
    setLog([]);
  }, []);

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
    ? (sourceMap.get(current.card.id)?.path.split(/[\\/]/).pop() ?? "")
    : "";

  const correctCount = log.filter((entry) => entry.rating >= 3).length;

  return {
    revealed,
    setRevealed,
    saving,
    feedback,
    log,
    showToast,
    current,
    remaining,
    done,
    total,
    progressPct,
    previews,
    handleRate,
    handleUndo,
    resetSession,
    currentSourceName,
    correctCount,
  };
}
