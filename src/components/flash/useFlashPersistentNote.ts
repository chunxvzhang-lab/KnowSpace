import { useEffect, useRef, useState } from "react";

/**
 * 常驻便签 / 提示模板域：内容状态、350ms 防抖持久化与复制 / 清空 / 填入速记。
 *
 * 从 FlashCapsule 拆出。350ms 防抖是承重行为：每次输入都会重置计时器，静默期
 * 结束才真正调用 savePersistentNote；卸载（或 StrictMode 双挂载的清理）时必须
 * 取消尚未落盘的计时器——这条清理随原巨型 effect 的 cleanup 一起搬了进来。
 */
export function useFlashPersistentNote(params: {
  /** 把便签内容插入速记输入框（原行为直接调用根上的 insertSnippet）。 */
  insertSnippet: (snippet: string) => void;
  /** 切回速记页并延时聚焦输入框（原行为：setActiveTab("note") + 50ms 后 focus）。 */
  switchToNoteTab: () => void;
}) {
  const { insertSnippet, switchToNoteTab } = params;
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  const [persistentContent, setPersistentContent] = useState("");
  const [persistentFeedback, setPersistentFeedback] = useState("");
  const persistentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const persistentSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load persistent note / prompt template
    if (desktop?.capture.getPersistentNote) {
      desktop.capture
        .getPersistentNote()
        .then((res) => {
          if (res && typeof res.text === "string") {
            setPersistentContent(res.text);
          }
        })
        .catch(() => {});
    } else {
      try {
        const cached = localStorage.getItem("knowspace_persistent_note");
        if (cached) setPersistentContent(cached);
      } catch {}
    }

    return () => {
      if (persistentSaveTimerRef.current) {
        clearTimeout(persistentSaveTimerRef.current);
      }
    };
  }, [desktop]);

  const handlePersistentChange = (val: string) => {
    setPersistentContent(val);
    try {
      localStorage.setItem("knowspace_persistent_note", val);
    } catch {}
    if (persistentSaveTimerRef.current) {
      clearTimeout(persistentSaveTimerRef.current);
    }
    persistentSaveTimerRef.current = setTimeout(() => {
      desktop?.capture.savePersistentNote?.(val);
    }, 350);
  };

  const handleCopyPersistent = () => {
    if (!persistentContent) return;
    navigator.clipboard.writeText(persistentContent).then(() => {
      setPersistentFeedback("✓ 已复制全文");
      setTimeout(() => setPersistentFeedback(""), 1500);
    });
  };

  const handleClearPersistent = () => {
    if (window.confirm("确定要清空常驻便签/提示模板内容吗？此操作不会影响已归档的文档。")) {
      handlePersistentChange("");
      setPersistentFeedback("✓ 已清空");
      setTimeout(() => setPersistentFeedback(""), 1500);
    }
  };

  const handleInsertPersistentToNote = () => {
    if (!persistentContent.trim()) {
      setPersistentFeedback("便签暂无内容");
      setTimeout(() => setPersistentFeedback(""), 1200);
      return;
    }
    insertSnippet(persistentContent + "\n\n");
    switchToNoteTab();
  };

  return {
    persistentContent,
    persistentFeedback,
    persistentTextareaRef,
    handlePersistentChange,
    handleCopyPersistent,
    handleClearPersistent,
    handleInsertPersistentToNote,
  };
}
