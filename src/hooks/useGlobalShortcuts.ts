import { useEffect } from "react";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { ChapterSource } from "../core/types";
import type { DocumentSessionState } from "./useDocumentSession";

/**
 * How the app is driven from outside its own UI: the launch file, the
 * application menu, the close guard, flash-note refreshes, and the keyboard.
 *
 * Sixth logic hook out of App.tsx (R1 batch B3b-6). The two effects it holds
 * were five hundred lines apart in the component and belong together — both are
 * registrations that live for the life of the window and both are written in
 * terms of the same refs.
 *
 * Those refs are the point of the interface. Every one of them mirrors a value
 * App.tsx owns, because a handler registered once cannot close over a callback
 * that changes identity on the next render. Passing the mirrors in keeps that
 * mechanism intact; the alternative would be for this hook to reach back into
 * App, which it cannot.
 */

type UseGlobalShortcutsParams = {
  /** The launch file has already been handled this session. */
  initialHandledRef: { current: boolean };
  openDesktopMarkdownPathRef: {
    current: (absolutePath: string, preloadedSource?: ChapterSource | null) => void;
  };
  createNewFileRef: { current: () => void };
  openMarkdownDirectoryRef: { current: () => void };
  saveSessionRef: { current: () => void };
  saveSessionAsRef: { current: () => void };
  toggleFullscreenRef: { current: () => void };
  /**
   * Routes the window-close request through App's unsaved-changes guard.
   *
   * Typed as the one action this hook sends rather than as the guard's full
   * union, which keeps PendingAction App's business and still accepts the ref
   * unchanged: the narrower parameter is the assignable direction.
   */
  guardActionRef: { current: (action: { type: "close-window"; requestId: number }) => void };
  // The key handler is re-registered whenever these change, so they are passed
  // by value rather than through a mirror.
  toggleFullscreen: () => void;
  handleCloseDualSplit: () => void;
  handleCloseTab: (tabId: string) => void;
  selectChapter: (chapterId: string) => void;
  saveSession: () => void;
  saveSessionAs: () => void;
  createNewFile: () => void;
  openMarkdownDirectory: () => void;
  handlePrintDocument: () => void;
  handleToggleGraphPane: () => void;
  goPrevious: () => void;
  goNext: () => void;
  addBookmark: () => void;
  focusSearch: () => void;
  /**
   * Which pane the shortcuts act on.
   *
   * Takes an updater as well as a value, because one binding flips between two
   * panes by reading the current one.
   */
  setViewMode: (
    mode:
      | DocumentSessionState["viewMode"]
      | ((prev: DocumentSessionState["viewMode"]) => DocumentSessionState["viewMode"])
  ) => void;
};

