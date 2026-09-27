import React from "react";
import { GraduationCap, Undo2, RotateCw, FolderOpen } from "lucide-react";
import { MAX_REVIEW_FOLDERS } from "../../hooks/useReviewFolders";
import { useReviewFolders } from "../../hooks/useReviewFolders";
import { useVaultCards } from "../../hooks/useVaultCards";
import { describeScanTruncation, describeScanUnreadable } from "../../core/scanNotice";
import type { FsrsStats } from "../../services/fsrsService";
import type { ReviewLogEntry } from "./useReviewRating";
import type { ReviewSourceKind } from "./useReviewSource";

type DailyReviewHeaderProps = {
  /** Card counts for the title badge and the progress caption. */
  stats: FsrsStats;
  /** What the reader has rated this session; also what makes undo reachable. */
  log: ReviewLogEntry[];
  /** True while a rating or undo write is in flight; disables the header buttons. */
  saving: boolean;
  /** Takes back the last rating of the session. */
  handleUndo: () => Promise<void>;
  /** Starts a new round; the composition root assembles it from all three hooks. */
  onRequeue: () => void;
  /**
   * Rendered under the title row. The parent passes its tab switcher in, so the
   * review view keeps the same navigation as the timeline and todo views
   * instead of trapping the user in a panel they cannot leave.
   */
  tabsSlot?: React.ReactNode;
  reviewSource: ReviewSourceKind;
  /** Switches the card source; loading is the source hook's effect's job. */
  onChangeSource: (source: ReviewSourceKind) => void;
  vault: ReturnType<typeof useVaultCards>;
  folder: ReturnType<typeof useReviewFolders>;
  isFolderSource: boolean;
  isDocumentSource: boolean;
  canReviewDocument: boolean;
  /** Why the open document cannot be reviewed, when it cannot. */
  documentSourceRefusal: string | null;
  currentDocument: { filePath: string; content: string; dirty: boolean } | null;
  done: number;
  total: number;
  progressPct: number;
  /** The transient toast text, shown under the header rows. */
  feedback: string;
};

/**
 * The review panel's header: title and counts, undo/requeue, the source switcher,
 * the folder list, and the session progress bar.
 *
 * Extracted verbatim from DailyReviewPanel (decomposition of the review view);
 * prop-driven, with no state of its own. The requeue button's WHY-comment lives
 * with the handler body it describes, in DailyReviewPanel.
 */
export const DailyReviewHeader: React.FC<DailyReviewHeaderProps> = ({
  stats,
  log,
  saving,
  handleUndo,
  onRequeue,
  tabsSlot,
  reviewSource,
  onChangeSource,
  vault,
  folder,
  isFolderSource,
  isDocumentSource,
  canReviewDocument,
  documentSourceRefusal,
  currentDocument,
  done,
  total,
  progressPct,
  feedback,
}) => {
  return (
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
          <button type="button" className="space-icon-btn" onClick={onRequeue} title="重新开始本轮">
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
          onClick={() => onChangeSource("space")}
        >
          <span>闪念 Space</span>
        </button>
        <button
          type="button"
          className={`space-tab-btn ${reviewSource === "vault" ? "active" : ""}`}
          // Reading happens in the source hook's effect, so that a remembered source
          // and a clicked one are loaded by the same code.
          onClick={() => onChangeSource("vault")}
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
            onChangeSource("folder");
            // Nothing chosen yet means nothing to read, so the first click asks for a
            // folder rather than opening an empty review and leaving the reader to
            // work out why. `choose` adds one to the list; the source hook's effect
            // reads it.
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
          onClick={() => onChangeSource("document")}
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
                {choice.paths.length} 篇{choice.scanTruncated || choice.scanUnreadable ? " ⚠" : ""}
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
  );
};
