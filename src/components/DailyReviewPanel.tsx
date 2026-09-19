import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  buildReviewQueue,
  parseFlashcards,
  parseFsrsMetadata,
  review,
  serializeFsrsMetadata,
  summarize,
  upsertFsrsMetadata,
  type FsrsCardKind,
  type FsrsProgress,
  type FsrsRating,
  type FsrsStats,
} from "../services/fsrsService";
import { useVaultCards } from "../hooks/useVaultCards";
import { useReviewFolder } from "../hooks/useReviewFolder";
import type { ReviewSourceDocument } from "../services/reviewSources";

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
};

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
  const [reviewSource, setReviewSource] = useState<"space" | "vault" | "folder" | "document">(
    "space"
  );
  const vault = useVaultCards();
  const folder = useReviewFolder();
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

  /**
   * The documents this session draws from.
   *
   * Switching source mid-session is allowed, and it starts a fresh round — the
   * queue is derived from this, so changing it rebuilds the queue exactly as a
   * changed note list would.
   */
  const activeNotes: ReviewSourceDocument[] = isVaultSource
    ? vault.documents
    : isFolderSource
      ? folder.documents
      : isDocumentSource
        ? canReviewDocument && currentDocument
          ? [{ filePath: currentDocument.filePath, content: currentDocument.content }]
          : []
        : notes;
  // The open document needs no fetching — its text is already here — so it is never
  // in a loading state, whatever the Space list above is doing.
  const isLoading = isVaultSource
    ? vault.loading
    : isFolderSource
      ? folder.loading
      : isDocumentSource
        ? false
        : Boolean(loading);
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
   * Derived review data.
   *
   * `buildReviewQueue` returns cards without their originating note, so the
   * card id → note mapping is built alongside it. It is needed on every rating
   * to merge the new scheduling state back into the right file.
   */
  const { queue: initialQueue, stats, sourceMap } = useMemo(() => {
    const inputs: Array<{ path: string; content: string }> = [];
    const sources = new Map<string, { path: string; content: string }>();

    for (const note of activeNotes) {
      inputs.push({ path: note.filePath, content: note.content });

      // Every card of one note shares a single mutable holder, which is where the
      // last thing written to that note is kept. A rating merges into a fresh read of
      // the file rather than into this, so the holder is not what makes two ratings of
      // one note accumulate any more — it is what the merge falls back on when the file
      // cannot be read, and what the panel's own view of the note stays consistent
      // with while a write is in flight.
      const holder = { path: note.filePath, content: note.content };

      for (const card of parseFlashcards(note.content)) {
        // First occurrence wins: a duplicated card id across notes is resolved
        // deterministically rather than flip-flopping between renders.
        if (!sources.has(card.id)) sources.set(card.id, holder);
      }
    }

    const emptyStats: FsrsStats = { total: 0, due: 0, fresh: 0, learning: 0, review: 0, tracked: 0 };

    return {
      queue: buildReviewQueue(inputs),
      stats: inputs.length > 0 ? summarize(inputs) : emptyStats,
      sourceMap: sources,
    };
  }, [activeNotes]);

  /**
   * The card being asked about: the first one in the queue that has not been
   * rated yet this session. Derived rather than stored, so a queue rebuild
   * cannot move it backwards.
   */
  const current = initialQueue.find((item) => !reviewedIds.has(item.card.id));

  /**
   * Session progress, measured against what the session started with.
   *
   * Counting the remaining cards rather than the whole queue keeps the numbers
   * still as rated cards drop out of it: each rating adds one to `done` and
   * takes one off `remaining`, so the total does not shrink under the reader.
   */
  const done = reviewedIds.size;
  const remaining = initialQueue.filter((item) => !reviewedIds.has(item.card.id)).length;
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
        // The documents the review read are its own to re-read: the parent owns the
        // Space list, but a workspace's chapters and a chosen folder are fetched here,
        // and a rating that is not merged on top of the last one would revert it.
        if (isVaultSource) vault.reloadIfLoaded();
        if (isFolderSource) folder.reloadIfLoaded();
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
      vault.reloadIfLoaded,
      folder.reloadIfLoaded,
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

      const res = await desktop.saveMarkdownFile({
        absolutePath: last.filePath,
        content: serializeFsrsMetadata(baseContent, progress),
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
      // tells them.
      onProgressSaved?.();
      if (isVaultSource) vault.reloadIfLoaded();
      if (isFolderSource) folder.reloadIfLoaded();
      showToast("已撤销上一次评分");
    } catch (err) {
      showToast(`撤销失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [
    desktop,
    folder.reloadIfLoaded,
    isFolderSource,
    isVaultSource,
    log,
    onProgressSaved,
    saving,
    showToast,
    vault.reloadIfLoaded,
  ]);

  // Keyboard review flow: Space reveals, 1-4 grade. Guarded against firing while
  // the user is typing in the search box above.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, saving, handleRate]);

  const currentSourceName = current
    ? sourceMap.get(current.card.id)?.path.split(/[\\/]/).pop() ?? ""
    : "";

  const correctCount = log.filter((entry) => entry.rating >= 3).length;

  return (
    <div className="space-timeline-container">
      {/* Panel Top Header */}
      <div className="space-panel-header">
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
                setReviewedIds(new Set());
                setRevealed(false);
                setLog([]);
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
            onClick={() => {
              setReviewSource("vault");
              // Fetched the first time it is asked for rather than on mount:
              // reading every chapter is the expensive part here, and most
              // sessions draw on Space.
              if (!vault.loaded) void vault.load();
            }}
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
              // Nothing chosen yet means nothing to read, so the first click asks for
              // a folder rather than opening an empty review and leaving the reader to
              // work out why.
              // `choose` reads the folder it just picked, because a `load` called from
              // here would still be closed over the choice of the previous render.
              if (!folder.choice) void folder.choose();
              else if (!folder.loaded) void folder.load();
            }}
            title={
              folder.choice
                ? `复习「${folder.choice.name}」里的 ${folder.fileCount} 篇文档`
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

        {/* Which folder, and the two things one might want to do about it. Only while
            that source is in use: it is a row about the source, not a permanent part
            of the header. */}
        {isFolderSource && folder.choice ? (
          <div className="dr-folder-row">
            <FolderOpen size={12} />
            <span className="dr-folder-name" title={folder.choice.rootPath}>
              {folder.choice.name}
            </span>
            <span className="dr-folder-count">{folder.fileCount} 篇</span>
            <button type="button" className="dr-folder-action" onClick={() => void folder.choose()}>
              更换
            </button>
            <button type="button" className="dr-folder-action" onClick={folder.forget}>
              取消
            </button>
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
        ) : isFolderSource && !folder.choice ? (
          <div className="space-empty-state">
            <FolderOpen size={32} />
            <p>还没有选择文件夹</p>
            <p className="dr-empty-hint">
              挑一个放着笔记的文件夹，它里面的卡片就会进入复习 —— 只是复习，不会把它打开成工作区。
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
                ? "这个文件夹里还没有闪卡"
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
