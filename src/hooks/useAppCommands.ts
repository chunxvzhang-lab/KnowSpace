import { useCallback, useMemo } from "react";

import type { CommandAction } from "../components/CommandPalette";
import type { BookManifest, EditorViewMode } from "../core/types";
import { listPaletteCommands } from "../core/commands";
import { commandBus } from "../services/commandBus";
import { useUiStore } from "../store/useUiStore";
import { useReviewStore } from "../store/useReviewStore";
import { useCommandRegistrations } from "./useCommandRegistrations";
import type { PendingAction } from "./useUnsavedGuard";

type UseAppCommandsParams = {
  /** The unsaved-changes guard every mutating command funnels through. */
  guardAction: (action: PendingAction) => void;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  saveSession: (options?: {
    force?: boolean;
    content?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  saveSessionAs: () => Promise<{ success: boolean }>;
  addBookmark: () => void;
  selectChapter: (chapterId: string) => void;
  manifest: BookManifest | null;
  activeIndex: number;
  handlePrintDocument: () => Promise<void>;
};

/**
 * The command-binding layer (seventh logic hook out of App.tsx, final trim).
 *
 * The registry in core/commands.ts is the single source of truth for WHAT
 * commands exist; the bindings below wire each id to its handler exactly once.
 * The palette `>` list, the keyboard and the Electron menu all execute through
 * the bus — the same action can no longer be re-implemented per entry point
 * (that duplication is how the mindmap toggle grew two verbatim copies and the
 * typewriter toggle two divergent ones).
 *
 * The hook also owns the thin wrappers over `guardAction` that both the
 * bindings and the shell chrome bind (open/create entry points), the palette
 * action list, and the small navigation/appearance callbacks that exist to
 * serve commands and the chrome (focus search, previous/next, fullscreen,
 * typewriter, graph pane). Store-owned values are read from the stores here
 * rather than threaded through App; only what the session hook owns travels
 * in as parameters.
 */
export function useAppCommands({
  guardAction,
  setViewMode,
  saveSession,
  saveSessionAs,
  addBookmark,
  selectChapter,
  manifest,
  activeIndex,
  handlePrintDocument,
}: UseAppCommandsParams) {
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  // The store calls this one setFullscreen; the local alias keeps the existing
  // call sites reading naturally.
  const setIsFullscreen = useUiStore((s) => s.setFullscreen);
  const setTypewriterMode = useUiStore((s) => s.setTypewriterMode);
  const setPreferences = useUiStore((s) => s.setPreferences);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setVersionHistoryOpen = useUiStore((s) => s.setVersionHistoryOpen);
  const setIsGraphPaneOpen = useUiStore((s) => s.setGraphPaneOpen);
  const requestReview = useReviewStore((s) => s.requestReview);

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, [setCommandPaletteOpen]);

  // isGraphPaneOpen defaults to false in the store: the app launches on a pure
  // document view and the graph pane is opened on demand.
  const handleToggleGraphPane = useCallback(() => {
    setIsGraphPaneOpen((prev) => !prev);
  }, [setIsGraphPaneOpen]);

  const handleCloseGraphPane = useCallback(() => {
    setIsGraphPaneOpen(false);
  }, [setIsGraphPaneOpen]);

  // The store persists the flag when it changes, so this callback does not.
  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode((prev) => !prev);
  }, [setTypewriterMode]);

  const openMarkdownFile = useCallback(
    (file: File) => {
      guardAction({ type: "open-file", file });
    },
    [guardAction],
  );

  const openMarkdownDirectory = useCallback(() => {
    guardAction({ type: "open-directory" });
  }, [guardAction]);

  const createNewFile = useCallback(() => {
    guardAction({ type: "new-file" });
  }, [guardAction]);

  const createNewMindmap = useCallback(() => {
    guardAction({ type: "new-mindmap" });
  }, [guardAction]);

  const createNewCanvas = useCallback(() => {
    guardAction({ type: "new-canvas" });
  }, [guardAction]);

  const focusSearch = useCallback(() => {
    setSidebarOpen(true);
    setSidebarTab("search");
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    });
  }, [setSidebarOpen, setSidebarTab]);

  const goPrevious = useCallback(() => {
    if (!manifest || activeIndex <= 0) return;
    selectChapter(manifest.chapters[activeIndex - 1].id);
  }, [activeIndex, manifest, selectChapter]);

  const goNext = useCallback(() => {
    if (!manifest || activeIndex < 0 || activeIndex >= manifest.chapters.length - 1) return;
    selectChapter(manifest.chapters[activeIndex + 1].id);
  }, [activeIndex, manifest, selectChapter]);

  const toggleFullscreen = useCallback(async () => {
    if (window.bookMDDesktop?.system.toggleFullScreen) {
      const next = await window.bookMDDesktop.system.toggleFullScreen();
      setIsFullscreen(Boolean(next));
    } else if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.().catch(() => {});
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.().catch(() => {});
        setIsFullscreen(false);
      }
    }
  }, [setIsFullscreen]);

  // Commands: the registry in core/commands.ts is the single source of truth
  // for WHAT commands exist; the bindings below wire each id to its handler
  // exactly once. The palette `>` list, the keyboard and the Electron menu all
  // execute through the bus — the same action can no longer be re-implemented
  // per entry point (that duplication is how the mindmap toggle grew two
  // verbatim copies and the typewriter toggle two divergent ones).
  useCommandRegistrations({
    "view.read": () => setViewMode("read"),
    "view.split": () => setViewMode("split"),
    "view.source": () => setViewMode("source"),
    "view.toggleMindmap": () => setViewMode((m) => (m === "mindmap" ? "split" : "mindmap")),
    "view.toggleCanvas": () =>
      setViewMode((m) => {
        const next = m === "canvas" ? "split" : "canvas";
        if (next === "canvas") {
          setDirectoryOpen(false);
          setSidebarOpen(false);
        }
        return next;
      }),
    "view.toggleGraph": handleToggleGraphPane,
    "view.toggleTypewriter": toggleTypewriterMode,
    "review.start": () => {
      // Opened rather than toggled: asking to start a review while the Space panel
      // is already open on another tab should still open the review, which the
      // sidebar's own toggle would not do.
      setSidebarTab("space");
      setSidebarOpen(true);
      requestReview();
    },
    "document.print": handlePrintDocument,
    "document.newFile": createNewFile,
    "document.newCanvas": createNewCanvas,
    "document.save": saveSession,
    "document.saveAs": saveSessionAs,
    // The toolbar hosts the real file input; opening a single file reuses it
    // instead of building a second dialog path (pre-existing wiring, moved here
    // from the keyboard handler so both entries share it).
    "document.openFile": () =>
      document.querySelector<HTMLInputElement>(".toolbar input[type='file']")?.click(),
    "document.openDirectory": openMarkdownDirectory,
    "document.addBookmark": addBookmark,
    "navigation.focusSearch": focusSearch,
    "navigation.previous": goPrevious,
    "navigation.next": goNext,
    "ui.openVersionHistory": () => setVersionHistoryOpen(true),
    "navigation.toggleDirectory": () => setDirectoryOpen((open) => !open),
    "ui.toggleFullscreen": toggleFullscreen,
    "ui.themeTwitter": () => setPreferences((p) => ({ ...p, theme: "twitter" })),
    "ui.themeLight": () => setPreferences((p) => ({ ...p, theme: "light" })),
    "ui.themeEink": () => setPreferences((p) => ({ ...p, theme: "eink" })),
    "ui.about": () => setAboutOpen(true),
  });

  const commandActions = useMemo<CommandAction[]>(
    () =>
      listPaletteCommands().map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        shortcut: d.shortcut,
        category: d.category,
        run: () => commandBus.execute(d.id),
      })),
    [],
  );

  return {
    handleOpenCommandPalette,
    handleToggleGraphPane,
    handleCloseGraphPane,
    openMarkdownFile,
    openMarkdownDirectory,
    createNewFile,
    createNewMindmap,
    createNewCanvas,
    goPrevious,
    goNext,
    toggleTypewriterMode,
    toggleFullscreen,
    commandActions,
  };
}
