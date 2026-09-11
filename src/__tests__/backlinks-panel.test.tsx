import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BacklinksPanel } from "../components/BacklinksPanel";
import type { BacklinkRef, UnlinkedMention } from "../services/backlinkIndex";

describe("BacklinksPanel Component Sub-function Tests", () => {
  it("renders empty state when no linked references or unlinked mentions exist", () => {
    render(
      <BacklinksPanel
        currentTitle="目标文档"
        currentPath="notes/target.md"
        linkedReferences={[]}
        unlinkedMentions={[]}
        onJumpToSource={vi.fn()}
        onConvertMention={vi.fn()}
      />
    );

    expect(screen.getByText("当前文档上下文")).toBeDefined();
    expect(screen.getByText("目标文档")).toBeDefined();
    expect(screen.getByText("notes/target.md")).toBeDefined();
    expect(screen.getByText("暂无反向引用")).toBeDefined();
  });

  it("renders grouped linked references and triggers onJumpToSource", () => {
    const linkedReferences: BacklinkRef[] = [
      {
        sourceId: "doc-1",
        sourceTitle: "来源笔记 A",
        sourcePath: "notes/source-a.md",
        line: 12,
        snippet: "在这一节我们引用了 [[目标文档]] 的结论。",
        target: "目标文档",
      },
      {
        sourceId: "doc-1",
        sourceTitle: "来源笔记 A",
        sourcePath: "notes/source-a.md",
        line: 25,
        snippet: "再次查看 [[目标文档|核心观点]] 展开论述。",
        target: "目标文档",
        alias: "核心观点",
      },
    ];

    const onJumpToSource = vi.fn();

    render(
      <BacklinksPanel
        currentTitle="目标文档"
        linkedReferences={linkedReferences}
        unlinkedMentions={[]}
        onJumpToSource={onJumpToSource}
        onConvertMention={vi.fn()}
      />
    );

    expect(screen.getByText("来源笔记 A")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();

    // Click on a reference snippet to jump
    const snippetItem = screen.getByText(/在这一节我们引用了/);
    fireEvent.click(snippetItem.closest(".backlink-item")!);
    expect(onJumpToSource).toHaveBeenCalledWith("doc-1", 12);
  });

  it("renders unlinked mentions and triggers onConvertMention", () => {
    const unlinkedMentions: UnlinkedMention[] = [
      {
        sourceId: "doc-2",
        sourceTitle: "草稿 B",
        sourcePath: "drafts/b.md",
        line: 5,
        snippet: "文中提及了 目标文档 但是没有加上双括号链接。",
        mentionText: "目标文档",
      },
    ];

    const onConvertMention = vi.fn();

    render(
      <BacklinksPanel
        currentTitle="目标文档"
        linkedReferences={[]}
        unlinkedMentions={unlinkedMentions}
        onJumpToSource={vi.fn()}
        onConvertMention={onConvertMention}
      />
    );

    expect(screen.getByText("草稿 B")).toBeDefined();
    expect(screen.getByText("+ 设为双链")).toBeDefined();

    // Click convert button
    const convertBtn = screen.getByText("+ 设为双链");
    fireEvent.click(convertBtn);
    expect(onConvertMention).toHaveBeenCalledTimes(1);
    expect(onConvertMention).toHaveBeenCalledWith(unlinkedMentions[0]);
  });
});
