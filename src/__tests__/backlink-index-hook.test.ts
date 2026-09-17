import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBacklinkIndex } from "../hooks/useBacklinkIndex";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { resetStores, restoreStores } from "./helpers/resetStores";

type Params = Parameters<typeof useBacklinkIndex>[0];

const defaults: Params = {
  session: null,
  activeChapter: undefined,
  selectChapter: () => {},
  editorViewRef: { current: null },
  sessionRef: { current: null },
  openDesktopMarkdownPathRef: { current: () => {} },
  updateSource: (() => {}) as unknown as Params["updateSource"],
};

/** A session object carrying only the fields these derived values read. */
const sessionWith = (over: Record<string, unknown>) =>
  over as unknown as Params["session"];

describe("useBacklinkIndex - derived values", () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    restoreStores();
  });

  const mount = (overrides: Partial<Params> = {}) =>
    renderHook(() => useBacklinkIndex({ ...defaults, ...overrides }));

  describe("currentDocTitle", () => {
    it("prefers the active chapter's title", () => {
      const { result } = mount({
        activeChapter: { id: "ch-1", title: "章节标题", src: "ch-1.md" },
        session: sessionWith({ fileName: "文件名.md" }),
      });

      expect(result.current.currentDocTitle).toBe("章节标题");
    });

    it("falls back to the file name without its extension", () => {
      const { result } = mount({
        session: sessionWith({ fileName: "我的笔记.md" }),
      });

      expect(result.current.currentDocTitle).toBe("我的笔记");
    });

    it("is empty when nothing is open", () => {
      expect(mount().result.current.currentDocTitle).toBe("");
    });
  });

  describe("currentActiveId", () => {
    it("prefers the open tab", () => {
      useTabStore.getState().setActiveTabId("tab-1");
      const { result } = mount({ session: sessionWith({ chapterId: "ch-9" }) });

      expect(result.current.currentActiveId).toBe("tab-1");
    });

    it("falls back to the session's chapter", () => {
      const { result } = mount({ session: sessionWith({ chapterId: "ch-9" }) });

      expect(result.current.currentActiveId).toBe("ch-9");
    });

    it("falls back again to the absolute path, then the file name", () => {
      const byPath = mount({ session: sessionWith({ absolutePath: "C:/v/a.md" }) });
      expect(byPath.result.current.currentActiveId).toBe("C:/v/a.md");

      const byName = mount({ session: sessionWith({ fileName: "a.md" }) });
      expect(byName.result.current.currentActiveId).toBe("a.md");
    });

    it("is undefined when nothing is open", () => {
      expect(mount().result.current.currentActiveId).toBeUndefined();
    });
  });

  describe("gating", () => {
    it("computes no unlinked mentions while the backlinks panel is closed", () => {
      // The mentions are only useful beside the panel, and computing them walks
      // the whole index — which is why the panel being open is a precondition
      // rather than a display detail.
      useUiStore.getState().setSidebarOpen(false);
      useUiStore.getState().setSidebarTab("toc");
      const { result } = mount({
        activeChapter: { id: "ch-1", title: "标题", src: "ch-1.md" },
        session: sessionWith({ chapterId: "ch-1" }),
      });

      expect(result.current.currentUnlinkedMentions).toEqual([]);
    });

    it("computes no unlinked mentions without an open document", () => {
      useUiStore.getState().setSidebarOpen(true);
      useUiStore.getState().setSidebarTab("backlinks");
      const { result } = mount();

      expect(result.current.currentUnlinkedMentions).toEqual([]);
    });

    it("returns an empty graph while neither the pane nor the panel is open", () => {
      useUiStore.getState().setSidebarOpen(false);
      useUiStore.getState().setSidebarTab("toc");
      useUiStore.getState().setGraphPaneOpen(false);
      const { result } = mount();

      expect(result.current.graphData).toEqual({ nodes: [], edges: [] });
    });

    it("returns references as an array for the current document", () => {
      const { result } = mount({
        activeChapter: { id: "ch-1", title: "标题", src: "ch-1.md" },
        session: sessionWith({ chapterId: "ch-1", fileName: "ch-1.md" }),
      });

      // Nothing is indexed yet, so this is the empty case — the point is that a
      // titled, open document produces an array rather than short-circuiting.
      expect(Array.isArray(result.current.currentLinkedReferences)).toBe(true);
    });

    it("returns no references without a document title", () => {
      expect(mount().result.current.currentLinkedReferences).toEqual([]);
    });
  });
});
