import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityBar } from "./components/ActivityBar";
import { ChapterList } from "./components/ChapterList";
import { AppOverlays } from "./components/AppOverlays";
import { SidebarPanel } from "./components/SidebarPanel";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { WorkspaceRouter } from "./components/WorkspaceRouter";
import type { CommandAction } from "./components/CommandPalette";
import type {
  BookManifest,
  Bookmark,
  ChapterSource,
  RenderedChapter,
  SearchResult,
  SidebarTab,
  ThemeMode,
} from "./core/types";
import { EditorView } from "@codemirror/view";
import { useChapterLoading } from "./hooks/useChapterLoading";
import { useChapterRename } from "./hooks/useChapterRename";
import { useColumnResize } from "./hooks/useColumnResize";
import { useDocumentAuthoring } from "./hooks/useDocumentAuthoring";
import { useDocumentCreation } from "./hooks/useDocumentCreation";
import { useVaultOpening } from "./hooks/useVaultOpening";
import { useSearch } from "./hooks/useSearch";
import { useBacklinkIndex } from "./hooks/useBacklinkIndex";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { commandBus } from "./services/commandBus";
import { listPaletteCommands } from "./core/commands";
import { useBookmarks } from "./hooks/useBookmarks";
import { useDocumentSession } from "./hooks/useDocumentSession";
import { useReadingPersistence } from "./hooks/useReadingPersistence";
import { useReadingTracker } from "./hooks/useReadingTracker";
import { useTabActions } from "./hooks/useTabActions";
import { useUnsavedGuard } from "./hooks/useUnsavedGuard";
import { useWikiLinkNavigation } from "./hooks/useWikiLinkNavigation";

import { useUiStore } from "./store/useUiStore";
import { useReviewStore } from "./store/useReviewStore";
import { useTabStore, tabsWithDirtyFlags, type TabMeta } from "./store/useTabStore";
import { useVaultStore } from "./store/useVaultStore";
import { samePath } from "./core/paths";

