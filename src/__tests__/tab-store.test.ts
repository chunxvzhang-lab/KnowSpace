import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  useTabStore,
  findTabIndex,
  tabsWithDirtyFlags,
  nextActiveAfterClose,
  tabsAfterClosingRight,
  RECENT_DOC_LIMIT,
  type TabMeta,
} from "../store/useTabStore";

const tab = (id: string, overrides: Partial<TabMeta> = {}): TabMeta => ({
  id,
  title: `标题 ${id}`,
  relativePath: `${id}.md`,
  ...overrides,
});

describe("useTabStore - tab state", () => {
  const pristine = useTabStore.getState();

  beforeEach(() => {
    useTabStore.setState(pristine, true);
  });

  afterEach(() => {
    useTabStore.setState(pristine, true);
  });

  describe("initial state", () => {
    it("starts with nothing open", () => {
      const state = useTabStore.getState();
      expect(state.tabs).toEqual([]);
      expect(state.activeTabId).toBe("");
      expect(state.dualSplitTabId).toBeNull();
      expect(state.recentVisitedDocIds).toEqual([]);
    });
  });

  describe("setTabs", () => {
    it("replaces the list with a value", () => {
      useTabStore.getState().setTabs([tab("a"), tab("b")]);
      expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
    });

    it("accepts an updater, which every appending call site relied on", () => {
      useTabStore.getState().setTabs([tab("a")]);
      useTabStore.getState().setTabs((prev) => [...prev, tab("b")]);
      expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
    });
  });

  describe("ensureTab", () => {
    it("appends a tab that is not open yet", () => {
      useTabStore.getState().ensureTab(tab("notes"));

      expect(useTabStore.getState().tabs).toHaveLength(1);
      expect(useTabStore.getState().tabs[0].id).toBe("notes");
    });

    it("refreshes the metadata of a tab that is already open", () => {
      useTabStore.getState().ensureTab(tab("notes", { title: "旧标题" }));
      useTabStore.getState().ensureTab(tab("notes", { title: "新标题" }));

      expect(useTabStore.getState().tabs).toHaveLength(1);
      expect(useTabStore.getState().tabs[0].title).toBe("新标题");
    });

    it("leaves the array untouched when nothing changed", () => {
      // This is the whole reason the B1 batch exists. The effect this replaced
      // ran on every render of a loaded document and had to compare fields to
      // avoid churning the tab list; keeping the comparison in the store means
      // the failure mode is a failing assertion rather than a render loop.
      const metadata = tab("notes");
      useTabStore.getState().ensureTab(metadata);
      const before = useTabStore.getState().tabs;

      useTabStore.getState().ensureTab({ ...metadata });

      expect(useTabStore.getState().tabs).toBe(before);
    });

    it("finds an existing tab by absolute path, ignoring case", () => {
      useTabStore.getState().ensureTab(
        tab("a", { absolutePath: "C:\\Vault\\Note.md" })
      );

      useTabStore.getState().ensureTab(
        tab("b", { absolutePath: "c:\\vault\\note.md" })
      );

      expect(useTabStore.getState().tabs).toHaveLength(1);
    });

    it("falls back to matching by title when neither side has a path", () => {
      // A document created in-app has no path yet, so its tab can only be
      // recognised by title until it is saved.
      useTabStore.getState().ensureTab({ id: "draft", title: "未命名", relativePath: "" });

      useTabStore.getState().ensureTab({ id: "draft", title: "未命名", relativePath: "" });

      expect(useTabStore.getState().tabs).toHaveLength(1);
    });
  });

  describe("findTabIndex", () => {
    it("returns -1 when nothing matches", () => {
      expect(findTabIndex([tab("a")], tab("b"))).toBe(-1);
    });

    it("takes the first tab matching any criterion, not the best match", () => {
      // Easy to misread, so it is pinned here: the three criteria are OR'd
      // inside a single findIndex, so an earlier tab matching only by title
      // beats a later one matching by id. This is exactly how the effect this
      // was extracted from behaved, and it is preserved rather than quietly
      // reordered.
      const tabs = [tab("a", { title: "甲" }), tab("b", { title: "甲" })];
      expect(findTabIndex(tabs, tab("b", { title: "甲" }))).toBe(0);
    });

    it("collapses same-titled path-less tabs onto the first one", () => {
      // Follows from the above: two in-app drafts with no path can only be told
      // apart by title, so the second one is treated as the first. Recorded so
      // that changing it later is a deliberate decision, not an accident.
      const tabs = [tab("draft-1", { title: "未命名", relativePath: "" })];
      expect(
        findTabIndex(tabs, tab("draft-2", { title: "未命名", relativePath: "" }))
      ).toBe(0);
    });

    it("does not fall back to title once either side has a path", () => {
      const tabs = [tab("a", { title: "同名", absolutePath: "/vault/a.md" })];
      expect(
        findTabIndex(tabs, tab("b", { title: "同名", absolutePath: "/vault/b.md" }))
      ).toBe(-1);
    });
  });

  describe("tabsWithDirtyFlags", () => {
    it("marks only the active tab when the session is dirty", () => {
      const flagged = tabsWithDirtyFlags([tab("a"), tab("b"), tab("c")], "b", true);

      expect(flagged.map((t) => t.isDirty)).toEqual([false, true, false]);
    });

    it("clears every flag when the session is clean", () => {
      const flagged = tabsWithDirtyFlags([tab("a"), tab("b")], "b", false);

      expect(flagged.every((t) => t.isDirty === false)).toBe(true);
    });

    it("marks nothing when the active id is not among the tabs", () => {
      const flagged = tabsWithDirtyFlags([tab("a")], "missing", true);

      expect(flagged.every((t) => t.isDirty === false)).toBe(true);
    });

    it("carries the rest of the tab through unchanged", () => {
      const flagged = tabsWithDirtyFlags(
        [tab("a", { title: "笔记", absolutePath: "/vault/a.md" })],
        "a",
        true
      );

      expect(flagged[0]).toMatchObject({
        id: "a",
        title: "笔记",
        relativePath: "a.md",
        absolutePath: "/vault/a.md",
        isDirty: true,
      });
    });
  });

  describe("nextActiveAfterClose", () => {
    it("takes the tab that slides into the closed slot", () => {
      const tabs = [tab("a"), tab("b"), tab("c")];
      expect(nextActiveAfterClose(tabs, "b")).toBe("c");
    });

    it("falls back to the new last tab when the last one closed", () => {
      const tabs = [tab("a"), tab("b"), tab("c")];
      expect(nextActiveAfterClose(tabs, "c")).toBe("b");
    });

    it("returns null when the last remaining tab closed", () => {
      expect(nextActiveAfterClose([tab("a")], "a")).toBeNull();
    });

    it("picks the first tab when the closed id was never open", () => {
      // Mirrors the arithmetic the inline version used: a missing id gave
      // closedIndex -1, which clamped to 0.
      expect(nextActiveAfterClose([tab("a"), tab("b")], "ghost")).toBe("a");
    });
  });

  describe("tabsAfterClosingRight", () => {
    it("keeps the target and everything to its left", () => {
      const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
      expect(tabsAfterClosingRight(tabs, "b")?.map((t) => t.id)).toEqual(["a", "b"]);
    });

    it("returns null for a tab that is not open", () => {
      // The caller relies on this to skip the split-pane and active-tab checks,
      // which is what the inline early return did.
      expect(tabsAfterClosingRight([tab("a")], "ghost")).toBeNull();
    });
  });

  describe("rememberVisitedDoc", () => {
    it("puts the newest document first", () => {
      const store = useTabStore.getState();
      store.rememberVisitedDoc("a");
      store.rememberVisitedDoc("b");

      expect(useTabStore.getState().recentVisitedDocIds).toEqual(["b", "a"]);
    });

    it("moves a revisited document to the front instead of duplicating it", () => {
      const store = useTabStore.getState();
      store.rememberVisitedDoc("a");
      store.rememberVisitedDoc("b");
      store.rememberVisitedDoc("a");

      expect(useTabStore.getState().recentVisitedDocIds).toEqual(["a", "b"]);
    });

    it("caps the list", () => {
      const store = useTabStore.getState();
      for (let i = 0; i < RECENT_DOC_LIMIT + 5; i += 1) store.rememberVisitedDoc(`doc-${i}`);

      const recent = useTabStore.getState().recentVisitedDocIds;
      expect(recent).toHaveLength(RECENT_DOC_LIMIT);
      expect(recent[0]).toBe(`doc-${RECENT_DOC_LIMIT + 4}`);
    });

    it("ignores an empty id", () => {
      const before = useTabStore.getState().recentVisitedDocIds;
      useTabStore.getState().rememberVisitedDoc("");

      expect(useTabStore.getState().recentVisitedDocIds).toBe(before);
    });

    it("does not churn when the document is already at the front", () => {
      useTabStore.getState().rememberVisitedDoc("a");
      const before = useTabStore.getState().recentVisitedDocIds;

      useTabStore.getState().rememberVisitedDoc("a");

      expect(useTabStore.getState().recentVisitedDocIds).toBe(before);
    });
  });

  describe("split pane", () => {
    it("tracks the tab shown beside the active one", () => {
      useTabStore.getState().setDualSplitTabId("b");
      expect(useTabStore.getState().dualSplitTabId).toBe("b");

      useTabStore.getState().setDualSplitTabId(null);
      expect(useTabStore.getState().dualSplitTabId).toBeNull();
    });

    it("keeps the active tab independent of the split pane", () => {
      useTabStore.getState().setActiveTabId("a");
      useTabStore.getState().setDualSplitTabId("b");

      expect(useTabStore.getState().activeTabId).toBe("a");
      expect(useTabStore.getState().dualSplitTabId).toBe("b");
    });
  });
});
