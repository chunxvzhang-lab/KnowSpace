import type { AiMode } from "../../types/ai";

export const AI_MODES: { id: AiMode; title: string; prompt: string }[] = [
  {
    id: "create",
    title: "对话创作",
    prompt: "例如：把一级标题改为测试，或生成一份实施方案…",
  },
  { id: "edit", title: "修改文档", prompt: "将当前文档的一级标题改为测试。" },
  { id: "mindmap", title: "思维导图", prompt: "根据当前文档生成思维导图，提炼核心主题与分支。" },
  {
    id: "canvas",
    title: "白板卡片",
    prompt: "将当前文档整理为白板卡片，每张卡片包含一个核心观点。",
  },
  {
    id: "question",
    title: "知识问答",
    prompt: "这份资料的核心结论是什么？请列出依据与待确认问题。",
  },
  { id: "rewrite", title: "选区写作", prompt: "润色选区，使表达清晰、自然，保留原意与格式。" },
  {
    id: "outline",
    title: "大纲写作",
    prompt: "根据当前 Markdown 大纲逐章书写全文，保留标题层级与已有事实，未知内容标注待确认。",
  },
  {
    id: "summary",
    title: "资料汇总",
    prompt: "汇总所选资料，列出核心结论、决策依据、分歧与待确认问题。",
  },
];
