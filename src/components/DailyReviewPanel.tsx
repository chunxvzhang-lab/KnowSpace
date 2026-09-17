import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RotateCw,
  GraduationCap,
  Eye,
  CheckCircle2,
  Inbox,
  Keyboard,
} from "lucide-react";
import type { FlashNoteSummaryItem } from "../types/desktop";
import {
  buildReviewQueue,
  parseFlashcards,
  review,
  summarize,
  upsertFsrsMetadata,
  type FsrsCardKind,
  type FsrsQueueItem,
  type FsrsRating,
  type FsrsStats,
} from "../services/fsrsService";

type DailyReviewPanelProps = {
  /** Space notes, already loaded by the parent — each item carries its content. */
  notes: FlashNoteSummaryItem[];
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

/** One rated card, kept for the end-of-session summary. */
type ReviewLogEntry = {
  cardId: string;
  rating: FsrsRating;
  intervalDays: number;
};

export const DailyReviewPanel: React.FC<DailyReviewPanelProps> = ({
  notes,
  loading = false,
  onOpenNoteFile,
  onProgressSaved,
  tabsSlot,
}) => {
  const desktop =
    typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const [queue, setQueue] = useState<FsrsQueueItem[]>([]);
  const [index, setIndex] = useState(0);
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

    for (const note of notes) {
      inputs.push({ path: note.filePath, content: note.content });

      // Every card of one note shares a single mutable holder. Giving each card
      // its own copy looked harmless, but rating card A then card B would merge
      // B's progress into the *original* text and silently drop A's — the two
      // ratings of one note have to accumulate.
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
  }, [notes]);

  // Rebuild the working queue whenever the underlying notes change (a new flash
  // note, an external edit, a manual refresh), and restart the session.
  useEffect(() => {
    setQueue(initialQueue);
    setIndex(0);
    setRevealed(false);
    setLog([]);
  }, [initialQueue]);

  const current = queue[index];
  const total = queue.length;
  const done = Math.min(index, total);
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
      const updatedContent = upsertFsrsMetadata(
        source.content,
        new Map([[current.card.id, result.progress]])
      );

      setSaving(true);
      try {
        if (!desktop?.saveMarkdownFile) throw new Error("当前环境不支持写回笔记");

        const res = await desktop.saveMarkdownFile({
          absolutePath: source.path,
          content: updatedContent,
          // The review deliberately bypasses conflict detection: the board's own
          // metadata is what changes, and a stale-version refusal here would
          // block reviewing entirely. The next load re-reads from disk anyway.
          force: true,
        });

        if (!res?.success) throw new Error(res?.message || "保存失败");

        // Optimistic advance: move to the next card immediately, and remember
        // the new content so a second rating on the same note merges on top of
        // it rather than reverting the first.
        source.content = updatedContent;
        setLog((prev) => [
          ...prev,
          { cardId: current.card.id, rating, intervalDays: result.intervalDays },
        ]);
        setIndex((i) => i + 1);
        setRevealed(false);
        onProgressSaved?.();
      } catch (err) {
        showToast(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        setSaving(false);
      }
    },
    [current, saving, sourceMap, desktop, showToast, onProgressSaved]
  );

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
            <button
              type="button"
              className="space-icon-btn"
              onClick={() => {
                setQueue(initialQueue);
                setIndex(0);
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
        {loading ? (
          <div className="space-empty-state">
            <RotateCw size={24} />
            <p>正在载入 Space 闪念库...</p>
          </div>
        ) : stats.total === 0 ? (
          <div className="space-empty-state">
            <Inbox size={32} />
            <p>Space 里还没有闪卡</p>
            <p className="dr-empty-hint">
              在闪念里写下 <code>问题 :: 答案</code>、<code>Q: / A:</code> 或{" "}
              <code>{"{{c1::答案}}"}</code> 即可生成卡片。
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
