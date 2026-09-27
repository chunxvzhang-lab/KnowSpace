import { useEffect, useMemo, useRef, useState } from "react";
import { useVaultCards } from "../../hooks/useVaultCards";
import { useReviewFolders } from "../../hooks/useReviewFolders";
import type { ReviewSourceDocument } from "../../services/reviewSources";

/** The four places cards can come from. */
export type ReviewSourceKind = "space" | "vault" | "folder" | "document";

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

type UseReviewSourceParams = {
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
  currentDocument: { filePath: string; content: string; dirty: boolean } | null;
  /**
   * Whether the review is the view on screen.
   *
   * The panel stays mounted while the reader is on the timeline — that is what
   * keeps the parse cache and the session's rated-card set alive — so it has to
   * be told when it is not the one being looked at.
   */
  active: boolean;
};

/**
 * Where the review's cards come from: the source switch, its persistence, and the
 * documents each source resolves to.
 *
 * Extracted from DailyReviewPanel (decomposition of the review view). Everything
 * here is the original, moved verbatim — the one deliberate touch is `activeNotes`
 * (see the note on the memo): `react-hooks/exhaustive-deps` is an error in this
 * file, and it refuses the original's path-and-text dependency list while the body
 * still named the whole `currentDocument` object.
 *
 * Owns `ReviewSourceKind`, the localStorage key and `readStoredSource`, because
 * no other review module needs them.
 */
export function useReviewSource({ notes, currentDocument, active }: UseReviewSourceParams) {
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

  // The load functions are pulled out of the source objects for the effect below:
  // invoking a method straight off a hook-returned object makes
  // react-hooks/exhaustive-deps demand the whole object as a dependency, and those
  // objects are new on every render — the effect would re-run (and re-call `load`,
  // restarting an in-flight read) on every render. The destructured locals are the
  // same references, so the effect runs on exactly the same conditions as before.
  const { load: loadVault } = vault;
  const { load: loadFolder } = folder;

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

    if (reviewSource === "vault" && vault.chapterCount > 0 && !vault.loaded) void loadVault();
    if (reviewSource === "folder" && folder.choices.length > 0 && !folder.loaded) {
      void loadFolder();
    }
  }, [
    reviewSource,
    vault.chapterCount,
    vault.loaded,
    loadVault,
    folder.choices,
    folder.loaded,
    loadFolder,
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
   * a dependency of the parsing effect in `useReviewParsing`, and the `document`
   * branch builds a fresh one-element array on every render. Without the memo the
   * effect re-ran on every render, and the `publishedKey` guard inside it could
   * only stop the *publish* — the key join and the per-note staleness sweep had
   * already run.
   *
   * The dependencies are chosen to be value-stable as well as correct: the two
   * source arrays come from `useState`, and the open document is read through
   * its path and its text rather than through the object, because `App` rebuilds
   * that object on every edit. So identity now changes exactly when the review's
   * input changes, and a content edit still reaches the parser — which a
   * path-only signature would have missed.
   *
   * The path and text are lifted into locals above the memo and guarded with
   * `!== undefined` where the original wrote `canReviewDocument && currentDocument`.
   * Same truth table — `canReviewDocument` already implies the document exists —
   * but spelled so the linter can see the memo reads the document only through
   * its path and its text, which is the whole point of the dependency list.
   */
  const openDocumentPath = currentDocument?.filePath;
  const openDocumentContent = currentDocument?.content;
  const activeNotes: ReviewSourceDocument[] = useMemo(() => {
    if (isVaultSource) return vault.documents;
    if (isFolderSource) return folder.documents;
    if (isDocumentSource) {
      return canReviewDocument &&
        openDocumentPath !== undefined &&
        openDocumentContent !== undefined
        ? [{ filePath: openDocumentPath, content: openDocumentContent }]
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
    openDocumentPath,
    openDocumentContent,
    notes,
  ]);

  /**
   * Reading the source and finding cards in it, as one wait — the read half.
   *
   * To the reader these are the same thing — a source was picked and cards are
   * coming — but they used to look different: reading was a bare spinner, and
   * only the parse that followed it counted anything. The read reports its own
   * numbers now, so the count starts at the first file instead of appearing
   * partway through, and it never runs backwards because the read is finished
   * before the parse begins. The parse half of the join
   * (`activeProgress = parseProgress ?? readProgress`) lives in DailyReviewPanel,
   * because the parse side belongs to `useReviewParsing`.
   */
  const readProgress = isVaultSource ? vault.progress : isFolderSource ? folder.progress : null;

  /** What went wrong for the source in use, if anything. */
  const sourceError = isVaultSource ? vault.error : isFolderSource ? folder.error : null;

  return {
    reviewSource,
    setReviewSource,
    vault,
    folder,
    isVaultSource,
    isFolderSource,
    isDocumentSource,
    documentSourceRefusal,
    canReviewDocument,
    activeNotes,
    readProgress,
    sourceError,
  };
}
