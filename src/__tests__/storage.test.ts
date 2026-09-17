import { describe, it, expect, beforeEach } from "vitest";
import { loadBookmarks, saveBookmarks, loadReadingPosition } from "../services/storage";
import type { Bookmark, ChapterManifest, ReadingPosition } from "../core/types";

describe("src/services/storage.ts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and loads bookmarks in V2 format", () => {
    const bookmark: Bookmark = {
      id: "bm-1",
      bookId: "book-1",
      chapterId: "chapter:path:intro.md",
      chapterSrc: "intro.md",
      scrollRatio: 0.5,
      excerpt: "Sample excerpt",
      chapterChecksum: "chk123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveBookmarks("book-1", [bookmark]);
    const loaded = loadBookmarks("book-1");
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe("bm-1");
    expect(loaded[0].chapterId).toBe("chapter:path:intro.md");
  });

  it("migrates V1 legacy chapter-1 bookmarks to stable IDs when chapters are provided", () => {
    const legacyBookmark: Bookmark = {
      id: "bm-legacy",
      bookId: "dir-1",
      chapterId: "chapter-1",
      scrollRatio: 0.2,
      excerpt: "Legacy bookmark",
      chapterChecksum: "oldchk",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("bookmd.bookmarks.v1", JSON.stringify({ "dir-1": [legacyBookmark] }));

    const chapters: ChapterManifest[] = [
      {
        id: "chapter:path:01-intro.md",
        title: "01 Intro",
        src: "01-intro.md",
      },
    ];

    const loaded = loadBookmarks("dir-1", chapters);
    expect(loaded.length).toBe(1);
    expect(loaded[0].chapterId).toBe("chapter:path:01-intro.md");
    expect(loaded[0].chapterSrc).toBe("01-intro.md");

    // Check V2 is written
    const v2Raw = localStorage.getItem("bookmd.bookmarks.v2");
    expect(v2Raw).toContain("chapter:path:01-intro.md");
  });

  it("migrates V1 reading position to V2 stable ID", () => {
    const legacyPos: ReadingPosition = {
      bookId: "dir-1",
      chapterId: "chapter-2",
      scrollRatio: 0.8,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("bookmd.positions.v1", JSON.stringify({ "dir-1": legacyPos }));

    const chapters: ChapterManifest[] = [
      { id: "chapter:path:01-intro.md", title: "01 Intro", src: "01-intro.md" },
      { id: "chapter:path:02-advanced.md", title: "02 Advanced", src: "02-advanced.md" },
    ];

    const loaded = loadReadingPosition("dir-1", chapters);
    expect(loaded).not.toBeNull();
    expect(loaded?.chapterId).toBe("chapter:path:02-advanced.md");
    expect(loaded?.chapterSrc).toBe("02-advanced.md");
  });

  it("loads default preferences with showLineNumbers true and saves updated preferences", async () => {
    const { loadPreferences, savePreferences } = await import("../services/storage");
    const defaultPrefs = loadPreferences();
    expect(defaultPrefs.showLineNumbers).toBe(true);
    expect(defaultPrefs.theme).toBe("system");

    savePreferences({
      theme: "twitter",
      fontScale: 1.1,
      showLineNumbers: false,
    });

    const updated = loadPreferences();
    expect(updated.showLineNumbers).toBe(false);
    expect(updated.theme).toBe("twitter");
    expect(updated.fontScale).toBe(1.1);
  });
});
