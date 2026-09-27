import React, { useCallback } from "react";
import type { ReviewSourceDocument } from "../services/reviewSources";
import { DailyReviewHeader } from "./review/DailyReviewHeader";
import { ReviewFlashcard } from "./review/ReviewFlashcard";
import { useReviewSource } from "./review/useReviewSource";
import { useReviewParsing } from "./review/useReviewParsing";
import { useReviewRating } from "./review/useReviewRating";

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

/**
 * The daily review view: where the reader answers their due cards.
 *
 * This is now the composition root of the review (decomposition of the original
 * 1,236-line panel). The parts, in dependency order:
 *
 * - `useReviewSource` — which source the cards come from, its persistence and
 *   fallback, and the `activeNotes` list the whole pipeline runs on.
 * - `useReviewParsing` — the chunked parse pipeline, and the only owner of the
 *   parse-cache refs; outsiders reach them through `noteWritten`/`resetCache`.
 * - `useReviewRating` — the session (rated set, reveal, log), the rating and
 *   undo writes, and the keyboard flow.
 * - `DailyReviewHeader` / `ReviewFlashcard` — the verbatim JSX, prop-driven.
 *
 * The export and the props interface are unchanged; SpaceTimelinePanel is the
 * only host.
 */
export const DailyReviewPanel: React.FC<DailyReviewPanelProps> = ({
  notes,
  currentDocument = null,
  loading = false,
  onOpenNoteFile,
  onProgressSaved,
  tabsSlot,
  active = true,
}) => {
  const source = useReviewSource({ notes, currentDocument, active });
  const parsing = useReviewParsing({ activeNotes: source.activeNotes, active });
  const rating = useReviewRating({
    queue: parsing.queue,
    sourceMap: parsing.sourceMap,
    // The write-behind API, not the raw cache refs: the refs have exactly one
    // owner, and a rating reaches them only through the door that republishes.
    writeNote: parsing.noteWritten,
    onProgressSaved,
    isVaultSource: source.isVaultSource,
    isFolderSource: source.isFolderSource,
    applyVaultSaved: source.vault.applySaved,
    applyFolderSaved: source.folder.applySaved,
    active,
  });

  /**
   * Reading the source and finding cards in it, as one wait — joined here.
   *
   * To the reader these are the same thing — a source was picked and cards are
   * coming — but they used to look different: reading was a bare spinner, and
   * only the parse that followed it counted anything. The read reports its own
   * numbers now, so the count starts at the first file instead of appearing
   * partway through, and it never runs backwards because the read is finished
   * before the parse begins.
   */
  const readProgress = source.readProgress;
  const activeProgress = parsing.parseProgress ?? readProgress;

  // The open document needs no fetching — its text is already here — so it is never
  // in a loading state, whatever the Space list above is doing.
  //
  // Parsing is folded in here rather than reported separately, for the reason above.
  const isLoading =
    parsing.parseProgress !== null ||
    readProgress !== null ||
    (source.isVaultSource
      ? source.vault.loading
      : source.isFolderSource
        ? source.folder.loading
        : source.isDocumentSource
          ? false
          : Boolean(loading));

  // A new round, read from the sources as they are: the notes this panel wrote to
  // belong to the sources again, and what was written is still on disk, so nothing
  // is undone by forgetting them here — `parsing.resetCache` clears the panel's own
  // view (without it, a card rated a moment ago would stay out of the round even
  // though the file it came from is the one the round is reading) and
  // `rating.resetSession` clears the round's rated set, reveal and log. The sources
  // then re-read their own lists, the parent refreshes its summary, and the reader
  // is told.
  const handleRequeue = useCallback(() => {
    parsing.resetCache();
    rating.resetSession();
    if (source.isVaultSource) source.vault.reloadIfLoaded();
    if (source.isFolderSource) source.folder.reloadIfLoaded();
    onProgressSaved?.();
    rating.showToast("已重新排队");
  }, [
    parsing.resetCache,
    rating.resetSession,
    rating.showToast,
    source.isVaultSource,
    source.isFolderSource,
    source.vault.reloadIfLoaded,
    source.folder.reloadIfLoaded,
    onProgressSaved,
  ]);

  return (
    <div className="space-timeline-container">
      <DailyReviewHeader
        stats={parsing.stats}
        log={rating.log}
        saving={rating.saving}
        handleUndo={rating.handleUndo}
        onRequeue={handleRequeue}
        tabsSlot={tabsSlot}
        reviewSource={source.reviewSource}
        onChangeSource={source.setReviewSource}
        vault={source.vault}
        folder={source.folder}
        isFolderSource={source.isFolderSource}
        isDocumentSource={source.isDocumentSource}
        canReviewDocument={source.canReviewDocument}
        documentSourceRefusal={source.documentSourceRefusal}
        currentDocument={currentDocument}
        done={rating.done}
        total={rating.total}
        progressPct={rating.progressPct}
        feedback={rating.feedback}
      />
      <ReviewFlashcard
        isLoading={isLoading}
        activeProgress={activeProgress}
        parseProgress={parsing.parseProgress}
        sourceError={source.sourceError}
        isVaultSource={source.isVaultSource}
        isFolderSource={source.isFolderSource}
        isDocumentSource={source.isDocumentSource}
        documentSourceRefusal={source.documentSourceRefusal}
        currentDocument={currentDocument}
        folder={source.folder}
        stats={parsing.stats}
        current={rating.current}
        log={rating.log}
        correctCount={rating.correctCount}
        revealed={rating.revealed}
        setRevealed={rating.setRevealed}
        saving={rating.saving}
        handleRate={rating.handleRate}
        previews={rating.previews}
        currentSourceName={rating.currentSourceName}
        onOpenNoteFile={onOpenNoteFile}
        sourceMap={parsing.sourceMap}
      />
    </div>
  );
};
