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

  /**
   * The tree is built with a per-parent lookup rather than a scan of the
   * siblings already added, so a folder holding many documents at one level
   * does not cost a quadratic number of comparisons. These are the properties
   * that has to preserve.
   */
  describe("深层与宽目录的树形构建", () => {
    it("keeps every document in a wide folder, once each", () => {
      const wide: BookManifest = {
        id: "kb-wide",
        title: "宽目录",
        chapters: Array.from({ length: 300 }, (_, index) => ({
          id: `w${index}`,
          title: `文档 ${index}`,
          src: `资料/note-${String(index).padStart(3, "0")}.md`,
        })),
      };

      render(
        <ChapterList manifest={wide} activeChapterId="w0" onSelectChapter={vi.fn()} />,
      );

      // The folder holding the active document is expanded on open, so there is
      // nothing to click — clicking it here would close it again.
      expect(screen.getByText("资料")).toBeDefined();
      expect(screen.getByText("note-000.md")).toBeDefined();
      expect(screen.getByText("note-299.md")).toBeDefined();
      // A lookup that failed to find an existing sibling would show a duplicate.
      expect(screen.getAllByText("note-000.md")).toHaveLength(1);
    });

    it("nests a document under each of its folders, not just the last", () => {
      const deep: BookManifest = {
        id: "kb-deep",
        title: "深层",
        chapters: [
          { id: "d1", title: "期末", src: "专业课/第一学期/资料/期末.md" },
          { id: "d2", title: "期中", src: "专业课/第一学期/资料/期中.md" },
          { id: "d3", title: "概览", src: "专业课/第一学期/概览.md" },
        ],
      };

      render(
        <ChapterList manifest={deep} activeChapterId="d1" onSelectChapter={vi.fn()} />,
      );

      // Each level of the path becomes its own folder row.
      expect(screen.getByText("专业课")).toBeDefined();
      expect(screen.getByText("第一学期")).toBeDefined();
      expect(screen.getByText("资料")).toBeDefined();
      // And both documents under `资料` are present, not just the first.
      expect(screen.getByText("期末.md")).toBeDefined();
      expect(screen.getByText("期中.md")).toBeDefined();
    });

    it("handles backslash-separated paths the same as forward ones", () => {
      const windows: BookManifest = {
        id: "kb-win",
        title: "Windows 路径",
        chapters: [{ id: "x1", title: "章节", src: "guides\\concepts.md" }],
      };

      render(
        <ChapterList manifest={windows} activeChapterId="x1" onSelectChapter={vi.fn()} />,
      );

      // `guides` is one folder either way — not a single folder literally named
      // "guides\concepts.md".
      expect(screen.getByText("guides")).toBeDefined();
      expect(screen.getByText("concepts.md")).toBeDefined();
    });
  });

  /**
   * Hidden entries are ordered as a block after the visible ones, so turning the
   * preference on appends rather than interleaving. The point is that the tree a
   * reader was already reading does not move under them.
   */
  describe("隐藏文件的排序", () => {
    const withHidden: BookManifest = {
      id: "kb-hidden",
      title: "含隐藏文件",
      chapters: [
        { id: "a", title: "甲", src: "笔记.md" },
        { id: "b", title: "乙", src: ".草稿.md", hidden: true },
        { id: "c", title: "丙", src: "资料/正文.md" },
        { id: "d", title: "丁", src: ".archive/旧稿.md", hidden: true },
      ],
    };

    /** The order the rows actually appear in the DOM. */
    function renderedOrder(): string[] {
      return Array.from(document.querySelectorAll(".tree-row-name")).map(
        (node) => node.textContent ?? "",
      );
    }

    it("puts visible entries before hidden ones", () => {
      render(
        <ChapterList manifest={withHidden} activeChapterId="a" onSelectChapter={vi.fn()} />,
      );

      const order = renderedOrder();
      const firstHidden = order.findIndex((name) => name.startsWith("."));
      const lastVisible = order.reduce(
        (last, name, index) => (name.startsWith(".") ? last : index),
        -1,
      );

      expect(firstHidden).toBeGreaterThan(-1);
      // Every visible row comes before every hidden one.
      expect(lastVisible).toBeLessThan(firstHidden);
    });

    it("keeps folders ahead of documents inside each block", () => {
      const mixed: BookManifest = {
        id: "kb-mixed",
        title: "混合",
        chapters: [
          { id: "m1", title: "根文件", src: "aaa.md" },
          { id: "m2", title: "文件夹", src: "zzz/inner.md" },
        ],
      };

      render(
        <ChapterList manifest={mixed} activeChapterId="m1" onSelectChapter={vi.fn()} />,
      );

      // `zzz` is a folder and sorts after `aaa.md` by name, but folders lead.
      const order = renderedOrder();
      expect(order.indexOf("zzz")).toBeLessThan(order.indexOf("aaa.md"));
    });

    it("marks exactly the entries that are hidden", () => {
      render(
        <ChapterList manifest={withHidden} activeChapterId="a" onSelectChapter={vi.fn()} />,
      );

      const marked = Array.from(document.querySelectorAll(".tree-row-name.is-hidden")).map(
        (node) => node.textContent ?? "",
      );
      const unmarked = Array.from(
        document.querySelectorAll(".tree-row-name:not(.is-hidden)"),
      ).map((node) => node.textContent ?? "");

      // `.archive` is collapsed, so its child is not in the DOM at all — the
      // marker follows the name, and no visible-named row carries it.
      expect(marked.sort()).toEqual([".archive", ".草稿.md"].sort());
      expect(unmarked).toContain("笔记.md");
      expect(unmarked.some((name) => name.startsWith("."))).toBe(false);
    });
  });
});
