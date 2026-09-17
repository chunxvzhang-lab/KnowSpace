import { useRef } from "react";
import { loadBookmarks, loadReadingPosition } from "../services/storage";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type {
  BookManifest,
  Bookmark,
  ChapterManifest,
  ChapterSource,
} from "../core/types";
import type { useDocumentSession } from "./useDocumentSession";

/**
 * Opening a document: a file dropped or picked, a path handed over by the
 * desktop shell, or a whole folder.
 *
 * Third logic hook out of App.tsx (R1 batch B3b-3), and the largest single
 * block to leave so far. The three flows share a shape — work out what was
 * asked for, read the source, build or refresh the manifest, register the tab,
 * hand the source to the session — but each has its own edge cases, and they
 * are kept separate rather than merged behind a parameter for the same reason
 * the creation flows are.
 *
 * `openRequestRef` lives here because this is its only reader and writer: it
 * counts requests so a slow read that has been overtaken by a newer one can
 * notice and abandon its result.
 *
 * Two refs travel in. `activeLoadedChapterIdRef` marks which chapter the
 * session holds and is also read by the loading effect that stays in App.tsx.
 * `pendingBookmarkRef` is shared with the bookmark jump, which is a separate
 * concern that happens to hand over the same way.
 */

type UseVaultOpeningParams = {
  /** The session owns opening documents; this hook only asks it to. */
  openSession: ReturnType<typeof useDocumentSession>["openSession"];
  setViewMode: ReturnType<typeof useDocumentSession>["setViewMode"];
  activeLoadedChapterIdRef: { current: string };
  /** A bookmark waiting for its chapter to finish loading. */
  pendingBookmarkRef: { current: Bookmark | null };
};

