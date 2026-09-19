import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chapterForFile,
  listingWithNewChapter,
  useVaultStore,
} from "../store/useVaultStore";
import { loadBookmarks } from "../services/storage";
import type { BookManifest, Bookmark, ChapterManifest } from "../core/types";

const manifest: BookManifest = {
  id: "vault-1",
  title: "测试库",
  rootPath: "C:\\Vault",
  chapters: [{ id: "ch-1", title: "第一章", src: "ch-1.md" }],
};

const bookmark = (id: string): Bookmark => ({
  id,
  bookId: manifest.id,
  chapterId: "ch-1",
  scrollRatio: 0,
  excerpt: `摘录 ${id}`,
  chapterChecksum: "checksum",
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
});

describe("useVaultStore - vault state", () => {
  const pristine = useVaultStore.getState();

  beforeEach(() => {
    useVaultStore.setState(pristine, true);
    localStorage.clear();
  });

  afterEach(() => {
    useVaultStore.setState(pristine, true);
    localStorage.clear();
  });

  describe("initial state", () => {
    it("has no folder open", () => {
      expect(useVaultStore.getState().manifest).toBeNull();
      expect(useVaultStore.getState().bookmarks).toEqual([]);
    });

    it("starts with two usable indexes rather than null", () => {
      // Both are consumed directly by lookups that expect a structure, so an
      // empty index is the correct starting point, not an absent one.
      expect(useVaultStore.getState().backlinkIndex).toBeDefined();
      expect(useVaultStore.getState().vaultSearchIndex).toBeDefined();
    });

    it("scopes a fresh search to the current chapter", () => {
      const state = useVaultStore.getState();
      expect(state.searchQuery).toBe("");
      expect(state.searchScope).toBe("current");
      expect(state.activeSearchMatchId).toBeNull();
    });
  });

  describe("manifest", () => {
    it("holds the open folder", () => {
      useVaultStore.getState().setManifest(manifest);
      expect(useVaultStore.getState().manifest).toEqual(manifest);
    });

    it("can be cleared", () => {
      useVaultStore.getState().setManifest(manifest);
      useVaultStore.getState().setManifest(null);
      expect(useVaultStore.getState().manifest).toBeNull();
    });
  });

  describe("persistBookmarks", () => {
    it("replaces the list and writes it to storage", () => {
      useVaultStore.getState().setManifest(manifest);

      useVaultStore.getState().persistBookmarks([bookmark("b1"), bookmark("b2")]);

      expect(useVaultStore.getState().bookmarks.map((b) => b.id)).toEqual(["b1", "b2"]);
      // Read back through the public loader rather than the raw key, so the
      // assertion covers the round trip a restart would actually perform.
      const reloaded = loadBookmarks(manifest.id, manifest.chapters);
      expect(reloaded.map((b) => b.id)).toEqual(["b1", "b2"]);
    });

    it("does nothing when no folder is open", () => {
      // Kept from the previous implementation: there is no id to file them
      // under, so neither the state nor storage may change.
      const before = useVaultStore.getState().bookmarks;

      useVaultStore.getState().persistBookmarks([bookmark("b1")]);

      expect(useVaultStore.getState().bookmarks).toBe(before);
    });

    it("survives a second write by replacing rather than appending", () => {
      useVaultStore.getState().setManifest(manifest);
      useVaultStore.getState().persistBookmarks([bookmark("b1")]);

      useVaultStore.getState().persistBookmarks([bookmark("b2")]);

      expect(loadBookmarks(manifest.id, manifest.chapters).map((b) => b.id)).toEqual(["b2"]);
    });
  });

  describe("setBookmarks", () => {
    it("replaces the list without touching storage", () => {
      // The plain setter exists for the file-opening flow, which loads
      // bookmarks for a folder that is only just becoming the open one — the
      // manifest is set at the same moment, so writing there would race it.
      useVaultStore.getState().setManifest(manifest);

      useVaultStore.getState().setBookmarks([bookmark("b1")]);

      expect(useVaultStore.getState().bookmarks.map((b) => b.id)).toEqual(["b1"]);
      expect(loadBookmarks(manifest.id, manifest.chapters)).toEqual([]);
    });
  });

  describe("indexes", () => {
    it("accepts a replacement backlink index", () => {
      const index = useVaultStore.getState().backlinkIndex;
      useVaultStore.getState().setBacklinkIndex(index);
      expect(useVaultStore.getState().backlinkIndex).toBe(index);
    });

    it("accepts a replacement search index", () => {
      const index = useVaultStore.getState().vaultSearchIndex;
      useVaultStore.getState().setVaultSearchIndex(index);
      expect(useVaultStore.getState().vaultSearchIndex).toBe(index);
    });

    it("accepts an updater for the search index", () => {
      // The incremental update path hands the store a function, because the
      // next index is derived from the current one.
      const index = useVaultStore.getState().vaultSearchIndex;
      let received: unknown;

      useVaultStore.getState().setVaultSearchIndex((prev) => {
        received = prev;
        return index;
      });

      expect(received).toBe(index);
      expect(useVaultStore.getState().vaultSearchIndex).toBe(index);
    });
  });

  describe("search fields", () => {
    it("tracks the query, the scope and the highlighted hit", () => {
      const store = useVaultStore.getState();

      store.setSearchQuery("关键词");
      store.setSearchScope("vault");
      store.setActiveSearchMatchId("hit-9");

      const state = useVaultStore.getState();
      expect(state.searchQuery).toBe("关键词");
      expect(state.searchScope).toBe("vault");
      expect(state.activeSearchMatchId).toBe("hit-9");
    });

    it("clears the highlighted hit independently of the query", () => {
      const store = useVaultStore.getState();
      store.setSearchQuery("关键词");
      store.setActiveSearchMatchId("hit-9");

      store.setActiveSearchMatchId(null);

      expect(useVaultStore.getState().activeSearchMatchId).toBeNull();
      expect(useVaultStore.getState().searchQuery).toBe("关键词");
    });
  });
});

