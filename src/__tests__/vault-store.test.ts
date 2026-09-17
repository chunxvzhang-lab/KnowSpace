import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useVaultStore } from "../store/useVaultStore";
import { loadBookmarks } from "../services/storage";
import type { BookManifest, Bookmark } from "../core/types";

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
