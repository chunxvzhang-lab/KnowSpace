import { useCallback, useRef } from "react";
import type { ChapterSource, EditorViewMode } from "../core/types";
import { useUiStore } from "../store/useUiStore";
import { useTabStore, tabsWithNewDocument } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * The unsaved-changes guard and the action it protects.
 *
 * Every mutating navigation — switching chapters, opening a file or folder,
 * creating a document, closing the window — funnels through `guardAction`: with
 * unsaved changes the action is parked and the dialog raised, without them it
 * executes at once. The palette, the keyboard, the menu and every button reach
 * the same gate, which is why the PendingAction union lives here and not in
 * App.
 */
export type PendingAction =
  | { type: "select-chapter"; chapterId: string }
  | { type: "open-file"; file: File }
  | { type: "open-desktop-file"; absolutePath: string; preloadedSource?: ChapterSource | null }
  | { type: "open-directory" }
  | { type: "new-file" }
  | { type: "new-mindmap" }
  | { type: "new-canvas" }
  | { type: "close-window"; requestId: number };

type UseUnsavedGuardParams = {
  isDirty: boolean;
  saveSession: (options?: { force?: boolean; content?: string }) => Promise<{
    success: boolean;
    message?: string;
  }>;
  discardChanges: () => void;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  manifestRef: { current: import("../core/types").BookManifest | null };
  tabsRef: { current: import("../store/useTabStore").TabMeta[] };
  doOpenMarkdownFile: (file: File) => Promise<void>;
  doOpenDesktopMarkdownPath: (
    absolutePath: string,
    preloadedSource?: ChapterSource | null,
  ) => Promise<void>;
  doOpenMarkdownDirectory: () => Promise<void>;
  doCreateNewFile: () => Promise<void>;
  doCreateNewMindmap: () => Promise<void>;
  doCreateNewCanvas: () => Promise<void>;
};

export function useUnsavedGuard({
  isDirty,
  saveSession,
  discardChanges,
  setViewMode,
  manifestRef,
  tabsRef,
  doOpenMarkdownFile,
  doOpenDesktopMarkdownPath,
  doOpenMarkdownDirectory,
  doCreateNewFile,
  doCreateNewMindmap,
  doCreateNewCanvas,
}: UseUnsavedGuardParams) {
  const pendingActionRef = useRef<PendingAction | null>(null);
  const setUnsavedDialogOpen = useUiStore((s) => s.setUnsavedDialogOpen);
  const setNotice = useUiStore((s) => s.setNotice);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);

  const executeAction = useCallback(
    async (action: PendingAction) => {
      switch (action.type) {
        case "select-chapter": {
          setChapterId(action.chapterId);
          setSearchQuery("");
          const targetChap = manifestRef.current?.chapters.find((c) => c.id === action.chapterId);
          const targetTab = tabsRef.current?.find((t) => t.id === action.chapterId);
          const targetSrc =
            targetChap?.src ||
            targetTab?.relativePath ||
            targetChap?.title ||
            targetTab?.title ||
            "";
          const isTargetCanvas = targetSrc.toLowerCase().endsWith(".canvas");
          if (isTargetCanvas) {
            setViewMode("canvas");
            setDirectoryOpen(false);
            setSidebarOpen(false);
          } else {
            setSidebarTab("toc");
          }
          if (targetChap) {
            setTabs((prev) => tabsWithNewDocument(prev, targetChap, targetChap.absolutePath));
          }
          break;
        }
        case "open-file": {
          await doOpenMarkdownFile(action.file);
          break;
        }
        case "open-desktop-file": {
          await doOpenDesktopMarkdownPath(action.absolutePath, action.preloadedSource);
          break;
        }
        case "open-directory": {
          await doOpenMarkdownDirectory();
          break;
        }
        case "new-file": {
          await doCreateNewFile();
          break;
        }
        case "new-mindmap": {
          await doCreateNewMindmap();
          break;
        }
        case "new-canvas": {
          await doCreateNewCanvas();
          break;
        }
        case "close-window": {
          if (window.bookMDDesktop?.system.resolveBeforeClose) {
            window.bookMDDesktop.system.resolveBeforeClose({
              requestId: action.requestId,
              action: "proceed",
            });
          }
          break;
        }
      }
    },
    [
      setChapterId,
      setSearchQuery,
      manifestRef,
      tabsRef,
      setViewMode,
      setDirectoryOpen,
      setSidebarOpen,
      setSidebarTab,
      setTabs,
      doOpenMarkdownFile,
      doOpenDesktopMarkdownPath,
      doOpenMarkdownDirectory,
      doCreateNewFile,
      doCreateNewMindmap,
      doCreateNewCanvas,
    ],
  );

  const guardAction = useCallback(
    (action: PendingAction) => {
      if (isDirty) {
        pendingActionRef.current = action;
        setUnsavedDialogOpen(true);
      } else {
        executeAction(action);
      }
    },
    [isDirty, executeAction, setUnsavedDialogOpen],
  );

  const handleDialogSave = useCallback(async () => {
    const res = await saveSession();
    if (res.success) {
      setUnsavedDialogOpen(false);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) {
        executeAction(action);
      }
    } else {
      setNotice(res.message || "保存文件失败。");
    }
  }, [saveSession, executeAction, setUnsavedDialogOpen, setNotice]);

  const handleDialogDiscard = useCallback(() => {
    discardChanges();
    setUnsavedDialogOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      executeAction(action);
    }
  }, [discardChanges, executeAction, setUnsavedDialogOpen]);

  const handleDialogCancel = useCallback(() => {
    if (pendingActionRef.current?.type === "close-window") {
      window.bookMDDesktop?.system.resolveBeforeClose?.({
        requestId: pendingActionRef.current.requestId,
        action: "cancel",
      });
    }
    pendingActionRef.current = null;
    setUnsavedDialogOpen(false);
  }, [setUnsavedDialogOpen]);

  return {
    guardAction,
    handleDialogSave,
    handleDialogDiscard,
    handleDialogCancel,
  };
}