/**
 * The listing after a file was written into it, when there is no folder to re-read.
 *
 * A fallback, but a fallback with rules — and the rules are the kind that only show
 * up in a listing that has more in it than the four fields the old inline version
 * rebuilt by hand.
 */
describe("新的文件写进清单之后", () => {
  const newChapter: ChapterManifest = {
    id: "ch-2",
    title: "第二章",
    src: "ch-2.md",
    absolutePath: "C:\\Vault\\ch-2.md",
  };

  it("清单还在：它的一切都留着，只是多了一章", () => {
    const listed = listingWithNewChapter(
      { ...manifest, description: "一本测试用的书" },
      newChapter,
      "C:\\Vault\\ch-2.md"
    );

    expect(listed.chapters.map((chapter) => chapter.id)).toEqual(["ch-1", "ch-2"]);
    // The field the old rebuild dropped: it assembled the listing out of four
    // fields it knew about, and a manifest carries more than four. A copy cannot
    // lose a field it does not know about.
    expect(listed.description).toBe("一本测试用的书");
    expect(listed.id).toBe("vault-1");
    expect(listed.rootPath).toBe("C:\\Vault");
  });

  it("清单不存在：围着这一个文件建起来，id 说明它从哪来", () => {
    const listed = listingWithNewChapter(null, newChapter, "C:\\Vault\\ch-2.md");

    expect(listed).toEqual({
      id: "directory:C:\\Vault\\ch-2.md",
      title: "第二章",
      // No folder was open, so the listing has none — saying the file's own path
      // here would make every later refresh look for a folder that is not one.
      rootPath: undefined,
      chapters: [newChapter],
    });
  });
});

/**
 * Which chapter a file that was just written became.
 *
 * Null when the listing does not know the path, which is the caller's cue to use the
 * chapter the write itself reported: the listing is the authority when it knows, and
 * the write's answer is when it does not.
 */
describe("刚写下的文件是哪一章", () => {
  const listed: BookManifest = {
    ...manifest,
    chapters: [
      { id: "ch-1", title: "第一章", src: "ch-1.md", absolutePath: "C:\\Vault\\ch-1.md" },
    ],
  };

  it("按路径找到它，大小写不算区别", () => {
    // A folder re-read hands back the path in the platform's own casing, which is
    // not always the casing the write reported.
    expect(chapterForFile(listed, "c:\\vault\\CH-1.MD")?.id).toBe("ch-1");
  });

  it("清单不认识这个路径：null，交给调用方", () => {
    expect(chapterForFile(listed, "C:\\Vault\\别的.md")).toBeNull();
    expect(chapterForFile(null, "C:\\Vault\\ch-1.md")).toBeNull();
  });

  it("章节自己没有路径时，不会跟一个没路径的请求凑成一对", () => {
    // The rule from samePath, seen from this side: a chapter that has no file is not
    // the file that was just written, however little there is to tell them apart.
    const noPaths: BookManifest = {
      ...manifest,
      chapters: [{ id: "ch-1", title: "第一章", src: "ch-1.md" }],
    };

    expect(chapterForFile(noPaths, "C:\\Vault\\ch-1.md")).toBeNull();
  });
});
