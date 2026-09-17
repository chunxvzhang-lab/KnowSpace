import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FilePlus2, FileText, FolderOpen, Zap, X, ListTree, Boxes } from "lucide-react";

import { ActivityBar } from "./components/ActivityBar";
import { BookmarkPanel } from "./components/BookmarkPanel";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { ChapterList } from "./components/ChapterList";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { DualDocumentWorkspace } from "./components/DualDocumentWorkspace";
import type { WikiLinkTarget } from "./components/EditorPane";
import { GraphWorkspaceLayout } from "./components/GraphWorkspaceLayout";
import { AppOverlays } from "./components/AppOverlays";
import {
  updateDocumentInIndex,
  getLinkedReferences,
  refactorWikiLinksInContent,
} from "./services/backlinkIndex";
import { MindmapView } from "./components/MindmapView";
import { CanvasView } from "./components/CanvasView";
import { SearchPanel } from "./components/SearchPanel";
import { SpaceTimelinePanel } from "./components/SpaceTimelinePanel";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { TocPanel } from "./components/TocPanel";
import { Toolbar } from "./components/Toolbar";
import type { CommandAction } from "./components/CommandPalette";
import type {
  BookManifest,
  Bookmark,
  ChapterManifest,
  ChapterSource,
  EditorViewMode,
  RenderedChapter,
  SearchResult,
  SidebarTab,
  ThemeMode,
} from "./core/types";
import { EditorView } from "@codemirror/view";
import { useColumnResize } from "./hooks/useColumnResize";
import { useDocumentCreation } from "./hooks/useDocumentCreation";
import { useVaultOpening } from "./hooks/useVaultOpening";
import { useSearch } from "./hooks/useSearch";
import { useBacklinkIndex } from "./hooks/useBacklinkIndex";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useBookmarks } from "./hooks/useBookmarks";
import { useDocumentSession } from "./hooks/useDocumentSession";
import { useReadingTracker } from "./hooks/useReadingTracker";
import { resolveBookmark } from "./services/bookmarks";
import { loadChapterMarkdown } from "./services/bookSource";
import { renderMermaid, type MermaidTheme } from "./services/mermaid";
import { extractHeadingsFromSource, renderMarkdown } from "./services/markdown";

import {
  loadPreferences,
  loadReadingPosition,
  saveReadingPosition,
} from "./services/storage";
import { useUiStore } from "./store/useUiStore";
import {
  useTabStore,
  tabsWithDirtyFlags,
  nextActiveAfterClose,
  tabsAfterClosingRight,
  type TabMeta,
} from "./store/useTabStore";
import { useVaultStore } from "./store/useVaultStore";

type PendingAction =
  | { type: "select-chapter"; chapterId: string }
  | { type: "open-file"; file: File }
  | { type: "open-desktop-file"; absolutePath: string; preloadedSource?: ChapterSource | null }
  | { type: "open-directory" }
  | { type: "new-file" }
  | { type: "new-mindmap" }
  | { type: "new-canvas" }
  | { type: "close-window"; requestId: number };

