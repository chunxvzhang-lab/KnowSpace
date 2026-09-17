import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useUiStore,
  readStoredWidth,
  DIRECTORY_WIDTH_MAX,
  DIRECTORY_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  NOTICE_TIMEOUT_MS,
} from "../store/useUiStore";
import { loadPreferences } from "../services/storage";

/**
 * Tests for the first slice of the App.tsx state migration (R1).
 *
 * Zustand stores are module-level singletons, so state is snapshotted before
 * each test and restored afterwards — otherwise an action in one test leaks
 * into the next and failures become order-dependent.
 */
describe("useUiStore - UI chrome store", () => {
  const pristine = useUiStore.getState();

  beforeEach(() => {
    useUiStore.setState(pristine, true);
    vi.useRealTimers();
    // The store owns persistence now, so each test starts from empty storage —
    // otherwise a write in one test changes what the next one reads back.
    localStorage.clear();
  });

  afterEach(() => {
    useUiStore.setState(pristine, true);
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts with both panes open and the toc tab selected", () => {
      const state = useUiStore.getState();
      expect(state.sidebarOpen).toBe(true);
      expect(state.directoryOpen).toBe(true);
      expect(state.sidebarTab).toBe("toc");
    });

    it("starts with every overlay closed", () => {
      const state = useUiStore.getState();
      expect(state.lightboxMedia).toBeNull();
      expect(state.commandPaletteOpen).toBe(false);
      expect(state.versionHistoryOpen).toBe(false);
      expect(state.unsavedDialogOpen).toBe(false);
      expect(state.aboutOpen).toBe(false);
      expect(state.notice).toBeNull();
    });

    it("seeds preferences from the persisted storage layer", () => {
      // The store must not invent its own defaults — preferences already have
      // an owner, and duplicating them here would let the two drift.
      expect(useUiStore.getState().preferences).toEqual(loadPreferences());
    });
  });

  describe("layout actions", () => {
    it("toggles the sidebar and directory panes", () => {
      const { setSidebarOpen, setDirectoryOpen } = useUiStore.getState();

      setSidebarOpen(false);
      expect(useUiStore.getState().sidebarOpen).toBe(false);

      setSidebarOpen((prev) => !prev);
      expect(useUiStore.getState().sidebarOpen).toBe(true);

      setDirectoryOpen(false);
      expect(useUiStore.getState().directoryOpen).toBe(false);
    });

    it("switches the sidebar tab", () => {
      useUiStore.getState().setSidebarTab("search");
      expect(useUiStore.getState().sidebarTab).toBe("search");
    });

    it("clamps the directory width to the draggable range", () => {
      const { setDirectoryWidth } = useUiStore.getState();

      setDirectoryWidth(9999);
      expect(useUiStore.getState().directoryWidth).toBe(DIRECTORY_WIDTH_MAX);

      setDirectoryWidth(-50);
      expect(useUiStore.getState().directoryWidth).toBe(DIRECTORY_WIDTH_MIN);

      setDirectoryWidth(300);
      expect(useUiStore.getState().directoryWidth).toBe(300);
    });

    it("clamps the sidebar width to the draggable range", () => {
      const { setSidebarWidth } = useUiStore.getState();

      setSidebarWidth(9999);
      expect(useUiStore.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);

      setSidebarWidth(0);
      expect(useUiStore.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    });

    it("tracks which divider is being dragged", () => {
      useUiStore.getState().setResizingType("sidebar");
      expect(useUiStore.getState().resizingType).toBe("sidebar");

      useUiStore.getState().setResizingType(null);
      expect(useUiStore.getState().resizingType).toBeNull();
    });
  });

  describe("appearance actions", () => {
    it("applies a partial preference update without dropping the rest", () => {
      const before = useUiStore.getState().preferences;

      useUiStore.getState().patchPreferences({ fontScale: 1.4 });

      const after = useUiStore.getState().preferences;
      expect(after.fontScale).toBe(1.4);
      // Everything else survives
      expect(after.theme).toBe(before.theme);
      expect(after.showLineNumbers).toBe(before.showLineNumbers);
    });

    it("toggles between the light and dark themes", () => {
      useUiStore.getState().setPreferences({ theme: "twitter", fontScale: 1 });

      useUiStore.getState().toggleTheme();
      expect(useUiStore.getState().preferences.theme).toBe("light");

      useUiStore.getState().toggleTheme();
      expect(useUiStore.getState().preferences.theme).toBe("twitter");
    });

    it("toggles typewriter mode", () => {
      const initial = useUiStore.getState().typewriterMode;

      useUiStore.getState().toggleTypewriterMode();
      expect(useUiStore.getState().typewriterMode).toBe(!initial);

      useUiStore.getState().setTypewriterMode(false);
      expect(useUiStore.getState().typewriterMode).toBe(false);
    });
  });

  describe("overlays", () => {
    it("opens and closes the command palette with a functional update", () => {
      useUiStore.getState().setCommandPaletteOpen((prev) => !prev);
      expect(useUiStore.getState().commandPaletteOpen).toBe(true);

      useUiStore.getState().setCommandPaletteOpen((prev) => !prev);
      expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    });

    it("holds lightbox media", () => {
      useUiStore.getState().setLightboxMedia({ type: "image", src: "file:///a.png" });
      expect(useUiStore.getState().lightboxMedia).toEqual({
        type: "image",
        src: "file:///a.png",
      });

      useUiStore.getState().setLightboxMedia(null);
      expect(useUiStore.getState().lightboxMedia).toBeNull();
    });

    it("closes every overlay at once", () => {
      const store = useUiStore.getState();
      store.setCommandPaletteOpen(true);
      store.setVersionHistoryOpen(true);
      store.setAboutOpen(true);
      store.setUnsavedDialogOpen(true);
      store.setLightboxMedia({ type: "image", src: "x" });

      useUiStore.getState().closeAllOverlays();

      const after = useUiStore.getState();
      expect(after.commandPaletteOpen).toBe(false);
      expect(after.versionHistoryOpen).toBe(false);
      expect(after.aboutOpen).toBe(false);
      expect(after.unsavedDialogOpen).toBe(false);
      expect(after.lightboxMedia).toBeNull();
    });

    it("leaves the layout untouched when closing overlays", () => {
      useUiStore.getState().setSidebarTab("backlinks");
      useUiStore.getState().closeAllOverlays();
      expect(useUiStore.getState().sidebarTab).toBe("backlinks");
    });
  });

  describe("notices", () => {
    it("shows a notice immediately", () => {
      useUiStore.getState().notify("已保存");
      expect(useUiStore.getState().notice).toBe("已保存");
    });

    it("clears itself after the timeout", () => {
      vi.useFakeTimers();
      useUiStore.getState().notify("临时提示");
      expect(useUiStore.getState().notice).toBe("临时提示");

      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS);

      expect(useUiStore.getState().notice).toBeNull();
    });

    it("lets a newer notice cancel the previous timer", () => {
      vi.useFakeTimers();
      useUiStore.getState().notify("第一条");
      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS - 100);

      useUiStore.getState().notify("第二条");
      // The first timer must not clear the second notice
      vi.advanceTimersByTime(200);
      expect(useUiStore.getState().notice).toBe("第二条");

      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS);
      expect(useUiStore.getState().notice).toBeNull();
    });

    it("clears a notice immediately when passed null", () => {
      useUiStore.getState().notify("稍后清除");
      useUiStore.getState().notify(null);
      expect(useUiStore.getState().notice).toBeNull();
    });
  });

  describe("persistence", () => {
    it("writes both pane widths when the layout is persisted", () => {
      const store = useUiStore.getState();
      store.setDirectoryWidth(300);
      store.setSidebarWidth(420);

      store.persistLayout();

      expect(localStorage.getItem("bookmd.layout.dirWidth")).toBe("300");
      expect(localStorage.getItem("bookmd.layout.sidebarWidth")).toBe("420");
    });

    it("stays off the disk while a divider is being dragged", () => {
      // The resize handler calls these on every mousemove; a synchronous write
      // per frame would make the drag stutter, so only the end of the gesture
      // may reach storage.
      const store = useUiStore.getState();
      store.setDirectoryWidth(300);
      store.setDirectoryWidth(310);
      store.setDirectoryWidth(320);

      expect(localStorage.getItem("bookmd.layout.dirWidth")).toBeNull();
    });

    it("persists preferences so they survive a restart", () => {
      useUiStore.getState().setPreferences({ theme: "eink", fontScale: 1.4 });

      const reloaded = loadPreferences();
      expect(reloaded.theme).toBe("eink");
      expect(reloaded.fontScale).toBe(1.4);
    });

    it("persists a partial preferences patch", () => {
      useUiStore.getState().patchPreferences({ showLineNumbers: false });

      expect(loadPreferences().showLineNumbers).toBe(false);
    });

    it("persists a theme toggle", () => {
      useUiStore.getState().setPreferences({ theme: "twitter", fontScale: 1 });

      useUiStore.getState().toggleTheme();

      expect(loadPreferences().theme).toBe("light");
      expect(useUiStore.getState().preferences.theme).toBe("light");
    });

    it("persists the typewriter flag in both directions", () => {
      useUiStore.getState().setTypewriterMode(true);
      expect(localStorage.getItem("bookmd.editor.typewriter")).toBe("true");

      useUiStore.getState().toggleTypewriterMode();
      expect(localStorage.getItem("bookmd.editor.typewriter")).toBe("false");
      expect(useUiStore.getState().typewriterMode).toBe(false);
    });
  });

  describe("preferences updater form", () => {
    it("derives the next value from the current one", () => {
      useUiStore.getState().setPreferences({ theme: "twitter", fontScale: 1 });

      useUiStore.getState().setPreferences((prev) => ({ ...prev, fontScale: 1.8 }));

      expect(useUiStore.getState().preferences.fontScale).toBe(1.8);
      // The sibling field must survive
      expect(useUiStore.getState().preferences.theme).toBe("twitter");
    });

    it("composes successive updaters rather than last-one-wins", () => {
      // App.tsx has several call sites in this shape, so it is worth pinning
      // that they accumulate.
      const store = useUiStore.getState();
      store.setPreferences((prev) => ({ ...prev, fontScale: prev.fontScale + 0.5 }));
      store.setPreferences((prev) => ({ ...prev, fontScale: prev.fontScale + 0.5 }));

      expect(useUiStore.getState().preferences.fontScale).toBe(2);
    });
  });

  describe("readStoredWidth", () => {
    it("returns the stored value when it is in range", () => {
      localStorage.setItem("probe.width", "333.5");
      expect(readStoredWidth("probe.width", 240, 160, 480)).toBe(333.5);
    });

    it("falls back rather than clamping when the value is out of range", () => {
      // A stored 900 was written by something else; silently resizing the pane
      // to its maximum would be a stranger outcome than ignoring it.
      localStorage.setItem("probe.width", "900");
      expect(readStoredWidth("probe.width", 240, 160, 480)).toBe(240);

      localStorage.setItem("probe.width", "10");
      expect(readStoredWidth("probe.width", 240, 160, 480)).toBe(240);
    });

    it("falls back when nothing is stored", () => {
      expect(readStoredWidth("probe.missing", 260, 180, 520)).toBe(260);
    });

    it("falls back when the stored value is not a number", () => {
      localStorage.setItem("probe.width", "wide");
      expect(readStoredWidth("probe.width", 240, 160, 480)).toBe(240);
    });
  });

  describe("setNotice", () => {
    it("sets the notice without scheduling a clear of its own", () => {
      vi.useFakeTimers();
      useUiStore.getState().setNotice("由调用方负责清除");

      vi.advanceTimersByTime(NOTICE_TIMEOUT_MS * 2);

      // App.tsx owns the auto-clear through its own effect, so the raw setter
      // must not race it.
      expect(useUiStore.getState().notice).toBe("由调用方负责清除");
    });
  });

  describe("review focus", () => {
    // The flashcard review asks the shell to get out of the way. The chain is:
    // DailyReviewPanel → onReviewActiveChange → handleReviewActiveChange →
    // isReviewFocus → the `is-review-focus` class on .app-shell → CSS.
    //
    // The store is the middle of that chain. It is tested here because the two
    // ends are CSS and a class name, neither of which a unit test can reach —
    // so this at least pins the value the ends depend on.
    it("starts off, so the reader is not collapsed before a review begins", () => {
      expect(useUiStore.getState().isReviewFocus).toBe(false);
    });

    it("toggles in both directions", () => {
      useUiStore.getState().setReviewFocus(true);
      expect(useUiStore.getState().isReviewFocus).toBe(true);

      useUiStore.getState().setReviewFocus(false);
      expect(useUiStore.getState().isReviewFocus).toBe(false);
    });

    it("is not persisted", () => {
      // Leaving the review collapses the reader, but a restart must come back to
      // the reader rather than to a review nobody asked for — so this flag has
      // no localStorage key of its own, unlike the pane widths.
      useUiStore.getState().setReviewFocus(true);
      useUiStore.getState().persistLayout();

      const keys = Object.keys(localStorage);
      expect(keys.some((key) => /review/i.test(key))).toBe(false);
    });
  });
});