export function useGlobalShortcuts({
  initialHandledRef,
  openDesktopMarkdownPathRef,
  createNewFileRef,
  openMarkdownDirectoryRef,
  saveSessionRef,
  saveSessionAsRef,
  toggleFullscreenRef,
  guardActionRef,
  toggleFullscreen,
  handleCloseDualSplit,
  handleCloseTab,
  selectChapter,
  saveSession,
  saveSessionAs,
  createNewFile,
  openMarkdownDirectory,
  handlePrintDocument,
  handleToggleGraphPane,
  goPrevious,
  goNext,
  addBookmark,
  focusSearch,
  setViewMode,
}: UseGlobalShortcutsParams) {
  const setNotice = useUiStore((s) => s.setNotice);
  const setManifest = useVaultStore((s) => s.setManifest);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const versionHistoryOpen = useUiStore((s) => s.versionHistoryOpen);
  const setVersionHistoryOpen = useUiStore((s) => s.setVersionHistoryOpen);
  const lightboxMedia = useUiStore((s) => s.lightboxMedia);
  const setLightboxMedia = useUiStore((s) => s.setLightboxMedia);
  const isFullscreen = useUiStore((s) => s.isFullscreen);
  const manifest = useVaultStore((s) => s.manifest);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const chapterId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const toggleTypewriterMode = useUiStore((s) => s.toggleTypewriterMode);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);

  useEffect(() => {
    if (!window.bookMDDesktop) return undefined;
    let cancelled = false;

    // 1. Fast path: check if synchronous launch data & pre-read source was injected during window creation
    const syncData = window.bookMDDesktop.getInitialSyncData?.();
    if (syncData?.filePath && !initialHandledRef.current) {
      initialHandledRef.current = true;
      openDesktopMarkdownPathRef.current(syncData.filePath, syncData.source);
    } else {
      window.bookMDDesktop
        .getLaunchFilePath()
        .then((filePath) => {
          if (!cancelled && filePath && !initialHandledRef.current) {
            initialHandledRef.current = true;
            openDesktopMarkdownPathRef.current(filePath);
          }
        })
        .catch((cause: unknown) => {
          setNotice(cause instanceof Error ? cause.message : "无法读取启动文件。");
        });
    }

    const unsubscribeOpen = window.bookMDDesktop.onOpenFilePath((filePath) => {
      openDesktopMarkdownPathRef.current(filePath);
    });

    const unsubscribeMenu = window.bookMDDesktop.onMenuCommand?.((command) => {
      if (command === "new-file") createNewFileRef.current();
      else if (command === "open-directory") openMarkdownDirectoryRef.current();
      else if (command === "save") saveSessionRef.current();
      else if (command === "save-as") saveSessionAsRef.current();
      else if (command === "toggle-fullscreen" || command === "togglefullscreen") toggleFullscreenRef.current();
    });

    const unsubscribeClose = window.bookMDDesktop.onBeforeClose?.(({ requestId }) => {
      guardActionRef.current({ type: "close-window", requestId });
    });

    const unsubscribeFlashNote = window.bookMDDesktop.onFlashNoteSaved?.(() => {
      if (manifest?.rootPath && window.bookMDDesktop?.refreshDirectory) {
        window.bookMDDesktop.refreshDirectory(manifest.rootPath).then((nextManifest) => {
          if (nextManifest) {
            setManifest(nextManifest);
          }
        }).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      unsubscribeOpen();
      unsubscribeMenu?.();
      unsubscribeClose?.();
      unsubscribeFlashNote?.();
    };
  }, [manifest?.rootPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable ||
        target?.closest(".cm-editor");

      if (event.key === "F11") {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      if (event.key === "Escape") {
        if (commandPaletteOpen) {
          event.preventDefault();
          setCommandPaletteOpen(false);
          return;
        }
        if (versionHistoryOpen) {
          event.preventDefault();
          setVersionHistoryOpen(false);
          return;
        }
        if (lightboxMedia) {
          event.preventDefault();
          setLightboxMedia(null);
          return;
        }
        if (dualSplitTabId) {
          event.preventDefault();
          handleCloseDualSplit();
          return;
        }
        if (isFullscreen) {
          event.preventDefault();
          toggleFullscreen();
          return;
        }
      }

      // Global Command Palette & Quick Switcher: Ctrl+K / Cmd+K (works everywhere, including inside editor)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Version History: Ctrl+Shift+H / Cmd+Shift+H
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setVersionHistoryOpen(true);
        return;
      }

      // Close active tab: Ctrl+W
      if (event.ctrlKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (chapterId) {
          handleCloseTab(chapterId);
        }
        return;
      }

      // Switch tabs: Ctrl+Tab / Ctrl+Shift+Tab
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        if (tabs.length > 1) {
          const currentIndex = tabs.findIndex((t) => t.id === chapterId);
          if (currentIndex !== -1) {
            const nextIndex = event.shiftKey
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length;
            selectChapter(tabs[nextIndex].id);
          }
        }
        return;
      }

      // Toggle Typewriter Mode: Alt+T
      if (event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        toggleTypewriterMode();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          saveSessionAs();
        } else {
          saveSession();
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNewFile();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (event.shiftKey) {
          openMarkdownDirectory();
        } else {
          // Open single file
          document.querySelector<HTMLInputElement>(".toolbar input[type='file']")?.click();
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        handlePrintDocument();
        return;
      }

      // Global navigation shortcuts that penetrate editor focus:
      if (event.ctrlKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        handleToggleGraphPane();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setViewMode((m) => (m === "mindmap" ? "split" : "mindmap"));
        return;
      }
      if (event.ctrlKey && event.key === "\\") {
        event.preventDefault();
        setDirectoryOpen((open) => !open);
        return;
      }

      if (isEditing) return;

      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        addBookmark();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        focusSearch();
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addBookmark,
    chapterId,
    commandPaletteOpen,
    createNewFile,
    dualSplitTabId,
    focusSearch,
    goNext,
    goPrevious,
    handleCloseDualSplit,
    handleCloseTab,
    handlePrintDocument,
    handleToggleGraphPane,
    isFullscreen,
    lightboxMedia,
    openMarkdownDirectory,
    saveSession,
    saveSessionAs,
    selectChapter,
    tabs,
    toggleFullscreen,
    toggleTypewriterMode,
  ]);}
