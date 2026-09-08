import { describe, it, expect, vi } from "vitest";
import type { BookManifest, Heading } from "../core/types";
import type { CommandAction } from "../components/CommandPalette";

describe("Command Palette & Quick Switcher Logic", () => {
  const mockManifest: BookManifest = {
    id: "test-vault",
    title: "测试知识库",
    chapters: [
      { id: "ch-1", title: "知识导图", src: "docs/mindmap.md" },
      { id: "ch-2", title: "双链引用架构", src: "docs/wikilink.md" },
      { id: "ch-3", title: "PDF 导出指南", src: "guides/pdf.md" },
      { id: "ch-4", title: "快速开始与入门", src: "intro.md" },
    ],
  };

  const mockHeadings: Heading[] = [
    { id: "h-1", text: "引言与设计背景", level: 1, line: 1 },
    { id: "h-2", text: "核心特性与优势", level: 2, line: 15 },
    { id: "h-3", text: "快捷键指南", level: 2, line: 30 },
  ];

  const mockActions: CommandAction[] = [
    {
      id: "cmd-pdf",
      title: "高保真专业 PDF 打印",
      description: "生成高分辨率向量级打印文稿与 PDF 导出",
      shortcut: "Ctrl+P",
      category: "导出与分发",
      run: vi.fn(),
    },
    {
      id: "cmd-mindmap",
      title: "切换视图: 思维导图",
      description: "将文档大纲结构转换为无限画布可视化脑图",
      shortcut: "Ctrl+M",
      category: "视图与排版",
      run: vi.fn(),
    },
    {
      id: "cmd-new",
      title: "新建 Markdown 笔记",
      description: "在当前知识库中创建一个全新空白笔记",
      shortcut: "Ctrl+N",
      category: "文档操作",
      run: vi.fn(),
    },
  ];

  it("prioritizes MRU recently visited documents when query is empty", () => {
    const recentIds = ["ch-3", "ch-1"];

    const mruChapters = recentIds
      .map((id) => mockManifest.chapters.find((c) => c.id === id))
      .filter(Boolean);
    const remaining = mockManifest.chapters.filter((c) => !recentIds.includes(c.id));
    const sorted = [...mruChapters, ...remaining];

    expect(sorted[0]?.id).toBe("ch-3");
    expect(sorted[1]?.id).toBe("ch-1");
    expect(sorted.length).toBe(4);
  });

  it("filters documents by title and path with fuzzy search", () => {
    const query = "pdf";
    const matched = mockManifest.chapters.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        (c.src && c.src.toLowerCase().includes(query))
    );

    expect(matched.length).toBe(1);
    expect(matched[0].id).toBe("ch-3");
  });

  it("filters action mode commands when query starts with >", () => {
    const rawQuery = "> PDF";
    const isActionMode = rawQuery.trim().startsWith(">");
    expect(isActionMode).toBe(true);

    const term = rawQuery.slice(1).trim().toLowerCase();
    const matchedActions = mockActions.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        (a.description && a.description.toLowerCase().includes(term)) ||
        a.category.toLowerCase().includes(term)
    );

    expect(matchedActions.length).toBe(1);
    expect(matchedActions[0].id).toBe("cmd-pdf");
  });

  it("filters heading mode headings when query starts with #", () => {
    const rawQuery = "# 快捷键";
    const isHeadingMode = rawQuery.trim().startsWith("#");
    expect(isHeadingMode).toBe(true);

    const term = rawQuery.slice(1).trim().toLowerCase();
    const matchedHeadings = mockHeadings.filter((h) =>
      h.text.toLowerCase().includes(term)
    );

    expect(matchedHeadings.length).toBe(1);
    expect(matchedHeadings[0].id).toBe("h-3");
    expect(matchedHeadings[0].line).toBe(30);
  });
});