export function App() {
  const readerRef = useRef<HTMLElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pendingBookmarkRef = useRef<Bookmark | null>(null);
  const pendingNavigationRef = useRef<{
    headingId?: string;
    lineNumber?: number;
    highlight?: boolean;
    searchResult?: SearchResult;
  } | null>(null);
  const activeHeadingRef = useRef<string | undefined>(undefined);
  const scrollRatioRef = useRef(0);
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
  const persistBookmarks = useVaultStore((s) => s.persistBookmarks);
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
  const ensureTab = useTabStore((s) => s.ensureTab);
  const chapterId = useTabStore((s) => s.activeTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const rememberVisitedDoc = useTabStore((s) => s.rememberVisitedDoc);

  const tabsRef = useRef<TabMeta[]>(tabs);
  tabsRef.current = tabs;
  // The comparison pane's rendered content stays here: it is a view artefact
  // produced by loading a second document, not part of what tabs are.
  const [secondaryRenderedChapter, setSecondaryRenderedChapter] = useState<RenderedChapter | null>(
    null,
  );
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
  const notice = useUiStore((s) => s.notice);
  const preferences = useUiStore((s) => s.preferences);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const isReviewFocus = useUiStore((s) => s.isReviewFocus);
  const directoryWidth = useUiStore((s) => s.directoryWidth);
  const resizingType = useUiStore((s) => s.resizingType);

  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  // The store calls this one setFullscreen; the local alias keeps the existing
  // call sites reading naturally.
  const setIsFullscreen = useUiStore((s) => s.setFullscreen);
  const setTypewriterMode = useUiStore((s) => s.setTypewriterMode);
  const setNotice = useUiStore((s) => s.setNotice);
  const setPreferences = useUiStore((s) => s.setPreferences);
  const patchPreferences = useUiStore((s) => s.patchPreferences);
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
    [setReviewFocus, setDirectoryOpen],
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
    primeRenderedCache,
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
    [tabs, chapterId, isDirty],
  );

  /**
   * A counter for "start a review", bumped by the command palette.
   *
   * The review lives behind the Space panel's own tab, which the workspace does not
   * otherwise control — so the request travels as a changing number it can watch,
   * rather than as a flag it might already be showing.
   */
  const reviewRequest = useReviewStore((s) => s.reviewRequest);
  const requestReview = useReviewStore((s) => s.requestReview);

  /**
   * The open document as the review can use it, or null.
   *
   * Null for anything that is not Markdown: the review's progress is a comment block
   * appended to the file, and a canvas document or a mind map's companion is not a
   * place to append one.
   *
   * `dirty` travels with it, because the review turns this source down while the
   * document has unsaved changes — see DailyReviewPanel, which explains why that is a
   * rule rather than a warning.
   */
  const reviewableDocument = useMemo(() => {
    if (!session?.absolutePath) return null;
    const fileName = session.fileName.toLowerCase();
    if (!fileName.endsWith(".md") && !fileName.endsWith(".markdown")) return null;
    return { filePath: session.absolutePath, content: session.source, dirty: isDirty };
  }, [session?.absolutePath, session?.fileName, session?.source, isDirty]);
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
  const { searchResults, jumpToHeading, jumpToRatio, clearSearchHighlights, handleSearchJump } =
    useSearch({
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

  // ── The unsaved-changes guard (R1 batch) ──────────────────────────────────
  //
  // Every mutating navigation funnels through guardAction: with unsaved changes
  // the action is parked and the dialog raised, without them it executes at
  // once. The dialog's three answers are wired to AppOverlays below.
  const { guardAction, handleDialogSave, handleDialogDiscard, handleDialogCancel } =
    useUnsavedGuard({
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
    });

  const selectChapter = useCallback(
    (nextChapterId: string) => {
      const targetChap = manifestRef.current?.chapters.find((c) => c.id === nextChapterId);
      const targetTab = tabsRef.current?.find((t) => t.id === nextChapterId);
      const targetSrc =
        targetChap?.src || targetTab?.relativePath || targetChap?.title || targetTab?.title || "";
      const isCanvas = targetSrc.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        setDirectoryOpen(false);
        setSidebarOpen(false);
        setViewMode("canvas");
      }
      if (nextChapterId === chapterId) return;
      guardAction({ type: "select-chapter", chapterId: nextChapterId });
    },
    [chapterId, guardAction],
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

  const openDesktopMarkdownPath = useCallback(
    (absolutePath: string, preloadedSource?: ChapterSource | null) => {
      if (samePath(session?.absolutePath, absolutePath)) {
        return;
      }
      guardAction({ type: "open-desktop-file", absolutePath, preloadedSource });
    },
    [session?.absolutePath, guardAction],
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

  const openDesktopMarkdownPathRef = useRef(openDesktopMarkdownPath);
  const guardActionRef = useRef(guardAction);

  useEffect(() => {
    openDesktopMarkdownPathRef.current = openDesktopMarkdownPath;
    guardActionRef.current = guardAction;
  });

  // ── Tab-bar actions (R1 batch) ────────────────────────────────────────────
  //
  // The six handlers the tab bar binds: dual split open/close and the four
  // kinds of close. What a close implies for the active tab and the editing
  // session lives in the hook; the store owns the array transforms.
  const {
    handleOpenDualSplit,
    handleCloseDualSplit,
    handleCloseTab,
    handleDetachTab,
    handleCloseOtherTabs,
    handleCloseRightTabs,
  } = useTabActions({ selectChapter, closeSession, activeLoadedChapterIdRef });

  // ── Wiki-link navigation (R1 batch) ──────────────────────────────────────
  //
  // Resolving a `[[wiki link]]` click and the completion list the editor offers
  // — one navigation domain, one hook.
  const { wikiLinkTargets, handleWikiLinkClick } = useWikiLinkNavigation({
    selectChapter,
    jumpToHeading,
    openDesktopMarkdownPathRef,
    pendingNavigationRef,
  });

  // ── Rename, and the features that produce a document (R1 batch) ──────────
  const { handleRenameChapter } = useChapterRename({ session, updateSource, openSession });

  const { handleCreateCanvasExtractNote, handleImportOutline } = useDocumentAuthoring({
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
  });

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

  const goPrevious = useCallback(() => {
    if (!manifest || activeIndex <= 0) return;
    selectChapter(manifest.chapters[activeIndex - 1].id);
  }, [activeIndex, manifest, selectChapter]);

  const goNext = useCallback(() => {
    if (!manifest || activeIndex < 0 || activeIndex >= manifest.chapters.length - 1) return;
    selectChapter(manifest.chapters[activeIndex + 1].id);
  }, [activeIndex, manifest, selectChapter]);

  // ── Reading-position persistence (R1 batch) ──────────────────────────────
  //
  // Saving the position as the reader settles, restoring it (or a queued
  // bookmark / cross-document navigation) when a document renders, and
  // pre-rendering the neighbours. Must sit before useReadingTracker, which
  // reports the scroll idle that drives the save.
  const { saveCurrentReadingPosition } = useReadingPersistence({
    chapterId,
    renderedChapter,
    activeHeadingId,
    readerRef,
    editorViewRef,
    activeHeadingRef,
    scrollRatioRef,
    pendingBookmarkRef,
    pendingNavigationRef,
    restoredChapterIdRef,
    jumpToHeading,
    jumpToRatio,
    handleSearchJump,
    primeRenderedCache,
  });

  useReadingTracker({
    containerRef: readerRef,
    headings: renderedChapter?.headings ?? [],
    activeHeadingRef,
    scrollRatioRef,
    onActiveHeadingChange: setActiveHeadingId,
    onScrollIdle: saveCurrentReadingPosition,
    navLockUntilRef,
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

  // ── Chapter loading and view sync (R1 batch) ──────────────────────────────
  //
  // Turning "the active tab is chapter X" into "the session holds chapter X":
  // the loader with its already-loaded short-circuits, the canvas-closes-panels
  // rule, and the dual-split pane's independent load.
  useChapterLoading({
    session,
    viewMode,
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
    setSecondaryRenderedChapter,
  });

  // Apply the theme to the document and the native window frame.
  //
  // Persisting preferences is no longer part of this effect — the store writes
  // them when they change — so only the DOM and Electron side effects remain.
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    window.bookMDDesktop?.setNativeTheme?.(preferences.theme);
  }, [preferences]);

  /**
   * Tells the main process whether hidden documents should be listed, and
   * re-lists the open folder so the change is visible immediately.
   *
   * The preference is read in the main process, because that is where the
   * directory is walked — so it has to be pushed rather than simply stored. And
   * pushing it is only half the job: the tree already on screen was built under
   * the old setting, and without the re-listing below, turning the option on
   * would appear to do nothing until the reader happened to reopen the folder.
   *
   * Keyed on the preference alone. Depending on `manifest` would re-run this on
   * every refresh, and the refresh itself changes the manifest — a loop.
   */
  useEffect(() => {
    const desktop = window.bookMDDesktop;
    desktop?.setScanOptions?.({ includeHidden: preferences.showHiddenFiles === true });

    const rootPath = manifestRef.current?.rootPath;
    if (!rootPath || !desktop?.refreshDirectory) return;

    let cancelled = false;
    void (async () => {
      try {
        const next = await desktop.refreshDirectory(rootPath);
        if (!cancelled && next) setManifest(next);
      } catch {
        // A failed re-listing leaves the tree as it is. The setting is already
        // stored, so the next open picks it up — no need to say anything.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preferences.showHiddenFiles, setManifest]);

  const handlePrintDocument = useCallback(async () => {
    if (renderPreviewNow) {
      try {
        await renderPreviewNow();
      } catch {
        // ignore
      }
    }
    const desktop =
      typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
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
      const desktop =
        typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
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
    [manifest?.rootPath, session],
  );

  const handleSendSelectionToFlash = useCallback(async (text: string) => {
    const desktop =
      typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
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

  // Global keybindings
  // ── Desktop shell wiring and keyboard shortcuts (R1 batch B3b-6) ─────────
  //
  // Keybindings execute commands through the bus; the handlers themselves are
  // bound once in useCommandRegistrations above, so the keyboard holds no
  // second copy of any action. The refs still passed here serve the shell
  // wiring (launch file, close guard) rather than actions.
  useGlobalShortcuts({
    initialHandledRef,
    openDesktopMarkdownPathRef,
    guardActionRef,
    handleCloseDualSplit,
    handleCloseTab,
    selectChapter,
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleSelectSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (sidebarOpen && sidebarTab === tab) {
        setSidebarOpen(false);
      } else {
        setSidebarTab(tab);
        setSidebarOpen(true);
      }
    },
    [sidebarOpen, sidebarTab],
  );

  const handleMergeFlashNote = useCallback(
    (content: string, fileName: string) => {
      const formatted = `\n\n> 📥 来自闪念 [${fileName}]\n\n${content.trim()}\n\n`;
      if (editorViewRef.current) {
        const view = editorViewRef.current;
        const selection = view.state.selection.main;
        const insertPos =
          selection.empty && selection.from > 0 ? selection.from : view.state.doc.length;
        view.dispatch({
          changes: { from: insertPos, to: insertPos, insert: formatted },
          selection: { anchor: insertPos + formatted.length },
        });
      } else if (session) {
        updateSource(session.source + formatted);
      }
    },
    [session, updateSource],
  );

  // Backlink Index & Mentions
  // backlinkIndex and the vault search index live in useVaultStore alongside the
  // manifest they are derived from.

  // Cooperative idle background index scheduler
  // Guarantees 0ms lag upon opening files or folders, with buttery-smooth 60/120fps UI responsiveness.
  // ── Backlinks and the graph (R1 batch B3b-5) ─────────────────────────────
  //
  // Seven names come back out: the side panel and the graph pane read five of
  // them, and two are needed again further down.
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

  const isCanvasActive = Boolean(
    (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) && session,
  );
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
            canGoNext={Boolean(
              manifest && activeIndex >= 0 && activeIndex < manifest.chapters.length - 1,
            )}
            sidebarOpen={sidebarOpen}
            directoryOpen={directoryOpen}
            theme={preferences.theme}
            fontScale={preferences.fontScale}
            showLineNumbers={preferences.showLineNumbers}
            onToggleLineNumbers={() =>
              patchPreferences({ showLineNumbers: !preferences.showLineNumbers })
            }
            showHiddenFiles={preferences.showHiddenFiles}
            hasDirectory={Boolean(manifest?.rootPath)}
            onToggleHiddenFiles={() =>
              patchPreferences({ showHiddenFiles: !preferences.showHiddenFiles })
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
              <div
                style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }}
                className="chapter-list-container"
              >
                <ChapterList
                  manifest={manifest}
                  activeChapterId={chapterId}
                  isDirty={isDirty}
                  onSelectChapter={selectChapter}
                  onRenameChapter={handleRenameChapter}
                  onNewMindmap={window.bookMDDesktop ? createNewMindmap : undefined}
                  onNewCanvas={window.bookMDDesktop ? createNewCanvas : undefined}
                  onImportOutline={
                    window.bookMDDesktop?.pickOutlineFile ? handleImportOutline : undefined
                  }
                />
              </div>
            ) : (
              <aside
                className="chapter-list empty-library"
                style={{ width: directoryWidth, flex: `0 0 ${directoryWidth}px` }}
                aria-label="文档目录"
              >
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

          {!isDualSplitMode &&
          !isCanvasFullscreen &&
          sidebarOpen &&
          (manifest || sidebarTab === "space") ? (
            <SidebarPanel
              manifest={manifest}
              session={session}
              renderedChapter={renderedChapter}
              activeHeadingId={activeHeadingId}
              bookmarkedHeadingIds={bookmarkedHeadingIds}
              jumpToHeading={jumpToHeading}
              jumpBookmark={jumpBookmark}
              bookmarks={bookmarks}
              persistBookmarks={persistBookmarks}
              searchQuery={searchQuery}
              searchResults={searchResults}
              activeSearchMatchId={activeSearchMatchId}
              searchScope={searchScope}
              onQueryChange={(q) => {
                setSearchQuery(q);
                setActiveSearchMatchId(null);
                if (!q.trim()) {
                  clearSearchHighlights();
                }
              }}
              onScopeChange={setSearchScope}
              handleSearchJump={handleSearchJump}
              reviewableDocument={reviewableDocument}
              openReviewRequest={reviewRequest}
              onOpenNoteFile={(filePath) => openDesktopMarkdownPathRef.current?.(filePath)}
              handleReviewActiveChange={handleReviewActiveChange}
              handleMergeFlashNote={handleMergeFlashNote}
              handleSidebarResizeMouseDown={handleSidebarResizeMouseDown}
              handleSidebarDoubleClick={handleSidebarDoubleClick}
              backlinks={{
                currentDocTitle,
                currentLinkedReferences,
                currentUnlinkedMentions,
                handleJumpToBacklink,
                handleConvertMention,
                graphData,
              }}
              theme={preferences.theme}
              onOpenGlobalGraph={() => setIsGraphPaneOpen(true)}
            />
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
            <WorkspaceRouter
              session={session}
              activeChapter={activeChapter}
              renderedChapter={renderedChapter}
              secondaryRenderedChapter={secondaryRenderedChapter}
              viewMode={viewMode}
              isDirty={isDirty}
              isSaving={isSaving}
              isLargeDocument={isLargeDocument}
              autoPreviewPaused={autoPreviewPaused}
              isDualSplitMode={isDualSplitMode}
              readerRef={readerRef}
              secondaryReaderRef={secondaryReaderRef}
              editorViewRef={editorViewRef}
              navLockUntilRef={navLockUntilRef}
              updateSource={updateSource}
              renderPreviewNow={renderPreviewNow}
              saveSession={saveSession}
              setViewMode={setViewMode}
              toggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              handleCloseDualSplit={handleCloseDualSplit}
              handlePrintDocument={handlePrintDocument}
              handleExtractSelectionToNote={handleExtractSelectionToNote}
              handleSendSelectionToFlash={handleSendSelectionToFlash}
              handleCreateCanvasExtractNote={handleCreateCanvasExtractNote}
              handleWikiLinkClick={handleWikiLinkClick}
              handleJumpToBacklink={handleJumpToBacklink}
              handleToggleMindmap={handleToggleMindmap}
              handleRevealInToc={handleRevealInToc}
              handleOpenBacklinks={() => {
                setSidebarTab("backlinks");
                setSidebarOpen(true);
              }}
              wikiLinkTargets={wikiLinkTargets}
              backlinksCount={currentLinkedReferences.length}
              graph={{ graphData, currentActiveId }}
              handleCloseGraphPane={handleCloseGraphPane}
              onOpenDesktopMarkdownPath={(p) => openDesktopMarkdownPathRef.current?.(p)}
              jumpToHeading={jumpToHeading}
              createNewFile={createNewFile}
              createNewMindmap={createNewMindmap}
              createNewCanvas={createNewCanvas}
              openMarkdownDirectory={openMarkdownDirectory}
            />
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
