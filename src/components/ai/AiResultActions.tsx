import { Check, FilePlus2 } from "lucide-react";
import type { AiRecord } from "../../types/ai";
import { isCreationMode, type AiTarget } from "../../services/aiCreation";

type Props = {
  record: AiRecord | null;
  target: AiTarget | null;
  applied: boolean;
  submitted: boolean;
  draft: string;
  hasSelection: boolean;
  hasDraftWarnings: boolean;
  canUndo: boolean;
  busy: boolean;
  confirmApply: boolean;
  onWrite: () => void;
  onSave: () => void;
  onUndo: () => void;
  apply: () => void;
  setSubmitted: (value: boolean) => void;
  setConfirmApply: (value: boolean) => void;
};
export function AiResultActions({
  record,
  target,
  applied,
  submitted,
  draft,
  hasSelection,
  hasDraftWarnings,
  canUndo,
  busy,
  confirmApply,
  onWrite,
  onSave,
  onUndo,
  apply,
  setSubmitted,
  setConfirmApply,
}: Props) {
  return (
    <>
      {record && (
        <div className="ai-result-actions">
          {isCreationMode(record.mode) && target && (
            <button
              type="button"
              className="ai-primary"
              disabled={applied || (record.mode === "canvas" && submitted) || !draft.trim()}
              onClick={onWrite}
            >
              <Check size={14} />
              {applied
                ? "已写入"
                : record.mode === "canvas" && !/\.canvas$/i.test(target.fileName)
                  ? "保存为新白板"
                  : "写入当前文档"}
            </button>
          )}
          {hasSelection && (record.mode === "rewrite" || record.mode === "outline") && (
            <button
              type="button"
              className="ai-primary"
              disabled={!draft.trim() || hasDraftWarnings}
              onClick={() => (record.mode === "outline" ? setConfirmApply(true) : apply())}
            >
              <Check size={14} />
              {record.mode === "outline" ? "替换当前文档全文" : "应用到选区"}
            </button>
          )}
          <button type="button" disabled={submitted || !draft.trim()} onClick={onSave}>
            <FilePlus2 size={14} />
            {submitted
              ? "已发起保存"
              : record.mode === "canvas" ||
                  (record.mode === "edit" && /\.canvas$/i.test(record.sources[0]?.title || ""))
                ? "另存白板"
                : record.mode === "mindmap"
                  ? "另存思维导图"
                  : "保存为新笔记"}
          </button>
          {submitted && (
            <button type="button" onClick={() => setSubmitted(false)}>
              重新保存
            </button>
          )}
        </div>
      )}
      {canUndo && (
        <button type="button" className="ai-undo-write" disabled={busy} onClick={onUndo}>
          撤销本次写入
        </button>
      )}
      {confirmApply && record?.mode === "outline" && (
        <section className="ai-apply-confirm" role="group" aria-label="确认替换全文">
          <p>
            将替换生成时的整篇文档。确认前请核对草稿；应用后可一次撤销。开启自动保存时，修改将按设置写入磁盘。
          </p>
          <div className="ai-button-row">
            <button type="button" className="ai-primary" onClick={apply}>
              确认替换全文
            </button>
            <button type="button" onClick={() => setConfirmApply(false)}>
              保留原文
            </button>
          </div>
        </section>
      )}
    </>
  );
}
