import React from "react";
import { Zap, Copy, Trash2 } from "lucide-react";
import type { RefObject } from "react";

/** 常驻便签的常用构型（原 FlashCapsule 内每次渲染重建的数组，改为模块常量；只读）。 */
const starterTemplates = [
  {
    label: "📌 今日任务待办",
    text: "## 今日核心待办\n- [ ] 核心目标 1\n- [ ] 核心目标 2\n- [ ] 临时插入事项\n",
  },
  {
    label: "💡 提示词审查模板",
    text: "作为资深工程师，请对以下代码或方案进行深度代码审查，指出潜在性能与逻辑隐患：\n\n",
  },
  {
    label: "📝 会议与访谈速记",
    text: "## 沟通纪要\n- **参与人**：\n- **关键决议**：\n- **下一步行动 (Next Actions)**：\n  - [ ] ",
  },
  {
    label: "🔬 闪念知识卡片",
    text: "### 闪念知识卡片\n- **核心概念**：\n- **知识洞察**：\n- **双链关联**：[[]]\n",
  },
];

/**
 * 常驻便签 / 提示模板 Tab：说明横幅、常用构型、随写随存输入区与底部操作。
 * 从 FlashCapsule 逐字搬出，仅改为 prop 驱动。
 */
export function FlashPersistentTab(props: {
  persistentContent: string;
  persistentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  persistentFeedback: string;
  onPersistentChange: (val: string) => void;
  onClearPersistent: () => void;
  onCopyPersistent: () => void;
  onInsertToNote: () => void;
}) {
  const {
    persistentContent,
    persistentTextareaRef,
    persistentFeedback,
    onPersistentChange,
    onClearPersistent,
    onCopyPersistent,
    onInsertToNote,
  } = props;

  return (
    <div className="flash-persistent-container">
      {/* Banner info */}
      <div className="flash-persistent-banner">
        <span className="flash-persistent-banner-text">
          📌 <strong>常驻便签与提示模板</strong>：实时自动保存，在归档闪念时
          <strong>绝不清空</strong>，随时备查、复用或作为 AI 常用 Prompt 提示词使用。
        </span>
        {persistentFeedback && (
          <span className="flash-persistent-badge-feedback">{persistentFeedback}</span>
        )}
      </div>

      {/* Starter Template Pills */}
      <div className="flash-starter-row">
        <span className="flash-starter-label">常用构型：</span>
        {starterTemplates.map((t, idx) => (
          <button
            key={idx}
            type="button"
            className="flash-starter-tag"
            onClick={() => {
              const next = persistentContent ? `${persistentContent}\n\n${t.text}` : t.text;
              onPersistentChange(next);
            }}
            title="点击追加此结构到常驻便签"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Persistent Textarea */}
      <div className="flash-persistent-input-wrapper">
        <textarea
          ref={persistentTextareaRef}
          className="flash-textarea flash-persistent-textarea"
          placeholder="在此记录永久常驻便签、重要 Checklist、常用 Prompt 提示词或固定参考资料... (内容实时自动保存在本地，永不清空)"
          value={persistentContent}
          onChange={(e) => onPersistentChange(e.target.value)}
          rows={6}
        />
      </div>

      {/* Persistent Footer Actions */}
      <div className="flash-footer">
        <div className="flash-footer-left">
          <span className="flash-char-count">{persistentContent.length} 字 · 自动持久化</span>
        </div>
        <div className="flash-footer-right">
          <button
            type="button"
            className="flash-btn flash-btn-secondary"
            onClick={onClearPersistent}
            title="清空常驻便签内容"
          >
            <Trash2 size={13} />
            <span>清空</span>
          </button>
          <button
            type="button"
            className="flash-btn flash-btn-secondary"
            onClick={onCopyPersistent}
            title="复制常驻便签全文到剪贴板"
          >
            <Copy size={13} />
            <span>复制全文</span>
          </button>
          <button
            type="button"
            className="flash-btn flash-btn-primary"
            onClick={onInsertToNote}
            title="将当前模板内容填入速记输入区"
          >
            <Zap size={14} />
            <span>填入速记</span>
          </button>
        </div>
      </div>
    </div>
  );
}
