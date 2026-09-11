import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TocPanel } from "../components/TocPanel";
import { BookmarkPanel } from "../components/BookmarkPanel";
import type { Heading, Bookmark, BookManifest } from "../core/types";

describe("TOC and Bookmark Panels Sub-function Tests", () => {
  describe("TocPanel", () => {
    it("renders empty state when no headings exist", () => {
      render(
        <TocPanel
          headings={[]}
          onJump={vi.fn()}
        />
      );
      expect(screen.getByText("本章没有标题。")).toBeDefined();
    });

    it("renders hierarchical headings, active highlight, bookmark indicator, and triggers jump", () => {
      const headings: Heading[] = [
        { id: "h1-intro", level: 1, text: "一、引言背景" },
        { id: "h2-arch", level: 2, text: "1.1 系统架构" },
        { id: "h2-impl", level: 2, text: "1.2 实现细节" },
      ];

      const bookmarkedIds = new Set(["h2-arch"]);
      const onJump = vi.fn();

      render(
        <TocPanel
          headings={headings}
          activeHeadingId="h2-arch"
          bookmarkedHeadingIds={bookmarkedIds}
          onJump={onJump}
        />
      );

      expect(screen.getByText("一、引言背景")).toBeDefined();
      expect(screen.getByText("1.1 系统架构")).toBeDefined();
      expect(screen.getByText("1.2 实现细节")).toBeDefined();

      // Active heading has active class
      const activeBtn = screen.getByText("1.1 系统架构").closest("button")!;
      expect(activeBtn.classList.contains("active")).toBe(true);

      // Bookmark indicator rendered on bookmarked heading
      expect(activeBtn.querySelector(".toc-bookmark-marker")).not.toBeNull();

      // Non-bookmarked heading does not have bookmark marker
      const nonBookmarkedBtn = screen.getByText("1.2 实现细节").closest("button")!;
      expect(nonBookmarkedBtn.querySelector(".toc-bookmark-marker")).toBeNull();

      // Click heading to jump
      fireEvent.click(nonBookmarkedBtn);
      expect(onJump).toHaveBeenCalledWith("h2-impl");
    });
  });

  describe("BookmarkPanel", () => {
    const mockManifest: BookManifest = {
      id: "test-book",
      title: "测试知识库",
      chapters: [
        { id: "chap-1", title: "第一章", src: "chapter-1.md" },
        { id: "chap-2", title: "第二章", src: "chapter-2.md" },
      ],
    };

    it("renders empty state when no bookmarks exist", () => {
      render(
        <BookmarkPanel
          bookmarks={[]}
          manifest={mockManifest}
          onJump={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText(/还没有书签/)).toBeDefined();
    });

    it("renders bookmarks list, resolves chapter title, and triggers jump & delete", () => {
      const bookmarks: Bookmark[] = [
        {
          id: "bm-1",
          bookId: "bk-1",
          chapterId: "chap-1",
          headingId: "h1-intro",
          headingText: "引言大纲",
          scrollRatio: 0.2,
          chapterChecksum: "chk-1",
          excerpt: "这是引言的一段摘要内容...",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const onJump = vi.fn();
      const onDelete = vi.fn();

      render(
        <BookmarkPanel
          bookmarks={bookmarks}
          manifest={mockManifest}
          onJump={onJump}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText("引言大纲")).toBeDefined();
      expect(screen.getByText("第一章")).toBeDefined();
      expect(screen.getByText("这是引言的一段摘要内容...")).toBeDefined();

      // Jump click
      fireEvent.click(screen.getByText("引言大纲"));
      expect(onJump).toHaveBeenCalledWith(bookmarks[0]);

      // Delete click
      const deleteBtn = screen.getByTitle("删除书签");
      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith("bm-1");
    });
  });
});
