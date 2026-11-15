import { BookOpen, PencilLine, ListTree, Boxes } from "lucide-react";
import type { EditorViewMode } from "../core/types";

type ViewModeControlProps = {
  mode: EditorViewMode;
  onChange: (mode: EditorViewMode) => void;
  disabled?: boolean;
};

export function ViewModeControl({ mode, onChange, disabled = false }: ViewModeControlProps) {
  return (
    <div className="view-mode-control" role="group" aria-label="视图模式切换">
      <button
        type="button"
        className={`view-mode-btn ${mode === "read" ? "active" : ""}`}
        onClick={() => onChange("read")}
        disabled={disabled}
        title="阅读模式（Ctrl+E 切换编辑）"
        aria-pressed={mode === "read"}
      >
        <BookOpen size={15} />
        <span>阅读</span>
      </button>
      <button
        type="button"
        className={`view-mode-btn ${mode === "live" ? "active" : ""}`}
        onClick={() => onChange("live")}
        disabled={disabled}
        title="实时预览（直接编辑正文，当前行显示 Markdown 标记）"
        aria-pressed={mode === "live"}
      >
        <PencilLine size={15} />
        <span>实时预览</span>
      </button>
      <button
        type="button"
        className={`view-mode-btn ${mode === "mindmap" ? "active text-cyan" : ""}`}
        onClick={() => onChange("mindmap")}
        disabled={disabled}
        title="思维导图模式 (Ctrl+M)"
        aria-pressed={mode === "mindmap"}
      >
        <ListTree size={15} />
        <span>脑图</span>
      </button>
      <button
        type="button"
        className={`view-mode-btn ${mode === "canvas" ? "active text-emerald" : ""}`}
        onClick={() => onChange("canvas")}
        disabled={disabled}
        title="无限空间白板模式"
        aria-pressed={mode === "canvas"}
      >
        <Boxes size={15} />
        <span>白板</span>
      </button>
    </div>
  );
}