export function useVaultOpening({
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
  pendingBookmarkRef,
}: UseVaultOpeningParams) {
  // The manifest is read through getState where it is needed rather than
  // subscribed here: every use of it sits after an await, so a value captured
  // at render time would be stale.
  const setManifest = useVaultStore((s) => s.setManifest);
  const setBookmarks = useVaultStore((s) => s.setBookmarks);
  const setNotice = useUiStore((s) => s.setNotice);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);
  // Opening a document abandons whatever was being searched for.
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);

  /**
   * Counts open requests so a slow read that has been superseded can abandon
   * its result instead of overwriting the newer one.
   */
  const openRequestRef = useRef(0);

  const doOpenMarkdownFile = async (file: File) => {
    openRequestRef.current += 1;
    const extensionOk = /\.(md|markdown|canvas)$/i.test(file.name);
    const typeOk = file.type === "text/markdown" || file.name.toLowerCase().endsWith(".canvas");
    if (!extensionOk && !typeOk) {
      setNotice("请选择 .md、.markdown 或 .canvas 文件。");
      return;
    }

    try {
      const markdown = await file.text();
      const baseName = file.name.replace(/\.(md|markdown|canvas)$/i, "") || "本地文档";
      const localId = `local:${file.name}:${file.size}:${file.lastModified}`;
      const localManifest: BookManifest = {
        id: localId,
        title: baseName,
        description: "本地单文件",
        chapters: [{ id: "uploaded", title: baseName, src: file.name }],
      };

      pendingBookmarkRef.current = null;
      setManifest(localManifest);
      setBookmarks(loadBookmarks(localId, localManifest.chapters));
      setChapterId("uploaded");
      setTabs([{ id: "uploaded", title: baseName, relativePath: file.name, absolutePath: undefined }]);
      if (file.name.toLowerCase().endsWith(".canvas")) {
        setViewMode("canvas");
        setDirectoryOpen(false);
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
        setSidebarTab("toc");
      }
      activeLoadedChapterIdRef.current = "uploaded";

      openSession({
        chapterId: "uploaded",
        absolutePath: null,
        fileName: file.name,
        baseUrl: window.location.href,
        source: markdown,
        diskVersion: null,
        writable: false,
      });

      setNotice(file.name.toLowerCase().endsWith(".canvas") ? "空间白板已打开（浏览器环境为只读模式）。" : "Markdown 文件已打开（浏览器环境为只读模式）。");
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "无法读取文件。");
    }
  };

  const doOpenDesktopMarkdownPath = async (
    absolutePath: string,
    preloadedSource?: ChapterSource | null
  ) => {
    if (!window.bookMDDesktop) return;
    if (!/\.(md|markdown|canvas)$/i.test(absolutePath)) {
      setNotice("请选择 .md、.markdown 或 .canvas 文件。");
      return;
    }

    const requestId = openRequestRef.current + 1;
    openRequestRef.current = requestId;

    try {
      // 1. Immediately read and display the file (use preloadedSource if available for zero-latency instant render)
      const source = preloadedSource || (await window.bookMDDesktop.readMarkdownFile(absolutePath));
      if (openRequestRef.current !== requestId) return;

      const fileName = absolutePath.split(/[\\/]/).pop() ?? "Markdown.md";
      const baseName = fileName.replace(/\.(md|markdown|canvas)$/i, "") || "本地文档";
      const normPath = absolutePath.replace(/\\/g, "/").toLowerCase();
      const isSpaceFile = normPath.includes("/space/") || /^\d{4}-\d{2}-\d{2}_\d{4}\.md$/i.test(fileName);

      // Read the manifest as it is right now rather than from the render this
      // closure was created in: there are awaits above this point, so a captured
      // value can be stale by the time it is used. App.tsx kept a ref mirroring
      // the state for exactly that reason; going through the store gives the
      // same freshness without the mirror.
      const activeManifest = useVaultStore.getState().manifest;

      // Check if file belongs to currently active manifest
      const existingChap = activeManifest?.chapters.find(
        (c) => c.absolutePath && c.absolutePath.toLowerCase() === absolutePath.toLowerCase()
      );

      const targetChapterId = existingChap ? existingChap.id : `file:${encodeURIComponent(absolutePath.toLowerCase())}`;

      // Check if user already has an active workspace
      const hasActiveWorkspace = Boolean(
        activeManifest &&
        activeManifest.chapters.length > 0 &&
        (activeManifest.rootPath || activeManifest.chapters.length > 1) &&
        !activeManifest.rootPath?.toLowerCase().includes("space")
      );

      // Only set single file manifest if user had NO workspace and it is NOT a Space note
      if (!hasActiveWorkspace && !isSpaceFile) {
        const singleChapter: ChapterManifest = {
          id: targetChapterId,
          title: baseName,
          src: fileName,
          absolutePath,
          baseUrl: source.baseUrl,
        };

        const singleManifest: BookManifest = {
          id: `file:${absolutePath.toLowerCase()}`,
          title: baseName,
          description: "本地文档",
          rootPath: absolutePath.substring(0, Math.max(absolutePath.lastIndexOf("\\"), absolutePath.lastIndexOf("/"))),
          chapters: [singleChapter],
        };

        pendingBookmarkRef.current = null;
        setManifest(singleManifest);
        setBookmarks(loadBookmarks(singleManifest.id, singleManifest.chapters));
      } else if (!activeManifest && isSpaceFile) {
        const singleChapter: ChapterManifest = {
          id: targetChapterId,
          title: baseName,
          src: fileName,
          absolutePath,
          baseUrl: source.baseUrl,
        };
        const singleManifest: BookManifest = {
          id: `file:${absolutePath.toLowerCase()}`,
          title: baseName,
          description: "闪念笔记",
          chapters: [singleChapter],
        };
        setManifest(singleManifest);
      }

      setChapterId(targetChapterId);
      const isCanvas = fileName.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        setViewMode("canvas");
        setDirectoryOpen(false);
        setSidebarOpen(false);
      } else if (fileName.toLowerCase().endsWith(".mindmap.md")) {
        setViewMode("mindmap");
      }

      setTabs((prev) => {
        const matchIdx = prev.findIndex(
          (t) =>
            t.id === targetChapterId ||
            (t.absolutePath && t.absolutePath.toLowerCase() === absolutePath.toLowerCase())
        );
        if (matchIdx !== -1) {
          return prev.map((t, idx) =>
            idx === matchIdx
              ? { ...t, id: targetChapterId, title: baseName, relativePath: fileName, absolutePath }
              : t
          );
        }
        return [
          ...prev,
          {
            id: targetChapterId,
            title: baseName,
            relativePath: fileName,
            absolutePath,
          },
        ];
      });

      setSearchQuery("");
      if (isCanvas) {
        setDirectoryOpen(false);
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
        setSidebarTab("toc");
      }
      activeLoadedChapterIdRef.current = targetChapterId;

      openSession({
        chapterId: targetChapterId,
        absolutePath,
        fileName,
        baseUrl: source.baseUrl,
        source: source.markdown,
        diskVersion: source.diskVersion ?? null,
        writable: true,
        hasBom: source.hasBom,
        lineEnding: source.lineEnding,
      });

      setNotice(`已打开：${fileName}`);

      // 2. Only asynchronously index directory if opening a non-Space file and NO workspace was already active
      if (!hasActiveWorkspace && !isSpaceFile && window.bookMDDesktop.getDirectoryForFile) {
        window.bookMDDesktop
          .getDirectoryForFile(absolutePath)
          .then((dirResult) => {
            if (openRequestRef.current !== requestId) return;
            const activeChap = dirResult.directory.chapters.find(
              (c) => c.absolutePath && c.absolutePath.toLowerCase() === absolutePath.toLowerCase()
            );
            if (activeChap) {
              setManifest(dirResult.directory);
              setBookmarks(loadBookmarks(dirResult.directory.id, dirResult.directory.chapters));
              setChapterId(activeChap.id);
              activeLoadedChapterIdRef.current = activeChap.id;
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === targetChapterId ||
                  (t.absolutePath && t.absolutePath.toLowerCase() === absolutePath.toLowerCase())
                    ? {
                        ...t,
                        id: activeChap.id,
                        title: activeChap.title,
                        relativePath: activeChap.src,
                        absolutePath: activeChap.absolutePath,
                      }
                    : t
                )
              );
            }
          })
          .catch(() => {
            // Keep single file manifest if directory scanning fails
          });
      }
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "无法读取 Markdown 文件。");
    }
  };

  const doOpenMarkdownDirectory = async () => {
    if (!window.bookMDDesktop) {
      setNotice("目录打开功能仅在桌面版可用。");
      return;
    }

    openRequestRef.current += 1;
    try {
      const result = await window.bookMDDesktop.openDirectory();
      if (result.canceled) return;
      if (result.directory.chapters.length === 0) {
        setNotice("该目录中没有 .md 或 .markdown 文件。");
        return;
      }
      const saved = loadReadingPosition(result.directory.id, result.directory.chapters);
      const targetChapterId = saved?.chapterId ?? result.directory.chapters[0].id;
      const targetChapter = result.directory.chapters.find((c) => c.id === targetChapterId) ?? result.directory.chapters[0];

      setManifest(result.directory);
      setBookmarks(loadBookmarks(result.directory.id, result.directory.chapters));
      setChapterId(targetChapter.id);
      setTabs((prev) => {
        const exists = prev.some(
          (t) =>
            t.id === targetChapter.id ||
            (t.absolutePath &&
              targetChapter.absolutePath &&
              t.absolutePath.toLowerCase() === targetChapter.absolutePath.toLowerCase())
        );
        if (exists) return prev;
        return [
          ...prev,
          {
            id: targetChapter.id,
            title: targetChapter.title,
            relativePath: targetChapter.src,
            absolutePath: targetChapter.absolutePath,
          },
        ];
      });
      setSearchQuery("");
      const isCanvas = targetChapter.src.toLowerCase().endsWith(".canvas");
      if (isCanvas) {
        setViewMode("canvas");
        setDirectoryOpen(false);
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
        setSidebarTab("toc");
      }
      setNotice(`已打开目录：${result.directory.title}`);

      if (targetChapter.absolutePath) {
        activeLoadedChapterIdRef.current = targetChapter.id;
        const source = await window.bookMDDesktop.readMarkdownFile(targetChapter.absolutePath);
        openSession({
          chapterId: targetChapter.id,
          absolutePath: targetChapter.absolutePath,
          fileName: targetChapter.src.split("/").pop() ?? targetChapter.title,
          baseUrl: source.baseUrl,
          source: source.markdown,
          diskVersion: source.diskVersion ?? null,
          writable: true,
          hasBom: source.hasBom,
          lineEnding: source.lineEnding,
        });
      }
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "无法打开 Markdown 目录。");
    }
  };
  return { doOpenMarkdownFile, doOpenDesktopMarkdownPath, doOpenMarkdownDirectory };
}