export function App() {
  const readerRef = useRef<HTMLElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pendingBookmarkRef = useRef<Bookmark | null>(null);
  const pendingNavigationRef = useRef<{ headingId?: string; lineNumber?: number; highlight?: boolean; searchResult?: SearchResult } | null>(null);
  const activeHeadingRef = useRef<string | undefined>(undefined);
  const preferencesRef = useRef(loadPreferences());
  const scrollRatioRef = useRef(0);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const activeLoadedChapterIdRef = useRef<string>("");
  const restoredChapterIdRef = useRef<string | null>(null);
  const navLockUntilRef = useRef<number>(0);

  // ── Vault (useVaultStore · R1 batch B2) ───────────────────────────────────
  //
  // The open folder, its bookmarks, the two indexes built from its documents
  // and the search fields. Same aliasing as the earlier batches — `manifest`
  // alone is read in over a hundred places and not one of them changed.
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const bookmarks = useVaultStore((s) => s.bookmarks);
  const setBookmarks = useVaultStore((s) => s.setBookmarks);
  const persistBookmarks = useVaultStore((s) => s.persistBookmarks);
  // backlinkIndex stays subscribed here: the graph pane and two later call sites
  // read it directly. Writing it belongs to useBacklinkIndex.
  const backlinkIndex = useVaultStore((s) => s.backlinkIndex);
  const vaultSearchIndex = useVaultStore((s) => s.vaultSearchIndex);
  const setVaultSearchIndex = useVaultStore((s) => s.setVaultSearchIndex);
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);
  const searchScope = useVaultStore((s) => s.searchScope);
  const setSearchScope = useVaultStore((s) => s.setSearchScope);
  const activeSearchMatchId = useVaultStore((s) => s.activeSearchMatchId);
  const setActiveSearchMatchId = useVaultStore((s) => s.setActiveSearchMatchId);

  const manifestRef = useRef<BookManifest | null>(manifest);
  manifestRef.current = manifest;

  // ── Tabs (useTabStore · R1 batch B1) ──────────────────────────────────────
  //
  // Same technique as the UI store: these aliases keep the identifiers the
  // useState calls used, so roughly ninety reads of `chapterId` and fifteen
  // `setTabs` call sites needed no change.
  //
  // What did change is that a tab no longer carries a dirty flag. Only the
  // active tab can be dirty — there is a single editing session — so it is
  // derived at render instead (see tabsForDisplay). That removes the effect
  // which used to mirror `isDirty` into this array, and with it the last path
  // by which a keystroke reached tab state.
  const tabs = useTabStore((s) => s.tabs);
  const setTabs = useTabStore((s) => s.setTabs);
  const ensureTab = useTabStore((s) => s.ensureTab);
  const chapterId = useTabStore((s) => s.activeTabId);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const setDualSplitTabId = useTabStore((s) => s.setDualSplitTabId);
  const recentVisitedDocIds = useTabStore((s) => s.recentVisitedDocIds);
  const rememberVisitedDoc = useTabStore((s) => s.rememberVisitedDoc);

  const tabsRef = useRef<TabMeta[]>(tabs);
  tabsRef.current = tabs;
  // The comparison pane's rendered content stays here: it is a view artefact
  // produced by loading a second document, not part of what tabs are.
  const [secondaryRenderedChapter, setSecondaryRenderedChapter] = useState<RenderedChapter | null>(null);
  const secondaryReaderRef = useRef<HTMLElement | null>(null);
  const isDualSplitMode = Boolean(dualSplitTabId && tabs.some((t) => t.id === dualSplitTabId));

  // ── UI chrome (useUiStore · R1 batch B0) ──────────────────────────────────
  //
  // Layout, overlays and appearance now live in a Zustand store, so this
  // component stops owning state that no other shell logic cares about.
  //
  // The selector names deliberately match the useState identifiers they
  // replace — that is what let the rest of the file stay exactly as it was:
  // every read, every set, including the 14 functional-update call sites. Only
  // the callbacks that hand-rolled localStorage persistence needed edits,
  // because the store owns that now too.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const directoryOpen = useUiStore((s) => s.directoryOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const isFullscreen = useUiStore((s) => s.isFullscreen);
  const typewriterMode = useUiStore((s) => s.typewriterMode);
  const lightboxMedia = useUiStore((s) => s.lightboxMedia);
  const notice = useUiStore((s) => s.notice);
  const preferences = useUiStore((s) => s.preferences);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const versionHistoryOpen = useUiStore((s) => s.versionHistoryOpen);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const isReviewFocus = useUiStore((s) => s.isReviewFocus);
  const directoryWidth = useUiStore((s) => s.directoryWidth);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const resizingType = useUiStore((s) => s.resizingType);

  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  // The store calls this one setFullscreen; the local alias keeps the existing
  // call sites reading naturally.
  const setIsFullscreen = useUiStore((s) => s.setFullscreen);
  const setTypewriterMode = useUiStore((s) => s.setTypewriterMode);
  const setLightboxMedia = useUiStore((s) => s.setLightboxMedia);
  const setNotice = useUiStore((s) => s.setNotice);
  const setPreferences = useUiStore((s) => s.setPreferences);
  const patchPreferences = useUiStore((s) => s.patchPreferences);
  const setUnsavedDialogOpen = useUiStore((s) => s.setUnsavedDialogOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setVersionHistoryOpen = useUiStore((s) => s.setVersionHistoryOpen);
  const setIsGraphPaneOpen = useUiStore((s) => s.setGraphPaneOpen);
  const setReviewFocus = useUiStore((s) => s.setReviewFocus);
  // The width setters and persistLayout moved into useColumnResize along with
  // the drag that drives them. The widths themselves are still subscribed here
  // because the resizers and panels render them.

  // Where the reader has scrolled to. Stays here because it describes the
  // rendered document, not the vault.
  const [activeHeadingId, setActiveHeadingId] = useState<string | undefined>();

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  // isGraphPaneOpen defaults to false in the store: the app launches on a pure
  // document view and the graph pane is opened on demand.

  const handleToggleGraphPane = useCallback(() => {
    setIsGraphPaneOpen((prev) => !prev);
  }, []);

  const handleCloseGraphPane = useCallback(() => {
    setIsGraphPaneOpen(false);
  }, []);

  /**
   * Entering the flashcard review gets the workspace to itself.
   *
   * The document tree is collapsed on the way in because the review, the tree
   * and the reader were all competing for the same width and the cards ended up
   * squeezed. The reader is not unmounted, only collapsed by the shell's CSS, so
   * returning from the review finds the document exactly as it was left —
   * scroll position, editor state and all.
   */
  const handleReviewActiveChange = useCallback(
    (active: boolean) => {
      setReviewFocus(active);
      if (active) setDirectoryOpen(false);
    },
    [setReviewFocus, setDirectoryOpen]
  );

  // Pane widths and the "a divider is being dragged" flag come from the store,
  // which reads and writes the same localStorage keys as the initialisers that
  // used to live here. Dragging them is useColumnResize's job.
  const selectChapterRef = useRef<(id: string) => void>(() => {});

  const {
    session,
    renderedChapter,
    viewMode,
    isDirty,
    isSaving,
    isLargeDocument,
    autoPreviewPaused,
    conflict,
    openSession,
    updateSource,
    renderPreviewNow,
    setViewMode,
    saveSession,
    saveSessionAs,
    reloadFromDisk,
    discardChanges,
    clearConflict,
    closeSession,
  } = useDocumentSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const activeTab = useMemo(() => tabs.find((item) => item.id === chapterId), [tabs, chapterId]);
  // Applying the dirty flag here rather than storing it means typing in a saved
  // document changes this memo and nothing else — no tab array, no effect, no
  // second render pass to settle the tab bar.
  const tabsForDisplay = useMemo(
    () => tabsWithDirtyFlags(tabs, chapterId, isDirty),
    [tabs, chapterId, isDirty]
  );
  const activeChapter = useMemo(() => {
    const fromManifest = manifest?.chapters.find((item) => item.id === chapterId);
    if (fromManifest) return fromManifest;
    if (activeTab) {
      return {
        id: activeTab.id,
        title: activeTab.title,
        src: activeTab.relativePath || activeTab.title,
        absolutePath: activeTab.absolutePath,
      };
    }
    return undefined;
  }, [manifest?.chapters, chapterId, activeTab]);
  const activeHeading = renderedChapter?.headings.find((heading) => heading.id === activeHeadingId);
  const activeIndex = manifest?.chapters.findIndex((item) => item.id === chapterId) ?? -1;

  // Recording a visit belongs to the store now, which owns the de-duplication
  // and the cap as well.
  useEffect(() => {
    if (chapterId) rememberVisitedDoc(chapterId);
  }, [chapterId, rememberVisitedDoc]);

  // bookmarkedHeadingIds lives in useBookmarks with the rest of the bookmark
  // logic; see the call below.

  // Bookmark writes moved into the store with the bookmark list. Keeping the
  // replacement and the disk write in one action is what stops them drifting
  // apart: the write needs the manifest id, so it has to read the same state
  // the replacement does.

  const handleMermaidError = useCallback(() => {
    setNotice("Mermaid 图表渲染失败，请检查语法。");
  }, []);

  // ── Column dragging and fitting (R1 batch B3b) ────────────────────────────
  //
  // The first hook out of App.tsx. Its four handlers keep the names the JSX
  // already used, so the two resizer elements below are unchanged. The width
  // stores stay subscribed here because the resizers render their width.
  const {
    handleDirResizeMouseDown,
    handleSidebarResizeMouseDown,
    handleDirDoubleClick,
    handleSidebarDoubleClick,
  } = useColumnResize();

  // ── Search (R1 batch B3b-4) ──────────────────────────────────────────────
  //
  // The five names the rest of the file uses come back out of the hook: the
  // bookmark jump calls jumpToHeading and jumpToRatio, three effects call them,
  // and SearchPanel takes searchResults and handleSearchJump as props.
  const {
    searchResults,
    jumpToHeading,
    jumpToRatio,
    clearSearchHighlights,
    handleSearchJump,
  } = useSearch({
    renderedChapter,
    session,
    viewMode,
    editorViewRef,
    readerRef,
    selectChapterRef,
    setActiveHeadingId,
    navLockUntilRef,
    pendingNavigationRef,
  });

  const executeAction = useCallback(
    async (action: PendingAction) => {
      switch (action.type) {
        case "select-chapter": {
          setChapterId(action.chapterId);
          setSearchQuery("");
          const targetChap = manifestRef.current?.chapters.find((c) => c.id === action.chapterId);
          const targetTab = tabsRef.current?.find((t) => t.id === action.chapterId);
          const targetSrc = targetChap?.src || targetTab?.relativePath || targetChap?.title || targetTab?.title || "";
          const isTargetCanvas = targetSrc.toLowerCase().endsWith(".canvas");
          if (isTargetCanvas) {
            setViewMode("canvas");
            setDirectoryOpen(false);
            setSidebarOpen(false);
          } else {
            setSidebarTab("toc");
          }
          if (targetChap) {
            setTabs((prev) => {
              const exists = prev.some(
                (t) =>
                  t.id === targetChap.id ||
                  (t.absolutePath &&
                    targetChap.absolutePath &&
                    t.absolutePath.toLowerCase() === targetChap.absolutePath.toLowerCase())
              );
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: targetChap.id,
                  title: targetChap.title,
                  relativePath: targetChap.src,
                  absolutePath: targetChap.absolutePath,
                },
              ];
            });
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
          if (window.bookMDDesktop?.resolveBeforeClose) {
            window.bookMDDesktop.resolveBeforeClose({
              requestId: action.requestId,
              action: "proceed",
            });
          }
          break;
        }
      }
    },
    []
  );

  // Unsaved guard interceptor
  const guardAction = useCallback(
    (action: PendingAction) => {
      if (isDirty) {
        pendingActionRef.current = action;
        setUnsavedDialogOpen(true);
      } else {
        executeAction(action);
      }
    },
    [isDirty, executeAction]
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
  }, [saveSession, executeAction]);

  const handleDialogDiscard = useCallback(() => {
    discardChanges();
    setUnsavedDialogOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      executeAction(action);
    }
  }, [discardChanges, executeAction]);

  const handleDialogCancel = useCallback(() => {
    if (pendingActionRef.current?.type === "close-window") {
      window.bookMDDesktop?.resolveBeforeClose?.({
        requestId: pendingActionRef.current.requestId,
        action: "cancel",
      });
    }
    pendingActionRef.current = null;
    setUnsavedDialogOpen(false);
  }, []);

  const selectChapter = useCallback(
    (nextChapterId: string) => {
      const targetChap = manifestRef.current?.chapters.find((c) => c.id === nextChapterId);
      const targetTab = tabsRef.current?.find((t) => t.id === nextChapterId);
      const targetSrc = targetChap?.src || targetTab?.relativePath || targetChap?.title || targetTab?.title || "";
      const isCanvas = targetSrc.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        setDirectoryOpen(false);
        setSidebarOpen(false);
        setViewMode("canvas");
      }
      if (nextChapterId === chapterId) return;
      guardAction({ type: "select-chapter", chapterId: nextChapterId });
    },
    [chapterId, guardAction]
  );
  selectChapterRef.current = selectChapter;

  // Keep the active document's tab registered, and its metadata fresh.
  //
  // This was a forty-nine line effect that also mirrored `isDirty` into the tab
  // array — which is what made a keystroke write into tab state, and why the
  // dependency list carried both `isDirty` and `chapterId`. The dirty flag is
  // derived now, so all that remains is registration and renames, and ensureTab
  // returns the untouched state when neither has happened.
  //
  // One thing the old code carried that is worth recording: a guard reading
  // `activeChapter.id === chapterId`. It could never be false — activeChapter is
  // looked up *by* chapterId — so it was dead, and dropping it here is not a
  // behaviour change.
  useEffect(() => {
    if (!activeChapter) return;
    ensureTab({
      id: activeChapter.id,
      title: activeChapter.title,
      relativePath: activeChapter.src,
      absolutePath: activeChapter.absolutePath,
    });
  }, [activeChapter, ensureTab]);

  const handleOpenDualSplit = useCallback(
    (tabId: string) => {
      if (tabId === chapterId && tabs.length < 2) return;
      setDualSplitTabId(tabId);
      setNotice("已开启双文档分屏对比模式（按 Esc 或点击右上角退出）。");
    },
    [chapterId, tabs.length]
  );

  const handleCloseDualSplit = useCallback(() => {
    setDualSplitTabId(null);
  }, []);

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
    [tabs, chapterId, dualSplitTabId, selectChapter, closeSession, setChapterId, setDualSplitTabId]
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
    [handleCloseTab, manifest?.chapters, tabs]
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
    [chapterId, dualSplitTabId, selectChapter]
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
    [tabs, chapterId, dualSplitTabId, selectChapter, setDualSplitTabId]
  );

  // The store persists the flag when it changes, so this callback does not.
  const toggleTypewriterMode = useCallback(() => {
    setTypewriterMode((prev) => !prev);
  }, [setTypewriterMode]);

  const { doOpenMarkdownFile, doOpenDesktopMarkdownPath, doOpenMarkdownDirectory } =
    useVaultOpening({
      openSession,
      setViewMode,
      activeLoadedChapterIdRef,
      pendingBookmarkRef,
    });

  const { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas } = useDocumentCreation({
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
  });

  const openMarkdownFile = useCallback(
    (file: File) => {
      guardAction({ type: "open-file", file });
    },
    [guardAction]
  );

  const openDesktopMarkdownPath = useCallback(
    (absolutePath: string, preloadedSource?: ChapterSource | null) => {
      if (session?.absolutePath && session.absolutePath.toLowerCase() === absolutePath.toLowerCase()) {
        return;
      }
      guardAction({ type: "open-desktop-file", absolutePath, preloadedSource });
    },
    [session?.absolutePath, guardAction]
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

  const handleCreateCanvasExtractNote = useCallback(
    async (extractedMarkdown: string, defaultDocTitle?: string) => {
      if (!window.bookMDDesktop) {
        navigator.clipboard?.writeText(extractedMarkdown);
        setNotice("专著内容已复制到剪贴板。");
        return;
      }

      try {
        const rootPath = manifest?.rootPath;
        const name = defaultDocTitle ? `${defaultDocTitle}.md` : "白板萃取专著.md";
        const result = await window.bookMDDesktop.createMarkdownFile({
          rootPath,
          defaultName: name,
          initialContent: extractedMarkdown,
        });
        if (result.canceled || !result.success) {
          if (!result.canceled && result.message) setNotice(result.message);
          return;
        }

        let nextManifest = manifest;
        if (rootPath && window.bookMDDesktop.refreshDirectory) {
          nextManifest = await window.bookMDDesktop.refreshDirectory(rootPath);
        } else {
          const newChapter = result.chapter;
          nextManifest = {
            id: manifest?.id ?? `directory:${result.absolutePath}`,
            title: manifest?.title ?? result.chapter.title,
            rootPath: manifest?.rootPath,
            chapters: manifest ? [...manifest.chapters, newChapter] : [newChapter],
          };
        }

        const activeChap =
          nextManifest.chapters.find(
            (c) => c.absolutePath && c.absolutePath.toLowerCase() === result.absolutePath.toLowerCase()
          ) ?? result.chapter;

        setManifest(nextManifest);
        setChapterId(activeChap.id);
        setTabs((prev) => {
          const exists = prev.some(
            (t) =>
              t.id === activeChap.id ||
              (t.absolutePath &&
                activeChap.absolutePath &&
                t.absolutePath.toLowerCase() === activeChap.absolutePath.toLowerCase())
          );
          if (exists) return prev;
          return [
            ...prev,
            {
              id: activeChap.id,
              title: activeChap.title,
              relativePath: activeChap.src,
              absolutePath: result.absolutePath,
            },
          ];
        });
        setViewMode("split");
        activeLoadedChapterIdRef.current = activeChap.id;

        openSession({
          chapterId: activeChap.id,
          absolutePath: result.absolutePath,
          fileName: activeChap.src.split("/").pop() ?? activeChap.title,
          baseUrl: result.source.baseUrl,
          source: result.source.markdown,
          diskVersion: result.source.diskVersion ?? null,
          writable: true,
          hasBom: result.source.hasBom,
          lineEnding: result.source.lineEnding,
        });
        setNotice(`已生成并打开萃取专著：${activeChap.title}`);
      } catch (err: any) {
        setNotice(`生成萃取专著失败：${err.message || String(err)}`);
      }
    },
    [manifest, openSession]
  );

  // ── Bookmarks (R1 batch B3b-7) ────────────────────────────────────────────
  //
  // The two names the JSX and the outline need come back out. pendingBookmarkRef
  // travels in because a bookmark pointing at another chapter cannot be resolved
  // until that chapter loads, and the reading-position restore below picks it up.
  const { bookmarkedHeadingIds, jumpBookmark, addBookmark } = useBookmarks({
    renderedChapter,
    activeChapter,
    activeHeading,
    selectChapter,
    jumpToHeading,
    jumpToRatio,
    readerRef,
    scrollRatioRef,
    pendingBookmarkRef,
  });

  const focusSearch = useCallback(() => {
    setSidebarOpen(true);
    setSidebarTab("search");
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    });
  }, []);

  const saveCurrentReadingPosition = useCallback(() => {
    if (!manifest || !chapterId) return;
    saveReadingPosition({
      bookId: manifest.id,
      chapterId,
      chapterSrc: activeChapter?.src,
      headingId: activeHeadingRef.current,
      scrollRatio: scrollRatioRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, [activeChapter?.src, chapterId, manifest]);

  const goPrevious = useCallback(() => {
    if (!manifest || activeIndex <= 0) return;
    selectChapter(manifest.chapters[activeIndex - 1].id);
  }, [activeIndex, manifest, selectChapter]);

  const goNext = useCallback(() => {
    if (!manifest || activeIndex < 0 || activeIndex >= manifest.chapters.length - 1) return;
    selectChapter(manifest.chapters[activeIndex + 1].id);
  }, [activeIndex, manifest, selectChapter]);

  useReadingTracker({
    containerRef: readerRef,
    headings: renderedChapter?.headings ?? [],
    activeHeadingRef,
    scrollRatioRef,
    onActiveHeadingChange: setActiveHeadingId,
    onScrollIdle: saveCurrentReadingPosition,
    navLockUntilRef,
  });

  const createNewFileRef = useRef(createNewFile);
  const openMarkdownDirectoryRef = useRef(openMarkdownDirectory);
  const openDesktopMarkdownPathRef = useRef(openDesktopMarkdownPath);
  const saveSessionRef = useRef(saveSession);
  const saveSessionAsRef = useRef(saveSessionAs);
  const guardActionRef = useRef(guardAction);

  useEffect(() => {
    createNewFileRef.current = createNewFile;
    openMarkdownDirectoryRef.current = openMarkdownDirectory;
    openDesktopMarkdownPathRef.current = openDesktopMarkdownPath;
    saveSessionRef.current = saveSession;
    saveSessionAsRef.current = saveSessionAs;
    guardActionRef.current = guardAction;
  });

  const toggleFullscreen = useCallback(async () => {
    if (window.bookMDDesktop?.toggleFullScreen) {
      const next = await window.bookMDDesktop.toggleFullScreen();
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
  }, []);

  const toggleFullscreenRef = useRef(toggleFullscreen);
  toggleFullscreenRef.current = toggleFullscreen;

  // Sync fullscreen state
  useEffect(() => {
    if (window.bookMDDesktop?.isFullScreen) {
      window.bookMDDesktop.isFullScreen().then((full) => {
        setIsFullscreen(Boolean(full));
      });
    }
    const unsubDesktop = window.bookMDDesktop?.onFullScreenChanged?.((full) => {
      setIsFullscreen(Boolean(full));
    });
    const handleDocFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleDocFullscreenChange);
    return () => {
      unsubDesktop?.();
      document.removeEventListener("fullscreenchange", handleDocFullscreenChange);
    };
  }, []);

  // Handle launch path once on startup and register global event listeners
  const initialHandledRef = useRef(false);
  // Load chapter content when chapterId changes
  useEffect(() => {
    if (!chapterId) return;

    const targetChapter = manifest?.chapters.find((item) => item.id === chapterId);
    const targetTab = tabs.find((item) => item.id === chapterId);
    if (!targetChapter && !targetTab) return;

    const targetTitle = targetChapter?.title || targetTab?.title || "文档";
    const targetSrc = targetChapter?.src || targetTab?.relativePath || targetTitle;
    const fileName = targetSrc.split(/[\\/]/).pop() ?? targetTitle;
    const isCanvas = fileName.toLowerCase().endsWith(".canvas");
    const isMindmap = fileName.toLowerCase().endsWith(".mindmap.md");

    if (isCanvas) {
      setViewMode("canvas");
      setDirectoryOpen(false);
      setSidebarOpen(false);
    } else if (isMindmap) {
      setViewMode("mindmap");
    }

    // If this chapter is already the actively loaded session, skip redundant re-fetching
    if (activeLoadedChapterIdRef.current === chapterId) return;
    if (session?.chapterId === chapterId) {
      activeLoadedChapterIdRef.current = chapterId;
      return;
    }

    let cancelled = false;
    const targetAbsPath = targetChapter?.absolutePath || targetTab?.absolutePath;

    if (
      session?.absolutePath &&
      targetAbsPath &&
      session.absolutePath.toLowerCase() === targetAbsPath.toLowerCase()
    ) {
      activeLoadedChapterIdRef.current = chapterId;
      return;
    }

    activeLoadedChapterIdRef.current = chapterId;

    const loadPromise =
      targetAbsPath && window.bookMDDesktop
        ? window.bookMDDesktop.readMarkdownFile(targetAbsPath)
        : manifest
        ? loadChapterMarkdown(manifest, chapterId)
        : Promise.reject(new Error("无法加载章节内容。"));

    loadPromise
      .then((source) => {
        if (cancelled) return;
        if (isCanvas) {
          setViewMode("canvas");
          setDirectoryOpen(false);
          setSidebarOpen(false);
        } else if (isMindmap) {
          setViewMode("mindmap");
        } else {
          setViewMode((prev) => (prev === "canvas" || prev === "mindmap" ? "split" : prev));
        }

        openSession({
          chapterId,
          absolutePath: targetAbsPath ?? null,
          fileName,
          baseUrl: source.baseUrl,
          source: source.markdown,
          diskVersion: source.diskVersion ?? null,
          writable: Boolean(targetAbsPath && window.bookMDDesktop),
          hasBom: source.hasBom,
          lineEnding: source.lineEnding,
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setNotice(cause instanceof Error ? cause.message : "无法加载章节内容。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chapterId, manifest, tabs, openSession, session?.chapterId, session?.absolutePath]);

  // Close directory and outline whenever a canvas file/mode is active
  useEffect(() => {
    if (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) {
      setDirectoryOpen(false);
      setSidebarOpen(false);
    }
  }, [viewMode, session?.fileName]);

  // Load secondary chapter for dual split mode
  useEffect(() => {
    if (!dualSplitTabId) {
      setSecondaryRenderedChapter(null);
      return;
    }

    let cancelled = false;
    const targetTab = tabs.find((t) => t.id === dualSplitTabId);
    const targetChap = manifest?.chapters.find((c) => c.id === dualSplitTabId);

    const targetAbsPath = targetTab?.absolutePath || targetChap?.absolutePath;

    const loadPromise =
      targetAbsPath && window.bookMDDesktop
        ? window.bookMDDesktop.readMarkdownFile(targetAbsPath)
        : manifest
          ? loadChapterMarkdown(manifest, dualSplitTabId)
          : null;

    if (!loadPromise) return;

    loadPromise
      .then(async (source) => {
        if (cancelled) return;
        const rendered = await renderMarkdown(source.markdown, source.baseUrl);
        if (!cancelled) {
          setSecondaryRenderedChapter(rendered);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setNotice(cause instanceof Error ? cause.message : "无法加载分屏文档内容。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dualSplitTabId, manifest, tabs]);

  // Restore reading position or bookmark position
  useEffect(() => {
    if (!manifest || !renderedChapter || !chapterId) return;

    // Only restore once per chapter load/switch, unless a bookmark or navigation was queued
    if (
      restoredChapterIdRef.current === chapterId &&
      !pendingBookmarkRef.current &&
      !pendingNavigationRef.current
    )
      return;
    restoredChapterIdRef.current = chapterId;

    const pendingNav = pendingNavigationRef.current;
    if (pendingNav) {
      pendingNavigationRef.current = null;
      requestAnimationFrame(() => {
        if (pendingNav.searchResult) {
          handleSearchJump({ ...pendingNav.searchResult, chapterId: undefined });
        } else if (pendingNav.headingId) {
          jumpToHeading(pendingNav.headingId, "smooth", pendingNav.highlight ?? true);
        } else if (pendingNav.lineNumber && editorViewRef.current) {
          const editor = editorViewRef.current;
          const totalLines = editor.state.doc.lines;
          const safeLineNum = Math.min(Math.max(1, pendingNav.lineNumber), totalLines);
          const line = editor.state.doc.line(safeLineNum);
          editor.dispatch({
            selection: { anchor: line.from, head: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 40 }),
          });
        }
      });
      return;
    }

    const pending = pendingBookmarkRef.current;
    if (pending) {
      pendingBookmarkRef.current = null;
      const resolution = resolveBookmark(pending, renderedChapter.headings, renderedChapter.checksum);
      if (resolution.message) setNotice(resolution.message);
      requestAnimationFrame(() => {
        if (resolution.targetHeadingId) {
          jumpToHeading(resolution.targetHeadingId, "smooth", true);
        } else {
          jumpToRatio(resolution.scrollRatio);
        }
      });
      return;
    }

    const saved = loadReadingPosition(manifest.id, manifest.chapters);
    if (saved?.chapterId === chapterId) {
      requestAnimationFrame(() => {
        if (saved.headingId && renderedChapter.headings.some((heading) => heading.id === saved.headingId)) {
          jumpToHeading(saved.headingId, "auto", false);
        } else {
          jumpToRatio(saved.scrollRatio);
        }
      });
    } else {
      // New chapter with no saved position: cleanly reset scroll to the very top
      requestAnimationFrame(() => {
        readerRef.current?.scrollTo({ top: 0, behavior: "auto" });
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            selection: { anchor: 0, head: 0 },
            effects: EditorView.scrollIntoView(0, { y: "start" }),
          });
        }
      });
    }
  }, [renderedChapter, chapterId, jumpToHeading, jumpToRatio, manifest]);

  // Periodic position save
  useEffect(() => {
    if (!manifest || !chapterId) return;
    const handle = window.setTimeout(() => {
      saveCurrentReadingPosition();
    }, 650);
    return () => window.clearTimeout(handle);
  }, [activeHeadingId, chapterId, manifest, saveCurrentReadingPosition]);

  // Apply the theme to the document and the native window frame.
  //
  // Persisting preferences is no longer part of this effect — the store writes
  // them when they change — so only the DOM and Electron side effects remain.
  useEffect(() => {
    preferencesRef.current = preferences;
    document.documentElement.dataset.theme = preferences.theme;
    window.bookMDDesktop?.setNativeTheme?.(preferences.theme);
  }, [preferences]);

  const handlePrintDocument = useCallback(async () => {
    if (renderPreviewNow) {
      try {
        await renderPreviewNow();
      } catch {
        // ignore
      }
    }
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    const title = activeChapter?.title || session?.fileName || "KnowSpace_文档";
    if (desktop?.printToPdf) {
      try {
        await desktop.printToPdf({ title });
      } catch (err) {
        console.error("Print to PDF failed:", err);
      }
    } else {
      window.print();
    }
  }, [activeChapter?.title, renderPreviewNow, session?.fileName]);

  const handleExtractSelectionToNote = useCallback(
    async (selectedText: string, suggestedTitle: string) => {
      if (!session) return;
      const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
      const cleanTitle = suggestedTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "未命名笔记";

      if (desktop?.createMarkdownFile && session.absolutePath) {
        const parentDir = session.absolutePath.replace(/[\\/][^\\/]+$/, "");
        try {
          const res = await desktop.createMarkdownFile({
            rootPath: parentDir,
            defaultName: cleanTitle,
            initialContent: `# ${cleanTitle}\n\n${selectedText}\n`,
          });
          if (res.canceled || !res.success) {
            return;
          }
          if (manifest?.rootPath && desktop.refreshDirectory) {
            const next = await desktop.refreshDirectory(manifest.rootPath);
            setManifest(next);
          }
          const finalTitle = res.chapter?.title || cleanTitle;
          if (editorViewRef.current) {
            const sel = editorViewRef.current.state.selection.main;
            editorViewRef.current.dispatch({
              changes: { from: sel.from, to: sel.to, insert: `[[${finalTitle}]]` },
              selection: { anchor: sel.from + finalTitle.length + 4 },
            });
          }
        } catch (err) {
          console.error("Failed to extract selection to note:", err);
        }
      } else if (editorViewRef.current) {
        const sel = editorViewRef.current.state.selection.main;
        editorViewRef.current.dispatch({
          changes: { from: sel.from, to: sel.to, insert: `[[${cleanTitle}]]` },
          selection: { anchor: sel.from + cleanTitle.length + 4 },
        });
      }
    },
    [manifest?.rootPath, session]
  );

  const handleSendSelectionToFlash = useCallback(async (text: string) => {
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
    if (desktop?.saveFlashNote && text.trim()) {
      try {
        await desktop.saveFlashNote({
          content: text.trim(),
          tags: ["正文摘录"],
        });
      } catch (err) {
        console.error("Failed to send selection to flash:", err);
      }
    }
  }, []);

  const handleToggleMindmap = useCallback(() => {
    setViewMode((prev) => (prev === "mindmap" ? "split" : "mindmap"));
  }, []);

  const handleRevealInToc = useCallback(() => {
    setSidebarTab("toc");
    setSidebarOpen(true);
  }, []);

  // Action commands list for Command Palette (> ...)
  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: "cmd-view-read",
        title: "切换视图: 阅读模式",
        description: "沉浸式无干扰文档阅读模式",
        shortcut: "Alt+1",
        category: "视图与排版",
        run: () => setViewMode("read"),
      },
      {
        id: "cmd-view-split",
        title: "切换视图: 双栏实时预览",
        description: "左侧编辑器，右侧实时渲染与同步滚动",
        shortcut: "Alt+2",
        category: "视图与排版",
        run: () => setViewMode("split"),
      },
      {
        id: "cmd-view-source",
        title: "切换视图: 源码编辑",
        description: "全宽纯净 Markdown 源码编辑模式",
        shortcut: "Alt+3",
        category: "视图与排版",
        run: () => setViewMode("source"),
      },
      {
        id: "cmd-view-mindmap",
        title: "切换视图: 思维导图",
        description: "将文档大纲结构转换为无限画布可视化脑图",
        shortcut: "Ctrl+M",
        category: "视图与排版",
        run: () => setViewMode((m) => (m === "mindmap" ? "split" : "mindmap")),
      },
      {
        id: "cmd-view-canvas",
        title: "切换视图: 空间白板",
        description: "进入无限多模态可视化白板工作区",
        category: "视图与排版",
        run: () =>
          setViewMode((m) => {
            const next = m === "canvas" ? "split" : "canvas";
            if (next === "canvas") {
              setDirectoryOpen(false);
              setSidebarOpen(false);
            }
            return next;
          }),
      },
      {
        id: "cmd-toggle-graph",
        title: "切换知识图谱分栏",
        description: "开启或收起右侧全局双向引用关系图谱",
        shortcut: "Ctrl+G",
        category: "视图与排版",
        run: () => handleToggleGraphPane(),
      },
      {
        id: "cmd-print-pdf",
        title: "高保真专业 PDF 打印",
        description: "生成高分辨率向量级打印文稿与 PDF 导出",
        shortcut: "Ctrl+P",
        category: "导出与分发",
        run: () => handlePrintDocument(),
      },
      {
        id: "cmd-new-file",
        title: "新建 Markdown 笔记",
        description: "在当前知识库中创建一个全新空白笔记",
        shortcut: "Ctrl+N",
        category: "文档操作",
        run: () => createNewFile(),
      },
      {
        id: "cmd-new-canvas",
        title: "新建空间白板 (.canvas)",
        description: "创建一个无限可视化白板，自由拖拽卡片与建立语义连线",
        category: "文档操作",
        run: () => createNewCanvas(),
      },
      {
        id: "cmd-save-doc",
        title: "保存当前笔记",
        description: "将当前编辑中的笔记落盘保存至本地磁盘",
        shortcut: "Ctrl+S",
        category: "文档操作",
        run: () => saveSession(),
      },
      {
        id: "cmd-save-doc-as",
        title: "另存为笔记...",
        description: "将当前笔记内容导出另存到自定义目录",
        shortcut: "Ctrl+Shift+S",
        category: "文档操作",
        run: () => saveSessionAs(),
      },
      {
        id: "cmd-version-history",
        title: "版本快照历史与双栏比对",
        description: "查看本地历史版本快照、逐行差异对比与一键安全还原",
        shortcut: "Ctrl+Shift+H",
        category: "文档操作",
        run: () => setVersionHistoryOpen(true),
      },
      {
        id: "cmd-open-folder",
        title: "打开本地知识库目录",
        description: "加载本地包含 Markdown 笔记的文件夹",
        shortcut: "Ctrl+Shift+O",
        category: "知识库管理",
        run: () => openMarkdownDirectory(),
      },
      {
        id: "cmd-toggle-directory",
        title: "展开 / 收起文档目录侧边栏",
        description: "切换左侧工作区文件树目录的显示状态",
        shortcut: "Ctrl+\\",
        category: "界面交互",
        run: () => setDirectoryOpen((open) => !open),
      },
      {
        id: "cmd-toggle-fullscreen",
        title: "切换全屏模式",
        description: "最大化工作区进入全屏无边框书写体验",
        shortcut: "F11",
        category: "界面交互",
        run: () => toggleFullscreen(),
      },
      {
        id: "cmd-toggle-typewriter",
        title: "切换打字机居中模式",
        description: "保持当前输入光标始终居中于视口中心",
        shortcut: "Alt+T",
        category: "写作辅助",
        run: () => toggleTypewriterMode(),
      },
      {
        id: "cmd-theme-twitter",
        title: "视觉主题: 暗黑深邃 (Dark)",
        description: "适合夜间专注书写的暗色主题",
        category: "个性化外观",
        run: () => setPreferences((p) => ({ ...p, theme: "twitter" })),
      },
      {
        id: "cmd-theme-light",
        title: "视觉主题: 极简纯白 (Light)",
        description: "高对比度纸张级明亮主题",
        category: "个性化外观",
        run: () => setPreferences((p) => ({ ...p, theme: "light" })),
      },
      {
        id: "cmd-theme-eink",
        title: "视觉主题: 电子墨水屏 (E-ink)",
        description: "纯黑白极简无色差墨水屏质感",
        category: "个性化外观",
        run: () => setPreferences((p) => ({ ...p, theme: "eink" })),
      },
      {
        id: "cmd-about",
        title: "关于 KnowSpace 与帮助",
        description: "查看当前软件版本、系统信息与开源协议",
        category: "系统与支持",
        run: () => setAboutOpen(true),
      },
    ],
    [
      setViewMode,
      handleToggleGraphPane,
      handlePrintDocument,
      createNewFile,
      createNewCanvas,
      saveSession,
      saveSessionAs,
      openMarkdownDirectory,
      toggleFullscreen,
      toggleTypewriterMode,
    ]
  );

  // Global keybindings
  // ── Desktop shell wiring and keyboard shortcuts (R1 batch B3b-6) ─────────
  //
  // The eight refs below are the same mirrors App.tsx already kept: these
  // handlers are registered once and must not close over values that change.
  useGlobalShortcuts({
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
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleSelectSidebarTab = useCallback((tab: SidebarTab) => {
    if (sidebarOpen && sidebarTab === tab) {
      setSidebarOpen(false);
    } else {
      setSidebarTab(tab);
      setSidebarOpen(true);
    }
  }, [sidebarOpen, sidebarTab]);

  const handleMergeFlashNote = useCallback((content: string, fileName: string) => {
    const formatted = `\n\n> 📥 来自闪念 [${fileName}]\n\n${content.trim()}\n\n`;
    if (editorViewRef.current) {
      const view = editorViewRef.current;
      const selection = view.state.selection.main;
      const insertPos = selection.empty && selection.from > 0 ? selection.from : view.state.doc.length;
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: formatted },
        selection: { anchor: insertPos + formatted.length },
      });
    } else if (session) {
      updateSource(session.source + formatted);
    }
  }, [session, updateSource]);

  const wikiLinkTargets = useMemo(() => {
    const list: WikiLinkTarget[] = [];
    if (manifest?.chapters) {
      for (const ch of manifest.chapters) {
        list.push({
          id: ch.id,
          title: ch.title,
          relativePath: ch.src,
          absolutePath: ch.absolutePath,
        });
      }
    }
    return list;
  }, [manifest?.chapters]);

  const handleWikiLinkClick = useCallback(
    async (target: string) => {
      if (!target.trim()) return;
      const [docPart, anchorPart] = target.split("#");
      const cleanTarget = (docPart || "").trim().replace(/\.md$/i, "");
      if (!cleanTarget) {
        if (anchorPart) {
          jumpToHeading(anchorPart.trim(), "smooth", true);
          setNotice(anchorPart.startsWith("^") ? "已跳转至指定段落引用" : `已跳转至章节锚点：#${anchorPart.trim()}`);
        }
        return;
      }

      // 1. Search in current workspace chapters
      if (manifest?.chapters && manifest.chapters.length > 0) {
        const found = manifest.chapters.find((c) => {
          const cTitle = c.title.trim().toLowerCase();
          const cFileName = (c.src.split("/").pop() ?? "").replace(/\.md$/i, "").toLowerCase();
          const targetLower = cleanTarget.toLowerCase();
          return cTitle === targetLower || cFileName === targetLower;
        });

        if (found) {
          if (found.id === chapterId) {
            if (anchorPart) {
              jumpToHeading(anchorPart.trim(), "smooth", true);
            }
          } else {
            if (anchorPart) {
              pendingNavigationRef.current = {
                headingId: anchorPart.trim(),
                highlight: true,
              };
            }
            selectChapter(found.id);
          }
          const anchorLabel = anchorPart ? (anchorPart.startsWith("^") ? " (段落引用)" : ` #${anchorPart}`) : "";
          setNotice(`已跳转至双链文档：${found.title}${anchorLabel}`);
          return;
        }
      }

      // 2. Check in Space flash notes
      const desktop = window.bookMDDesktop;
      if (desktop?.getFlashNotesSummary) {
        try {
          const summary = await desktop.getFlashNotesSummary();
          if (summary?.success && summary.notes) {
            const foundNote = summary.notes.find((n) => {
              const baseName = n.fileName.replace(/\.md$/i, "").toLowerCase();
              return (
                baseName === cleanTarget.toLowerCase() ||
                n.content.toLowerCase().includes(cleanTarget.toLowerCase())
              );
            });
            if (foundNote && openDesktopMarkdownPathRef.current) {
              openDesktopMarkdownPathRef.current(foundNote.filePath);
              setNotice(`已跳转至 Space 闪念文档：${foundNote.fileName}`);
              return;
            }
          }
        } catch {}
      }

      // 3. Document not found: ask user to create in current workspace
      const rootPath = manifest?.rootPath;
      if (rootPath && desktop?.createMarkdownFile) {
        const confirmCreate = window.confirm(
          `双链文档「${cleanTarget}」尚未创建。\n\n是否立即在当前知识库新建「${cleanTarget}.md」？`
        );
        if (confirmCreate) {
          try {
            const newRes = await desktop.createMarkdownFile({
              rootPath,
              defaultName: `${cleanTarget}.md`,
            });
            if (!newRes.canceled && newRes.success) {
              let nextManifest = manifest;
              if (desktop.refreshDirectory) {
                nextManifest = await desktop.refreshDirectory(rootPath);
              } else {
                nextManifest = {
                  ...manifest,
                  chapters: [...manifest.chapters, newRes.chapter],
                };
              }
              setManifest(nextManifest);
              selectChapter(newRes.chapter.id);
              setNotice(`已为您创建并打开双链新文档：${cleanTarget}.md`);
            }
          } catch (err: any) {
            setNotice(err?.message || "创建双链新文档失败");
          }
        }
      } else {
        setNotice(`未找到匹配的双链目标「${cleanTarget}」`);
      }
    },
    [manifest, selectChapter, jumpToHeading]
  );

  // Backlink Index & Mentions
  // backlinkIndex and the vault search index live in useVaultStore alongside the
  // manifest they are derived from.

  // Cooperative idle background index scheduler
  // Guarantees 0ms lag upon opening files or folders, with buttery-smooth 60/120fps UI responsiveness.
  // ── Backlinks and the graph (R1 batch B3b-5) ─────────────────────────────
  //
  // Seven names come back out: the side panel and the graph pane read five of
  // them, and two are needed again further down. backlinkIndex itself stays
  // subscribed here because three later call sites read it directly.
  const {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  } = useBacklinkIndex({
    session,
    activeChapter,
    selectChapter,
    editorViewRef,
    sessionRef,
    openDesktopMarkdownPathRef,
    updateSource,
  });

  const handleRenameChapter = useCallback(
    async (chapter: any) => {
      const desktop = window.bookMDDesktop;
      if (!desktop?.renameMarkdownFile || !chapter.absolutePath) {
        setNotice("当前环境不支持文件重命名");
        return;
      }

      const oldTitle = chapter.title || chapter.src.replace(/\.md$/i, "");
      const input = window.prompt(`请输入「${oldTitle}」的新文档名称：`, oldTitle);
      if (!input || !input.trim() || input.trim() === oldTitle.trim()) {
        return;
      }
      const newTitle = input.trim().replace(/\.md$/i, "");

      // 1. Scan backlink index for references to oldTitle
      const linkedRefs = getLinkedReferences(backlinkIndex, oldTitle, chapter.src);
      let shouldRefactor = false;
      if (linkedRefs.length > 0) {
        const uniqueDocCount = new Set(linkedRefs.map((r) => r.sourceId)).size;
        shouldRefactor = window.confirm(
          `检测到知识库中有 ${uniqueDocCount} 篇笔记包含共 ${linkedRefs.length} 处双向引用「[[${oldTitle}]]」。\n\n` +
          `是否自动将所有引用重构更新为「[[${newTitle}]]」？\n\n` +
          `· 点击【确定】：重命名文件并批量自动重构所有双向链接（防断链）\n` +
          `· 点击【取消】：仅重命名文件，保留原有引用文本`
        );
      }

      // 2. Perform native file rename
      const renameRes = await desktop.renameMarkdownFile({
        oldPath: chapter.absolutePath,
        newTitle,
      });

      if (!renameRes.success || !renameRes.newPath) {
        setNotice(renameRes.error || "重命名失败");
        return;
      }

      // 3. Batch refactor references in other files if confirmed
      let refactoredTotal = 0;
      if (shouldRefactor && linkedRefs.length > 0) {
        const affectedSourceIds = Array.from(new Set(linkedRefs.map((r) => r.sourceId)));
        for (const sourceId of affectedSourceIds) {
          // If it's the currently open session
          if (session && session.chapterId === sourceId) {
            const { newContent, changedCount } = refactorWikiLinksInContent(session.source, oldTitle, newTitle);
            if (changedCount > 0) {
              updateSource(newContent);
              refactoredTotal += changedCount;
            }
            continue;
          }

          // If it's another chapter on disk
          const otherCh = manifest?.chapters.find((c) => c.id === sourceId);
          if (otherCh?.absolutePath && desktop.readMarkdownFile && desktop.saveMarkdownFile) {
            try {
              const fileRes = await desktop.readMarkdownFile(otherCh.absolutePath);
              if (fileRes?.markdown) {
                const { newContent, changedCount } = refactorWikiLinksInContent(fileRes.markdown, oldTitle, newTitle);
                if (changedCount > 0) {
                  await desktop.saveMarkdownFile({
                    absolutePath: otherCh.absolutePath,
                    content: newContent,
                  });
                  updateDocumentInIndex(backlinkIndex, otherCh.id, otherCh.title, newContent, otherCh.src);
                  refactoredTotal += changedCount;
                }
              }
            } catch (err) {
              console.error(`Failed to refactor links in ${otherCh.src}:`, err);
            }
          }
        }
      }

      // 4. Refresh directory manifest
      if (manifest?.rootPath && desktop.refreshDirectory) {
        try {
          const nextManifest = await desktop.refreshDirectory(manifest.rootPath);
          setManifest(nextManifest);
        } catch {}
      }

      // 5. Update tabs
      setTabs((prev) =>
        prev.map((t) => {
          if (
            t.id === chapter.id ||
            (t.absolutePath && chapter.absolutePath && t.absolutePath.toLowerCase() === chapter.absolutePath.toLowerCase())
          ) {
            return {
              ...t,
              title: newTitle,
              relativePath: renameRes.fileName || `${newTitle}.md`,
              absolutePath: renameRes.newPath || t.absolutePath,
            };
          }
          return t;
        })
      );

      // 6. Update active session if the renamed chapter is currently open
      if (session && session.chapterId === chapter.id && renameRes.newPath && desktop.readMarkdownFile) {
        try {
          const nextSource = await desktop.readMarkdownFile(renameRes.newPath);
          openSession({
            chapterId: chapter.id,
            absolutePath: renameRes.newPath,
            fileName: renameRes.fileName || `${newTitle}.md`,
            baseUrl: nextSource.baseUrl,
            source: nextSource.markdown,
            diskVersion: nextSource.diskVersion ?? null,
            writable: true,
            hasBom: nextSource.hasBom,
            lineEnding: nextSource.lineEnding,
          });
        } catch {}
      }

      setNotice(
        `已成功重命名为「${newTitle}」${refactoredTotal > 0 ? `，并同步更新了 ${refactoredTotal} 处双链引用` : ""}`
      );
    },
    [session, manifest, backlinkIndex, updateSource, openSession]
  );

  const isCanvasActive = Boolean((viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) && session);
  const isCanvasFullscreen = isCanvasActive && isFullscreen;

  return (
    <div
      className={`app-shell theme-${preferences.theme} ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}${directoryOpen ? "" : " directory-closed"}${manifest ? "" : " empty-source"}${isFullscreen ? " is-fullscreen" : ""}${isCanvasFullscreen ? " is-canvas-fullscreen" : ""}${isDualSplitMode ? " is-dual-split-mode" : ""}${isReviewFocus ? " is-review-focus" : ""}`}
    >
      {!isDualSplitMode && !isCanvasFullscreen && (
        <ActivityBar
          directoryOpen={directoryOpen}
          onToggleDirectory={() => setDirectoryOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
          activeSidebarTab={sidebarTab}
          onSelectSidebarTab={handleSelectSidebarTab}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          theme={preferences.theme}
          onThemeChange={(theme: ThemeMode) => setPreferences((current) => ({ ...current, theme }))}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onNewFile={window.bookMDDesktop ? createNewFile : undefined}
          onOpenDirectory={window.bookMDDesktop ? openMarkdownDirectory : undefined}
          onOpenAbout={() => setAboutOpen(true)}
          isDirty={isDirty}
          backlinksCount={currentLinkedReferences.length}
          onOpenGlobalGraph={handleToggleGraphPane}
          isGraphOpen={isGraphPaneOpen}
          onOpenCommandPalette={handleOpenCommandPalette}
        />
      )}

      <div className="main-viewport-container">
        {!isDualSplitMode && !isCanvasFullscreen && (
          <Toolbar
            title={manifest?.title ?? "Markdown Viewer"}
            chapterTitle={activeChapter?.title ?? "打开 Markdown 文件或目录"}
            isDirty={isDirty}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            canGoPrevious={activeIndex > 0}
            canGoNext={Boolean(manifest && activeIndex >= 0 && activeIndex < manifest.chapters.length - 1)}
            sidebarOpen={sidebarOpen}
            directoryOpen={directoryOpen}
            theme={preferences.theme}
            fontScale={preferences.fontScale}
            showLineNumbers={preferences.showLineNumbers}
            onToggleLineNumbers={() =>
              patchPreferences({ showLineNumbers: !preferences.showLineNumbers })
            }
            typewriterMode={typewriterMode}
            onToggleTypewriterMode={toggleTypewriterMode}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onPrevious={goPrevious}
            onNext={goNext}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            onToggleDirectory={() => setDirectoryOpen((open) => !open)}
            onAddBookmark={addBookmark}
            onNewFile={window.bookMDDesktop ? createNewFile : undefined}
            onSave={() => saveSession()}
            canSave={Boolean(session?.writable)}
            onOpenMarkdown={openMarkdownFile}
            onOpenDirectory={window.bookMDDesktop ? openMarkdownDirectory : undefined}
            onFontScaleChange={(fontScale) => patchPreferences({ fontScale })}
            onPrint={handlePrintDocument}
            onOpenCommandPalette={handleOpenCommandPalette}
            onOpenVersionHistory={() => setVersionHistoryOpen(true)}
          />
        )}

      <div className="workspace">
        {!isDualSplitMode && !isCanvasFullscreen && directoryOpen ? (
          manifest ? (
            <div style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }} className="chapter-list-container">
              <ChapterList
                manifest={manifest}
                activeChapterId={chapterId}
                isDirty={isDirty}
                onSelectChapter={selectChapter}
                onRenameChapter={handleRenameChapter}
                onNewMindmap={window.bookMDDesktop ? createNewMindmap : undefined}
                onNewCanvas={window.bookMDDesktop ? createNewCanvas : undefined}
              />
            </div>
          ) : (
            <aside className="chapter-list empty-library" style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }} aria-label="文档目录">
              <div className="tree-heading">DOCUMENT</div>
              <p>打开一个 Markdown 文件，新建文件，或在桌面版中打开文件目录。</p>
            </aside>
          )
        ) : null}

        {!isDualSplitMode && !isCanvasFullscreen && directoryOpen && (
          <div
            className={`layout-resizer ${resizingType === "dir" ? "is-active" : ""}`}
            onMouseDown={handleDirResizeMouseDown}
            onDoubleClick={handleDirDoubleClick}
            role="separator"
            aria-orientation="vertical"
            title="拖拽调整文档目录栏宽度（双击自适应最佳宽度）"
          />
        )}

        {!isDualSplitMode && !isCanvasFullscreen && sidebarOpen && (manifest || sidebarTab === "space") ? (
          <>
            <aside className="side-panel" style={{ width: sidebarWidth, flex: `0 0 ${sidebarWidth}px` }}>
              {sidebarTab === "space" ? (
                <section id="space-panel" role="tabpanel" aria-labelledby="space-tab">
                  <div className="space-standalone-header">
                    <div className="space-standalone-title">
                      <Zap size={15} style={{ color: "#f59e0b" }} />
                      <span>闪念 Space</span>
                    </div>
                    {manifest && (
                      <button
                        type="button"
                        className="space-standalone-close-btn"
                        onClick={() => setSidebarTab("toc")}
                        title="返回大纲目录"
                        aria-label="返回大纲目录"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <SpaceTimelinePanel
                    onOpenNoteFile={(filePath) => {
                      if (openDesktopMarkdownPathRef.current) {
                        openDesktopMarkdownPathRef.current(filePath);
                      }
                    }}
                    onReviewActiveChange={handleReviewActiveChange}
                    onMergeIntoDocument={handleMergeFlashNote}
                  />
                </section>
              ) : (
                <>
                  <div className="tabs" role="tablist" aria-label="侧栏区域">
                    {(["toc", "bookmarks", "search"] as SidebarTab[]).map((tab) => (
                      <button
                        key={tab}
                        id={`${tab}-tab`}
                        role="tab"
                        aria-selected={sidebarTab === tab}
                        aria-controls={`${tab}-panel`}
                        className={sidebarTab === tab ? "active" : ""}
                        onClick={() => setSidebarTab(tab)}
                      >
                        {tabLabels[tab]}
                      </button>
                    ))}
                  </div>
                  {sidebarTab === "toc" && manifest ? (
                    <section id="toc-panel" role="tabpanel" aria-labelledby="toc-tab">
                      <TocPanel
                        headings={
                          renderedChapter?.headings?.length
                            ? renderedChapter.headings
                            : session?.source
                              ? extractHeadingsFromSource(session.source)
                              : []
                        }
                        activeHeadingId={activeHeadingId}
                        bookmarkedHeadingIds={bookmarkedHeadingIds}
                        onJump={jumpToHeading}
                      />
                    </section>
                  ) : null}
                  {sidebarTab === "bookmarks" && manifest ? (
                    <section id="bookmarks-panel" role="tabpanel" aria-labelledby="bookmarks-tab">
                      <BookmarkPanel
                        bookmarks={bookmarks}
                        manifest={manifest}
                        onJump={jumpBookmark}
                        onDelete={(bookmarkId) => persistBookmarks(bookmarks.filter((item) => item.id !== bookmarkId))}
                      />
                    </section>
                  ) : null}
                  {sidebarTab === "search" && manifest ? (
                    <section id="search-panel" role="tabpanel" aria-labelledby="search-tab">
                      <SearchPanel
                        query={searchQuery}
                        results={searchResults}
                        activeResultId={activeSearchMatchId}
                        scope={searchScope}
                        onScopeChange={setSearchScope}
                        vaultDocCount={manifest?.chapters?.length}
                        onQueryChange={(q) => {
                          setSearchQuery(q);
                          setActiveSearchMatchId(null);
                          if (!q.trim()) {
                            clearSearchHighlights();
                          }
                        }}
                        onJump={handleSearchJump}
                      />
                    </section>
                  ) : null}
                  {sidebarTab === "backlinks" ? (
                    <section id="backlinks-panel" role="tabpanel" aria-labelledby="backlinks-tab">
                      <BacklinksPanel
                        currentTitle={currentDocTitle}
                        currentPath={session?.absolutePath || session?.fileName}
                        currentDocId={session?.chapterId}
                        linkedReferences={currentLinkedReferences}
                        unlinkedMentions={currentUnlinkedMentions}
                        onJumpToSource={handleJumpToBacklink}
                        onConvertMention={handleConvertMention}
                        graphData={graphData}
                        theme={preferences.theme}
                        onOpenGlobalGraph={() => setIsGraphPaneOpen(true)}
                      />
                    </section>
                  ) : null}
                </>
              )}
            </aside>
            <div
              className={`layout-resizer ${resizingType === "sidebar" ? "is-active" : ""}`}
              onMouseDown={handleSidebarResizeMouseDown}
              onDoubleClick={handleSidebarDoubleClick}
              role="separator"
              aria-orientation="vertical"
              title="拖拽调整大纲侧栏宽度（双击自适应最佳宽度）"
            />
          </>
        ) : null}

        <section className="reader-frame">
          {!isCanvasFullscreen && tabs.length > 0 && (
            <TabBar
              tabs={tabsForDisplay}
              activeTabId={chapterId}
              dualSplitTabId={dualSplitTabId}
              onSelectTab={selectChapter}
              onCloseTab={handleCloseTab}
              onCloseOtherTabs={handleCloseOtherTabs}
              onCloseRightTabs={handleCloseRightTabs}
              onOpenDualSplit={handleOpenDualSplit}
              onCloseDualSplit={handleCloseDualSplit}
              onDetachTab={handleDetachTab}
              isGraphPaneOpen={isGraphPaneOpen}
              onToggleGraphPane={handleToggleGraphPane}
            />
          )}
          {(() => {
            const innerWorkspace = isDualSplitMode && secondaryRenderedChapter ? (
              <DualDocumentWorkspace
                primaryTitle={activeChapter?.title ?? session?.fileName ?? "主文档"}
                viewMode={viewMode}
                source={session?.source ?? ""}
                onSourceChange={updateSource}
                renderedChapter={renderedChapter}
                primaryContainerRef={readerRef}
                theme={preferences.theme}
                fontScale={preferences.fontScale}
                mermaidTheme={resolveMermaidTheme(preferences.theme)}
                onMermaidError={handleMermaidError}
                onSave={() => saveSession()}
                isLargeDocument={isLargeDocument}
                autoPreviewPaused={autoPreviewPaused}
                onRefreshPreview={renderPreviewNow}
                readOnly={!session?.writable}
                showLineNumbers={preferences.showLineNumbers}
                typewriterMode={typewriterMode}
                currentFilePath={session?.absolutePath || undefined}
                onOpenLightbox={(media) => setLightboxMedia(media)}
                onEditorViewReady={(view) => {
                  editorViewRef.current = view;
                }}
                secondaryTitle={tabs.find((t) => t.id === dualSplitTabId)?.title ?? "对照文档"}
                secondaryRenderedChapter={secondaryRenderedChapter}
                secondaryContainerRef={secondaryReaderRef}
                onCloseSecondary={handleCloseDualSplit}
                wikiLinkTargets={wikiLinkTargets}
                onWikiLinkClick={handleWikiLinkClick}
                backlinksCount={currentLinkedReferences.length}
                onOpenBacklinks={() => {
                  setSidebarTab("backlinks");
                  setSidebarOpen(true);
                }}
                onExtractToNote={handleExtractSelectionToNote}
                onSendToFlash={handleSendSelectionToFlash}
                onPrint={handlePrintDocument}
                onToggleMindmap={handleToggleMindmap}
                onRevealInToc={handleRevealInToc}
              />
            ) : viewMode === "mindmap" && session ? (
              <MindmapView
                title={activeChapter?.title ?? session?.fileName ?? "知识思维导图"}
                headings={renderedChapter?.headings ?? []}
                source={session.source}
                onSourceChange={updateSource}
                editable={session.writable}
                theme={preferences.theme}
                onJumpToHeading={(headingId, _line) => {
                  setViewMode("split");
                  window.setTimeout(() => {
                    jumpToHeading(headingId, "smooth", true);
                  }, 80);
                }}
                onClose={() => setViewMode("split")}
              />
            ) : (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) && session ? (
              <CanvasView
                key={session.chapterId || session.absolutePath || "canvas-session"}
                title={activeChapter?.title ?? session.fileName ?? "空间白板"}
                source={session.source}
                onSourceChange={updateSource}
                editable={session.writable}
                theme={preferences.theme}
                allChapters={manifest?.chapters}
                onOpenFile={(docPath) => {
                  if (openDesktopMarkdownPathRef.current) {
                    openDesktopMarkdownPathRef.current(docPath);
                  }
                }}
                onExtractToNote={(docTitle, content) => handleCreateCanvasExtractNote(content, docTitle)}
                onClose={() => setViewMode("split")}
                onSave={() => saveSession()}
                isDirty={isDirty}
                isSaving={isSaving}
                currentFilePath={session.absolutePath || session.fileName}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            ) : session ? (
              <DocumentWorkspace
                viewMode={viewMode}
                source={session.source}
                onSourceChange={updateSource}
                renderedChapter={renderedChapter}
                containerRef={readerRef}
                theme={preferences.theme}
                fontScale={preferences.fontScale}
                mermaidTheme={resolveMermaidTheme(preferences.theme)}
                onMermaidError={handleMermaidError}
                onSave={() => saveSession()}
                isLargeDocument={isLargeDocument}
                autoPreviewPaused={autoPreviewPaused}
                onRefreshPreview={renderPreviewNow}
                readOnly={!session.writable}
                showLineNumbers={preferences.showLineNumbers}
                typewriterMode={typewriterMode}
                currentFilePath={session.absolutePath || undefined}
                onOpenLightbox={(media) => setLightboxMedia(media)}
                onEditorViewReady={(view) => {
                  editorViewRef.current = view;
                }}
                navLockUntilRef={navLockUntilRef}
                wikiLinkTargets={wikiLinkTargets}
                onWikiLinkClick={handleWikiLinkClick}
                backlinksCount={currentLinkedReferences.length}
                onOpenBacklinks={() => {
                  setSidebarTab("backlinks");
                  setSidebarOpen(true);
                }}
                onExtractToNote={handleExtractSelectionToNote}
                onSendToFlash={handleSendSelectionToFlash}
                onPrint={handlePrintDocument}
                onToggleMindmap={handleToggleMindmap}
                onRevealInToc={handleRevealInToc}
              />
            ) : (
              <main className="empty-reader" ref={readerRef}>
                <div className="empty-reader-card">
                  <h1 className="empty-reader-title">选择或新建 Markdown 文档</h1>
                  <p className="empty-reader-desc">
                    体验现代化本地优先的 Markdown 阅读与极客编辑。支持双向同步滚动、选择联动高亮、多级大纲与原子物理落盘。
                  </p>
                  <div className="empty-actions-grid">
                    {window.bookMDDesktop ? (
                      <button type="button" className="empty-action-card" onClick={createNewFile}>
                        <FilePlus2 size={22} className="about-icon text-orange" />
                        <span>新建 Markdown</span>
                      </button>
                    ) : null}
                    {window.bookMDDesktop ? (
                      <button type="button" className="empty-action-card" onClick={createNewMindmap}>
                        <ListTree size={22} className="about-icon text-cyan" />
                        <span>新建思维导图</span>
                      </button>
                    ) : null}
                    {window.bookMDDesktop ? (
                      <button type="button" className="empty-action-card" onClick={createNewCanvas}>
                        <Boxes size={22} className="about-icon text-emerald" />
                        <span>新建空间白板</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="empty-action-card"
                      onClick={() => {
                        document.querySelector<HTMLInputElement>("input[type='file']")?.click();
                      }}
                    >
                      <FileText size={22} className="about-icon text-blue" />
                      <span>打开单文件</span>
                    </button>
                    {window.bookMDDesktop ? (
                      <button type="button" className="empty-action-card" onClick={openMarkdownDirectory}>
                        <FolderOpen size={22} className="about-icon text-purple" />
                        <span>打开文档目录</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </main>
            );

            if (isGraphPaneOpen) {
              return (
                <GraphWorkspaceLayout
                  viewMode={viewMode}
                  graphData={graphData}
                  currentDocId={currentActiveId}
                  theme={preferences.theme}
                  onSelectNode={handleJumpToBacklink}
                  onCloseGraph={handleCloseGraphPane}
                >
                  {innerWorkspace}
                </GraphWorkspaceLayout>
              );
            }

            return innerWorkspace;
          })()}
        </section>
      </div>

      {!isCanvasFullscreen && (
        <StatusBar
          fileName={session?.fileName}
          chapterTitle={activeChapter?.title}
          source={session?.source}
          isDirty={isDirty}
          writable={session?.writable}
          lineEnding={session?.lineEnding}
          viewMode={viewMode}
          isLargeDocument={isLargeDocument}
        />
      )}
    </div>

      {/* Floating surfaces — lightbox, guard dialogs, palette, history, about, toast.
          They read the lightbox, open flags, notice and preferences from the
          stores themselves; only the editing session and the actions this
          component orchestrates are passed in. */}
      <AppOverlays
        session={session}
        conflict={conflict}
        activeChapter={activeChapter}
        renderedChapter={renderedChapter}
        commandActions={commandActions}
        onSelectChapter={selectChapter}
        onJumpToHeading={(id) => jumpToHeading(id, "smooth", true)}
        onSavePending={handleDialogSave}
        onDiscardPending={handleDialogDiscard}
        onCancelPending={handleDialogCancel}
        onReloadFromDisk={reloadFromDisk}
        onOverwrite={() => saveSession({ force: true })}
        onSaveAs={saveSessionAs}
        onClearConflict={clearConflict}
        onRevertToContent={async (revertedContent) => {
          updateSource(revertedContent);
          await saveSession({ force: true });
          setNotice("已成功从历史快照安全还原当前文档。");
          return true;
        }}
      />

    </div>
  );
}

export default App;

const tabLabels: Record<SidebarTab, string> = {
  toc: "大纲",
  bookmarks: "书签",
  search: "搜索",
  space: "闪念 Space",
  backlinks: "反向链接",
};

function resolveMermaidTheme(theme: ThemeMode): MermaidTheme {
  if (theme === "twitter") return "dark";
  if (theme === "eink") return "neutral";
  if (theme === "light") return "default";
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}
