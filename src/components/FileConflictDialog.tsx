import { AlertCircle, RefreshCw, Save, Copy } from "lucide-react";

type FileConflictDialogProps = {
  isOpen: boolean;
  fileName: string;
  onReload: () => void;
  onOverwrite: () => void;
  onSaveAs: () => void;
  onCancel: () => void;
};

export function FileConflictDialog({
  isOpen,
  fileName,
  onReload,
  onOverwrite,
  onSaveAs,
  onCancel,
}: FileConflictDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div className="modal-card modal-conflict">
        <div className="modal-header">
          <div className="modal-icon error">
            <AlertCircle size={22} />
          </div>
          <div>
            <h3 id="conflict-title">检测到文件冲突</h3>
            <p className="modal-desc">
              磁盘上的文件 <strong>{fileName}</strong>{" "}
              已被外部编辑器修改。请选择如何处理当前编辑器的内容：
            </p>
          </div>
        </div>

        <div className="conflict-options">
          <button type="button" className="conflict-opt-btn" onClick={onReload}>
            <RefreshCw size={16} />
            <div>
              <strong>重新载入磁盘内容</strong>
              <span>放弃当前编辑器的修改，加载磁盘上的最新版本</span>
            </div>
          </button>

          <button type="button" className="conflict-opt-btn danger" onClick={onOverwrite}>
            <Save size={16} />
            <div>
              <strong>强制覆盖磁盘文件</strong>
              <span>将当前编辑器的内容写入磁盘，覆盖外部程序的修改</span>
            </div>
          </button>

          <button type="button" className="conflict-opt-btn" onClick={onSaveAs}>
            <Copy size={16} />
            <div>
              <strong>另存为新文件</strong>
              <span>将当前内容保存到其他路径，保留双方修改</span>
            </div>
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
