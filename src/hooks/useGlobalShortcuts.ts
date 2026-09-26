import { useEffect } from "react";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { ChapterSource } from "../core/types";
import { commandBus } from "../services/commandBus";

/**
 * How the app is driven from outside its own UI: the launch file, the
 * application menu, the close guard, flash-note refreshes, and the keyboard.
 *
 * Sixth logic hook out of App.tsx (R1 batch B3b-6). The two effects it holds
 * were five hundred lines apart in the component and belong together — both are
 * registrations that live for the life of the window and both are written in
 * terms of the same refs.
 *
 * Since the command bus (phase 1 batch 1), the keyboard and the menu no longer
 * hold their own copies of what actions do: a key that matches a command in
 * core/commands.ts executes `commandBus.execute(id)`, and App binds the actual
 * handler once in useCommandRegistrations. What remains as props here is the
 * shell wiring (launch file, close guard — not user commands) and the tab
 * domain, which is navigation state the bus does not model.
 */

/** Electron menu command ids → command-bus ids. The contract lives in main.cjs. */
const MENU_COMMAND_TO_COMMAND_ID: Record<string, string> = {
  "new-file": "document.newFile",
  "open-directory": "document.openDirectory",
  save: "document.save",
  "save-as": "document.saveAs",
  "toggle-fullscreen": "ui.toggleFullscreen",
  togglefullscreen: "ui.toggleFullscreen",
};

type UseGlobalShortcutsParams = {
  /** The launch file has already been handled this session. */
  initialHandledRef: { current: boolean };
  openDesktopMarkdownPathRef: {
    current: (absolutePath: string, preloadedSource?: ChapterSource | null) => void;
  };
  /**
   * Routes the window-close request through App's unsaved-changes guard.
   *
   * Typed as the one action this hook sends rather than as the guard's full
   * union, which keeps PendingAction App's business and still accepts the ref
   * unchanged: the narrower parameter is the assignable direction.
   */
  guardActionRef: { current: (action: { type: "close-window"; requestId: number }) => void };
  handleCloseDualSplit: () => void;
  handleCloseTab: (tabId: string) => void;
  selectChapter: (chapterId: string) => void;
};

export function useGlobalShortcuts({
  initialHandledRef,
  openDesktopMarkdownPathRef,
  guardActionRef,
  handleCloseDualSplit,
  handleCloseTab,
  selectChapter,
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
      // The menu speaks Electron ids; the bus speaks command ids. One mapping,
      // here — the handlers themselves are bound once in App.
      const commandId = MENU_COMMAND_TO_COMMAND_ID[command];
      if (commandId) commandBus.execute(commandId);
    });

    const unsubscribeClose = window.bookMDDesktop.onBeforeClose?.(({ requestId }) => {
      guardActionRef.current({ type: "close-window", requestId });
    });

    const unsubscribeFlashNote = window.bookMDDesktop.onFlashNoteSaved?.(() => {
      if (manifest?.rootPath && window.bookMDDesktop?.refreshDirectory) {
        window.bookMDDesktop
          .refreshDirectory(manifest.rootPath)
          .then((nextManifest) => {
            if (nextManifest) {
              setManifest(nextManifest);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      unsubscribeOpen();
      unsubscribeMenu?.();
      unsubscribeClose?.();
      unsubscribeFlashNote?.();
    };
  }, [
    manifest?.rootPath,
    guardActionRef,
    initialHandledRef,
    openDesktopMarkdownPathRef,
    setManifest,
    setNotice,
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      // For synthetic events dispatched on window/document, target is not an
      // Element and has no closest() — it simply counts as "not editing"
      // instead of throwing and killing the whole shortcut chain.
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        (target instanceof Element && target.closest(".cm-editor") !== null);

      if (event.key === "F11") {
        event.preventDefault();
        commandBus.execute("ui.toggleFullscreen");
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
          commandBus.execute("ui.toggleFullscreen");
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
        commandBus.execute("view.toggleTypewriter");
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        commandBus.execute(event.shiftKey ? "document.saveAs" : "document.save");
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        commandBus.execute("document.newFile");
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        commandBus.execute(event.shiftKey ? "document.openDirectory" : "document.openFile");
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        commandBus.execute("document.print");
        return;
      }

      // Global navigation shortcuts that penetrate editor focus:
      if (event.ctrlKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        commandBus.execute("view.toggleGraph");
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        commandBus.execute("view.toggleMindmap");
        return;
      }
      if (event.ctrlKey && event.key === "\\") {
        event.preventDefault();
        commandBus.execute("navigation.toggleDirectory");
        return;
      }

      if (isEditing) return;

      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        commandBus.execute("document.addBookmark");
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        commandBus.execute("navigation.focusSearch");
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        commandBus.execute("navigation.previous");
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        commandBus.execute("navigation.next");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    chapterId,
    commandPaletteOpen,
    dualSplitTabId,
    handleCloseDualSplit,
    handleCloseTab,
    isFullscreen,
    lightboxMedia,
    selectChapter,
    tabs,
    setCommandPaletteOpen,
    setLightboxMedia,
    setVersionHistoryOpen,
    versionHistoryOpen,
  ]);
}
