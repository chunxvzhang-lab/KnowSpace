import { useLayoutEffect } from "react";
import type { DocumentSession } from "../core/types";
import { useUiStore } from "../store/useUiStore";

// Local diagram drafts are not part of sourceRevision until committed.
export function useAiPendingEdits(key: string | undefined, pending: boolean) {
  useLayoutEffect(() => {
    if (!key || !pending) return;
    useUiStore.setState({ aiPendingDocument: key });
    return () => {
      if (useUiStore.getState().aiPendingDocument === key)
        useUiStore.setState({ aiPendingDocument: null });
    };
  }, [key, pending]);
}

export function assertAiEditorReady(session: DocumentSession | null) {
  if (
    session &&
    useUiStore.getState().aiPendingDocument === (session.absolutePath || session.fileName)
  )
    throw new Error("脑图或卡片还有未提交的修改，请先同步到文档或完成卡片编辑，再进行 AI 写入。");
}
