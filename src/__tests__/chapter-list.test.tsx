import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChapterList } from "../components/ChapterList";
import type { BookManifest } from "../core/types";

describe("ChapterList Component Sub-function Tests", () => {
  const manifest: BookManifest = {
    id: "kb-main",
    title: "我的知识库",
    chapters: [
      { id: "c1", title: "快速入门", src: "getting-started.md" },
      { id: "c2", title: "核心概念", src: "guides/concepts.md" },
      { id: "c3", title: "架构图谱", src: "guides/architecture.canvas" },
      { id: "c4", title: "闪念笔记", src: "space/capsule-1.md" },
    ],
  };

  it("renders chapter hierarchy and folders, hides space notes by default unless active", () => {
    const onSelect = vi.fn();
    render(
      <ChapterList
        manifest={manifest}
        activeChapterId="c1"
        onSelectChapter={onSelect}
      />
    );

    // Regular docs are visible
    expect(screen.getByText("getting-started.md")).toBeDefined();
    // guides folder exists
    expect(screen.getByText("guides")).toBeDefined();
    // Space flash notes are hidden by default from the main directory
    expect(screen.queryByText("capsule-1.md")).toBeNull();

    // Click on chapter to select
    fireEvent.click(screen.getByText("getting-started.md"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("导入大纲：有这条通道时出现，没有时不出现", () => {
    // Offered beside the other ways of making a document, because that is what it
    // does — it adds a document to the directory. And like them it appears only
    // when the app can actually carry it out.
    const onImportOutline = vi.fn();
    const { unmount } = render(
      <ChapterList
        manifest={manifest}
        activeChapterId="c1"
        onSelectChapter={vi.fn()}
        onImportOutline={onImportOutline}
      />
    );

    const button = screen.getByRole("button", { name: "导入大纲" });
    expect(button.getAttribute("title")).toContain("OPML");
    expect(button.getAttribute("title")).toContain("FreeMind");
    fireEvent.click(button);
    expect(onImportOutline).toHaveBeenCalledTimes(1);

    unmount();
    render(<ChapterList manifest={manifest} activeChapterId="c1" onSelectChapter={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "导入大纲" })).toBeNull();
  });

  it("shows space notes when current active chapter is in space/", () => {
    render(
      <ChapterList
        manifest={manifest}
        activeChapterId="c4"
        onSelectChapter={vi.fn()}
      />
    );

    // When space note is active, space folder and notes are shown
    expect(screen.getByText("space")).toBeDefined();
    expect(screen.getByText("capsule-1.md")).toBeDefined();
  });

  it("allows toggling folder expansion", () => {
    render(
      <ChapterList
        manifest={manifest}
        activeChapterId="c1"
        onSelectChapter={vi.fn()}
      />
    );

    const folderBtn = screen.getByText("guides").closest("button")!;
    expect(folderBtn).toBeDefined();
    // Click folder button to toggle
    fireEvent.click(folderBtn);
  });
});
