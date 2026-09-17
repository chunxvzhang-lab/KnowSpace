import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVaultOpening } from "../hooks/useVaultOpening";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";
import {
  installDesktopMock,
  removeDesktopMock,
  sampleSource,
  SAMPLE_MANIFEST,
  type DesktopMock,
} from "./helpers/desktopMock";
import { resetStores, restoreStores } from "./helpers/resetStores";

type Params = Parameters<typeof useVaultOpening>[0];

describe("useVaultOpening", () => {
  let desktop: DesktopMock;
  let openSession: Params["openSession"];
  let setViewMode: Params["setViewMode"];
  let activeLoadedChapterIdRef: { current: string };
  let pendingBookmarkRef: Params["pendingBookmarkRef"];

  beforeEach(() => {
    resetStores();
    desktop = installDesktopMock();
    openSession = vi.fn() as unknown as Params["openSession"];
    setViewMode = vi.fn() as unknown as Params["setViewMode"];
    activeLoadedChapterIdRef = { current: "" };
    pendingBookmarkRef = { current: null };
  });

  afterEach(() => {
    removeDesktopMock();
    restoreStores();
    vi.restoreAllMocks();
  });

  const mount = () =>
    renderHook(() =>
      useVaultOpening({
        openSession,
        setViewMode,
        activeLoadedChapterIdRef,
        pendingBookmarkRef,
      })
    );

  describe("opening a folder", () => {
    it("does nothing when the folder dialog is cancelled", async () => {
      await mount().result.current.doOpenMarkdownDirectory();

      expect(useVaultStore.getState().manifest).toBeNull();
      expect(openSession).not.toHaveBeenCalled();
      expect(useTabStore.getState().tabs).toEqual([]);
    });

    it("adopts the folder and opens its first document", async () => {
      desktop.openDirectory.mockResolvedValue({
        canceled: false,
        directory: SAMPLE_MANIFEST,
      });

      await mount().result.current.doOpenMarkdownDirectory();

      const state = useVaultStore.getState();
      expect(state.manifest).toEqual(SAMPLE_MANIFEST);
      expect(activeLoadedChapterIdRef.current).toBe(SAMPLE_MANIFEST.chapters[0].id);
      expect(useTabStore.getState().activeTabId).toBe(SAMPLE_MANIFEST.chapters[0].id);
      expect(openSession).toHaveBeenCalledTimes(1);
    });

    it("registers a tab for the document it opened", async () => {
      desktop.openDirectory.mockResolvedValue({
        canceled: false,
        directory: SAMPLE_MANIFEST,
      });

      await mount().result.current.doOpenMarkdownDirectory();

      const { tabs, activeTabId } = useTabStore.getState();
      expect(tabs.some((t) => t.id === activeTabId)).toBe(true);
    });
  });

  describe("opening a file by path", () => {
    it("opens the session on that file", async () => {
      desktop.getDirectoryForFile.mockResolvedValue(null);

      await mount().result.current.doOpenDesktopMarkdownPath("/vault/note.md");

      expect(desktop.readMarkdownFile).toHaveBeenCalledWith("/vault/note.md");
      expect(openSession).toHaveBeenCalledTimes(1);
      expect(useVaultStore.getState().manifest).not.toBeNull();
      expect(useTabStore.getState().activeTabId).not.toBe("");
    });

    it("blocks a slow open that a newer request has overtaken", async () => {
      // openRequestRef counts requests. A read that resolves after a newer open
      // began must abandon its result rather than overwrite the newer one —
      // otherwise opening two files quickly leaves whichever finished last.
      desktop.getDirectoryForFile.mockResolvedValue(null);
      let releaseFirst: (value: unknown) => void = () => {};
      desktop.readMarkdownFile.mockImplementationOnce(
        () => new Promise((resolve) => { releaseFirst = resolve; })
      );

      const { result } = mount();
      const first = result.current.doOpenDesktopMarkdownPath("/vault/slow.md");
      // The second call bumps the counter while the first read is still pending.
      await result.current.doOpenDesktopMarkdownPath("/vault/fast.md");

      releaseFirst(sampleSource("# slow", "/vault/slow.md"));
      await first;

      expect(desktop.readMarkdownFile).toHaveBeenCalledTimes(2);
      expect(openSession).toHaveBeenCalledTimes(1);
    });
  });
});
