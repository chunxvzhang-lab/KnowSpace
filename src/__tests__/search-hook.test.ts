import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearch } from "../hooks/useSearch";
import {
  buildVaultSearchIndex,
  updateVaultSearchIndexForDocument,
} from "../services/searchIndexService";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import { resetStores, restoreStores } from "./helpers/resetStores";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { extractHeadingsFromSource } from "../services/markdown";

type Params = Parameters<typeof useSearch>[0];

/** A vault index holding one document, built the same way the app builds it. */
function indexWith(docId: string, title: string, content: string, path?: string) {
  return updateVaultSearchIndexForDocument(buildVaultSearchIndex([]), docId, title, content, path);
}

const defaults: Params = {
  renderedChapter: null,
  session: null,
  viewMode: "read",
  editorViewRef: { current: null },
  readerRef: { current: null },
  selectChapterRef: { current: () => {} },
  setActiveHeadingId: () => {},
  navLockUntilRef: { current: 0 },
  pendingNavigationRef: { current: null },
};

/** Puts the results on screen, which is a precondition for searching at all. */
function showSearchPanel() {
  useUiStore.getState().setSidebarOpen(true);
  useUiStore.getState().setSidebarTab("search");
}

describe("useSearch", () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    restoreStores();
  });

  const mount = (overrides: Partial<Params> = {}) =>
    renderHook(() => useSearch({ ...defaults, ...overrides }));

  it("routes live heading, block, search and progress jumps to the editor while preserving the hidden reader", async () => {
    const source = "# original\n\ntext ^block\n\n## new heading\n\nsearch target";
    const state = EditorState.create({ doc: source });
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { value: 500 });
    scroller.scrollTo = vi.fn();
    const reader = document.createElement("div");
    reader.scrollTo = vi.fn();
    const editor = {
      state,
      scrollDOM: scroller,
      dispatch: vi.fn(),
      focus: vi.fn(),
    } as unknown as EditorView;
    const session = { source } as NonNullable<Params["session"]>;
    const { result } = mount({
      viewMode: "live",
      session,
      editorViewRef: { current: editor },
      readerRef: { current: reader },
    });
    const heading = extractHeadingsFromSource(source).at(-1)!;
    await result.current.jumpToHeading(heading.id, "auto");
    expect(editor.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selection: { anchor: state.doc.line(5).from, head: state.doc.line(5).from },
      }),
    );
    await result.current.jumpToHeading("^block", "auto");
    expect(editor.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selection: { anchor: state.doc.line(3).from, head: state.doc.line(3).to },
      }),
    );
    await result.current.handleSearchJump({
      index: 0,
      lineNumber: 7,
      title: "hit",
      excerpt: "search target",
    });
    expect(editor.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selection: { anchor: state.doc.line(7).from, head: state.doc.line(7).from },
      }),
    );
    result.current.jumpToRatio(0.5);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 750, behavior: "smooth" });
    expect(reader.scrollTo).not.toHaveBeenCalled();
    expect(editor.focus).toHaveBeenCalled();
  });

  describe("results", () => {
    it("returns nothing for a blank query", () => {
      showSearchPanel();
      useVaultStore
        .getState()
        .setVaultSearchIndex(indexWith("doc-1", "文档一", "# 标题\n\n这里有关键词"));
      useVaultStore.getState().setSearchScope("vault");

      expect(mount().result.current.searchResults).toEqual([]);
    });

    it("returns nothing for a query that is only whitespace", () => {
      showSearchPanel();
      useVaultStore
        .getState()
        .setVaultSearchIndex(indexWith("doc-1", "文档一", "# 标题\n\n这里有关键词"));
      useVaultStore.getState().setSearchScope("vault");
      useVaultStore.getState().setSearchQuery("   ");

      expect(mount().result.current.searchResults).toEqual([]);
    });

    it("returns nothing while the results are not on screen", () => {
      // The panel is closed and the palette is shut, so a query left over from
      // last time must not produce anything.
      useUiStore.getState().setSidebarOpen(false);
      useUiStore.getState().setSidebarTab("toc");
      useVaultStore
        .getState()
        .setVaultSearchIndex(indexWith("doc-1", "文档一", "# 标题\n\n这里有关键词"));
      useVaultStore.getState().setSearchScope("vault");
      useVaultStore.getState().setSearchQuery("关键词");

      expect(mount().result.current.searchResults).toEqual([]);
    });

    it("searches the whole vault in vault scope", () => {
      showSearchPanel();
      useVaultStore
        .getState()
        .setVaultSearchIndex(
          indexWith("doc-1", "文档一", "# 标题\n\n这里有关键词出现", "doc-1.md"),
        );
      useVaultStore.getState().setSearchScope("vault");
      useVaultStore.getState().setSearchQuery("关键词");

      const results = mount().result.current.searchResults;

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chapterId).toBe("doc-1");
    });

    it("searches the command palette from anywhere", () => {
      // The palette shows results regardless of which side panel is open.
      useUiStore.getState().setSidebarOpen(false);
      useUiStore.getState().setSidebarTab("toc");
      useUiStore.getState().setCommandPaletteOpen(true);
      useVaultStore
        .getState()
        .setVaultSearchIndex(
          indexWith("doc-1", "文档一", "# 标题\n\n这里有关键词出现", "doc-1.md"),
        );
      useVaultStore.getState().setSearchScope("vault");
      useVaultStore.getState().setSearchQuery("关键词");

      expect(mount().result.current.searchResults.length).toBeGreaterThan(0);
    });

    it("finds nothing in the current chapter when none is rendered", () => {
      showSearchPanel();
      useVaultStore.getState().setSearchScope("current");
      useVaultStore.getState().setSearchQuery("关键词");

      // Chapter scope reads the rendered document, and there is not one.
      expect(mount().result.current.searchResults).toEqual([]);
    });
  });
});
