import { useCallback } from "react";
import { useUiStore } from "../store/useUiStore";
import { useTabStore, nextActiveAfterClose, tabsAfterClosingRight } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * Everything the tab bar can ask for: opening and closing the dual split,
 * closing one tab / the others / the ones to the right, and detaching a tab
 * into its own window.
 *
 * The tab ARRAY lives in useTabStore; what lives here is the choreography a
 * close implies — which tab becomes active, whether the editing session dies
 * with the last tab, whether the dual split survives. Pure array transforms
 * stay in the store, where the tests cover them.
 */
export function useTabActions(params: {
  selectChapter: (chapterId: string) => void;
  closeSession: () => void;
  /**
   * Marks which chapter the session holds, and is also read by the loading
   * effect that stays in App.tsx. Closing the last tab ends the session, so
   * the mark has to go too — or reopening that document would be skipped as
   * "already loaded" and open on nothing.
   */
  activeLoadedChapterIdRef: { current: string };
}) {
  const { selectChapter, closeSession, activeLoadedChapterIdRef } = params;
  const tabs = useTabStore((s) => s.tabs);
  const setTabs = useTabStore((s) => s.setTabs);
  const chapterId = useTabStore((s) => s.activeTabId);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const setDualSplitTabId = useTabStore((s) => s.setDualSplitTabId);
  const setNotice = useUiStore((s) => s.setNotice);
  const manifest = useVaultStore((s) => s.manifest);

  const handleOpenDualSplit = useCallback(
    (tabId: string) => {
      if (tabId === chapterId && tabs.length < 2) return;
      setDualSplitTabId(tabId);
      setNotice("已开启双文档分屏对比模式（按 Esc 或点击右上角退出）。");
    },
    [chapterId, tabs.length, setDualSplitTabId, setNotice],
  );

  const handleCloseDualSplit = useCallback(() => {
    setDualSplitTabId(null);
  }, [setDualSplitTabId]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (tabId === dualSplitTabId) {
        setDualSplitTabId(null);
      }
      const nextActiveId = nextActiveAfterClose(tabs, tabId);
      setTabs((prev) => prev.filter((t) => t.id !== tabId));

      if (nextActiveId === null) {
        // The last tab closed, so the editing session goes with it.
        setChapterId("");
        activeLoadedChapterIdRef.current = "";
        closeSession();
        return;
      }

      if (tabId === chapterId) {
        selectChapter(nextActiveId);
      }
    },
    [
      tabs,
      chapterId,
      dualSplitTabId,
      selectChapter,
      closeSession,
      setChapterId,
      setDualSplitTabId,
      setTabs,
      activeLoadedChapterIdRef,
    ],
  );

  const handleDetachTab = useCallback(
    async (tabId: string) => {
      const targetTab = tabs.find((t) => t.id === tabId);
      const targetChap = manifest?.chapters.find((c) => c.id === tabId);
      const absPath = targetTab?.absolutePath || targetChap?.absolutePath;

      if (absPath && window.bookMDDesktop?.openInNewWindow) {
        try {
          await window.bookMDDesktop.openInNewWindow(absPath);
          setNotice(`已将文档「${targetTab?.title ?? "Markdown"}」分离至独立新窗口。`);
          if (tabs.length > 1) {
            handleCloseTab(tabId);
          }
        } catch (err: unknown) {
          setNotice(err instanceof Error ? err.message : "无法分离到新窗口。");
        }
      } else {
        try {
          window.open(window.location.href, "_blank");
          setNotice(`已在独立新窗口打开。`);
        } catch {
          setNotice("浏览器拦截了新窗口弹出。");
        }
      }
    },
    [handleCloseTab, manifest?.chapters, tabs, setNotice],
  );

  const handleCloseOtherTabs = useCallback(
    (tabId: string) => {
      if (dualSplitTabId && dualSplitTabId !== tabId) {
        setDualSplitTabId(null);
      }
      setTabs((prev) => prev.filter((t) => t.id === tabId));
      if (chapterId !== tabId) {
        selectChapter(tabId);
      }
    },
    [chapterId, dualSplitTabId, selectChapter, setDualSplitTabId, setTabs],
  );

  const handleCloseRightTabs = useCallback(
    (tabId: string) => {
      const next = tabsAfterClosingRight(tabs, tabId);
      // A tab that is not open has nothing to its right. The inline version
      // returned early here too, so neither of the checks below ran.
      if (!next) return;
      setTabs(next);

      // These two used to live inside the setTabs updater, which StrictMode
      // invokes twice in development to surface impure updaters — so the
      // navigation below (and the unsaved-changes guard it can raise) could
      // fire twice. Reacting to the return value keeps it to once.
      if (dualSplitTabId && !next.some((t) => t.id === dualSplitTabId)) {
        setDualSplitTabId(null);
      }
      if (!next.some((t) => t.id === chapterId)) {
        selectChapter(tabId);
      }
    },
    [tabs, chapterId, dualSplitTabId, selectChapter, setDualSplitTabId, setTabs],
  );

  return {
    handleOpenDualSplit,
    handleCloseDualSplit,
    handleCloseTab,
    handleDetachTab,
    handleCloseOtherTabs,
    handleCloseRightTabs,
  };
}
