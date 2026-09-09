import { render, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchPanel } from "../components/SearchPanel";
import type { SearchResult } from "../core/types";

describe("SearchPanel Component", () => {
  const mockResults: SearchResult[] = [
    {
      id: "res-1",
      index: 10,
      title: "第一节 概述",
      excerpt: "在微服务体系中，我们采用 #架构 方案和 [[分布式网络]] 实现。",
      lineNumber: 12,
      lineEndNumber: 15,
      chapterId: "ch-1",
      chapterTitle: "架构总览",
      tags: ["架构"],
      links: ["分布式网络"],
      matchCountInBlock: 2,
      query: "架构",
    },
    {
      id: "res-2",
      index: 25,
      title: "第二节 存储",
      excerpt: "存储引擎具备核心优势。",
      lineNumber: 40,
      chapterId: "ch-2",
      chapterTitle: "存储系统",
      query: "架构",
    },
  ];

  it("renders search panel with scope switcher tabs", () => {
    const onQueryChange = vi.fn();
    const onJump = vi.fn();
    const onScopeChange = vi.fn();

    render(
      <SearchPanel
        query="架构"
        results={mockResults}
        onQueryChange={onQueryChange}
        onJump={onJump}
        scope="current"
        onScopeChange={onScopeChange}
        vaultDocCount={12}
      />
    );

    expect(screen.getByText("当前章节")).toBeDefined();
    expect(screen.getByText("全库检索")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText(/共找到/)).toBeDefined();

    // Switch scope tab
    const vaultTab = screen.getByText("全库检索");
    fireEvent.click(vaultTab);
    expect(onScopeChange).toHaveBeenCalledWith("vault");
  });

  it("renders syntax helper chips and inserts snippet on click", () => {
    const onQueryChange = vi.fn();
    const onJump = vi.fn();

    render(
      <SearchPanel
        query=""
        results={[]}
        onQueryChange={onQueryChange}
        onJump={onJump}
      />
    );

    // Helper chips exist
    expect(screen.getByText("tag:#")).toBeDefined();
    expect(screen.getByText("link:[[")).toBeDefined();
    expect(screen.getByText('"短语"')).toBeDefined();
    expect(screen.getByText("-排除")).toBeDefined();

    // Click chip
    fireEvent.click(screen.getByText("tag:#"));
    expect(onQueryChange).toHaveBeenCalledWith("tag:#");
  });

  it("renders result cards with badges and triggers onJump on click", () => {
    const onQueryChange = vi.fn();
    const onJump = vi.fn();

    render(
      <SearchPanel
        query="架构"
        results={mockResults}
        onQueryChange={onQueryChange}
        onJump={onJump}
        scope="vault"
      />
    );

    // Vault badges
    expect(screen.getByText("架构总览")).toBeDefined();
    expect(screen.getByText("存储系统")).toBeDefined();

    // Line tags
    expect(screen.getByText(/L12-15/)).toBeDefined();
    expect(screen.getByText(/L40/)).toBeDefined();

    // Tag and link pills
    expect(screen.getByText("#架构")).toBeDefined();
    expect(screen.getByText("[[分布式网络]]")).toBeDefined();

    // Clicking card
    const firstResult = screen.getByText("第一节 概述").closest("button");
    expect(firstResult).not.toBeNull();
    fireEvent.click(firstResult!);

    expect(onJump).toHaveBeenCalledWith(mockResults[0]);
  });
});
