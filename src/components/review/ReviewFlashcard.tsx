import React from "react";
import {
  RotateCw,
  Eye,
  CheckCircle2,
  Inbox,
  Keyboard,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { MAX_REVIEW_FOLDERS } from "../../hooks/useReviewFolders";
import { useReviewFolders } from "../../hooks/useReviewFolders";
import type {
  FsrsCardKind,
  FsrsQueueItem,
  FsrsRating,
  FsrsStats,
} from "../../services/fsrsService";
import type { ReviewLogEntry } from "./useReviewRating";

/** Rating labels, matching FSRS semantics (1 = forgot, 4 = trivial). */
const RATING_META: Record<
  FsrsRating,
  { key: string; label: string; hint: string; className: string }
> = {
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

type ReviewFlashcardProps = {
  isLoading: boolean;
  /** The read half of the wait, from `useReviewSource`. */
  activeProgress: { done: number; total: number } | null;
  /** The parse half of the wait, from `useReviewParsing`. */
  parseProgress: { done: number; total: number } | null;
  sourceError: string | null;
  isVaultSource: boolean;
  isFolderSource: boolean;
  isDocumentSource: boolean;
  documentSourceRefusal: string | null;
  currentDocument: { filePath: string; content: string; dirty: boolean } | null;
  folder: ReturnType<typeof useReviewFolders>;
  stats: FsrsStats;
  /** The card being asked about; undefined once the round is finished. */
  current: FsrsQueueItem | undefined;
  log: ReviewLogEntry[];
  /** How many of this session's ratings were 良好 or better. */
  correctCount: number;
  revealed: boolean;
  setRevealed: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  handleRate: (rating: FsrsRating) => Promise<void>;
  /** Interval each rating would produce, or null before the answer is shown. */
  previews: (number | null)[] | null;
  /** The file name of the card's source note, for the open-source button. */
  currentSourceName: string;
  onOpenNoteFile?: (filePath: string) => void;
  /** Card id → the note it was parsed from; resolves the open-source click. */
  sourceMap: Map<string, { path: string; content: string }>;
};

/**
 * The review panel's body: the empty-state cascade, the flashcard, the rating
 * buttons and the keyboard hint bar.
 *
 * Extracted verbatim from DailyReviewPanel (decomposition of the review view);
 * prop-driven, with no state and no new memo. `RATING_META` and `KIND_LABEL` moved
 * here because the rating buttons and the card badge are their only readers.
 */
export const ReviewFlashcard: React.FC<ReviewFlashcardProps> = ({
  isLoading,
  activeProgress,
  parseProgress,
  sourceError,
  isVaultSource,
  isFolderSource,
  isDocumentSource,
  documentSourceRefusal,
  currentDocument,
  folder,
  stats,
  current,
  log,
  correctCount,
  revealed,
  setRevealed,
  saving,
  handleRate,
  previews,
  currentSourceName,
  onOpenNoteFile,
  sourceMap,
}) => {
  return (
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
            挑一个放着笔记的文件夹（最多 {MAX_REVIEW_FOLDERS} 个），它里面的卡片就会进入复习 ——
            只是复习，不会把它打开成工作区。
          </p>
          <button type="button" className="space-btn-primary" onClick={() => void folder.choose()}>
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
                在这个文件夹的任意文档里写下 <code>问题 :: 答案</code>、<code>Q: / A:</code> 或{" "}
                <code>{"{{c1::答案}}"}</code>，即可生成卡片。
              </>
            ) : isVaultSource ? (
              <>
                在当前知识库的任意文档里写下 <code>问题 :: 答案</code>、<code>Q: / A:</code> 或{" "}
                <code>{"{{c1::答案}}"}</code>，即可生成卡片。
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
                <strong>{log.filter((e) => e.intervalDays <= 1).length} 张明日再来</strong>
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
  );
};
