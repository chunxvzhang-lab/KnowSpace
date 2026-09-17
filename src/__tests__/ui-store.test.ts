import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useUiStore,
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
  });

  afterEach(() => {
    useUiStore.setState(pristine, true);
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
});
