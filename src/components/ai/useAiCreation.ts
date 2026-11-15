import { useRef, useState } from "react";
import type { DocumentSession, EditorViewMode } from "../../core/types";
import type { AiRecord } from "../../types/ai";
import {
  assertAiTarget,
  creationContent,
  isCreationMode,
  planAiInsertion,
  type AiTarget,
} from "../../services/aiCreation";
import type { DocumentTemplate } from "../../services/documentTemplates";
import { assertAiEditorReady } from "../../hooks/useAiPendingEdits";

export function useAiCreation({
  session,
  onUpdateSource,
  onViewModeChange,
  onCreateFromTemplate,
  position,
  submitted,
  setSubmitted,
  setMessage,
}: {
  session: DocumentSession | null;
  onUpdateSource?: (source: string) => void;
  onViewModeChange?: (mode: EditorViewMode) => void;
  onCreateFromTemplate: (template: DocumentTemplate) => void;
  position: "append" | "cursor";
  submitted: boolean;
  setSubmitted: (value: boolean) => void;
  setMessage: (message: string) => void;
}) {
  const [undoWrite, setUndoWrite] = useState<{ target: AiTarget; before: string } | null>(null);
  const appliedId = useRef("");
  const latest = useRef({ session, onUpdateSource, onViewModeChange });
  latest.current = { session, onUpdateSource, onViewModeChange };

  function saveCreation(item: AiRecord, text: string) {
    if (!isCreationMode(item.mode) || submitted) return;
    const fileName = item.sources[0]?.title || "";
    const canvas = item.mode === "canvas" || (item.mode === "edit" && /\.canvas$/i.test(fileName));
    const mindmap =
      item.mode === "mindmap" || (item.mode === "edit" && /\.mindmap\.md$/i.test(fileName));
    const content = creationContent(item.mode, text, item.sources[0]?.text, fileName);
    setSubmitted(true);
    onCreateFromTemplate({
      id: `ai-${item.id}`,
      title: `AI-${canvas ? "白板" : mindmap ? "思维导图" : "创作"}-${item.id.slice(0, 8)}`,
      category: "AI 成果",
      content,
      extension: canvas ? ".canvas" : mindmap ? ".mindmap.md" : ".md",
    });
    setMessage("已打开新文件保存流程；取消后可点击“重新保存”。");
  }

  function writeCreation(item: AiRecord, text: string, captured: AiTarget) {
    if (!isCreationMode(item.mode) || appliedId.current === item.id) return;
    const current = latest.current;
    assertAiEditorReady(current.session);
    assertAiTarget(current.session, captured);
    if (item.mode === "canvas" && !current.session.fileName.toLowerCase().endsWith(".canvas")) {
      saveCreation(item, text);
      return;
    }
    if (!current.onUpdateSource) throw new Error("当前窗口不能写入文档，可保存为新文件。");
    const nextSource = planAiInsertion(current.session, captured, text, item.mode, position);
    current.onUpdateSource(nextSource);
    appliedId.current = item.id;
    setUndoWrite({
      target: { ...captured, source: nextSource, sourceRevision: captured.sourceRevision + 1 },
      before: captured.source,
    });
    if (item.mode !== "edit")
      current.onViewModeChange?.(
        item.mode === "mindmap" ? "mindmap" : item.mode === "canvas" ? "canvas" : "live",
      );
    setMessage(
      item.mode === "mindmap"
        ? "已写入并打开思维导图，原文保留。"
        : item.mode === "canvas"
          ? "白板卡片已追加，原卡片保留。"
          : item.mode === "edit"
            ? "已按对话修改原文，可撤销本次修改。"
            : "内容已写入当前文档。保存方式跟随自动保存设置。",
    );
  }

  function undoCreation() {
    if (!undoWrite) return;
    try {
      assertAiEditorReady(latest.current.session);
      assertAiTarget(latest.current.session, undoWrite.target);
      latest.current.onUpdateSource?.(undoWrite.before);
      setUndoWrite(null);
      setMessage("已撤销本次 AI 写入，保存方式跟随自动保存设置。");
    } catch {
      setMessage("写入后文档已变化或切换，未撤销；请用编辑器历史或版本快照恢复。");
    }
  }
  return { writeCreation, saveCreation, undoCreation, undoWrite, appliedId };
}
