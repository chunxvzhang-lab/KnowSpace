import { createDefaultCanvas } from "../services/canvasService";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { useDocumentSession } from "./useDocumentSession";

/**
 * Creating a new document — a Markdown file, a mind map or a space canvas.
 *
 * Second logic hook out of App.tsx (R1 batch B3b-2). The three flows are the
 * same shape: ask the desktop bridge to create the file, refresh the manifest
 * (or append to it when there is no folder to refresh), point the tab list and
 * the side panel at the new document, hand the source to the editing session,
 * and say so.
 *
 * Two things are passed in rather than reached for. The session owns opening a
 * document, so this hook asks it to rather than duplicating that logic. And
 * `activeLoadedChapterIdRef` marks which chapter the session is holding; the
 * effect in App.tsx that re-fetches a chapter reads and writes it too, so it
 * stays where both can see it.
 *
 * The three thin wrappers that trigger these flows stay in App.tsx: they route
 * through the unsaved-changes guard, which is App's.
 */

type UseDocumentCreationParams = {
  /** The session owns opening documents; this hook only asks it to. */
  openSession: ReturnType<typeof useDocumentSession>["openSession"];
  setViewMode: ReturnType<typeof useDocumentSession>["setViewMode"];
  /**
   * Which chapter the session currently holds.
   *
   * Declared structurally rather than as a React ref type so the signature does
   * not depend on whether the project is on the React 18 or 19 ref typings.
   */
  activeLoadedChapterIdRef: { current: string };
};

export function useDocumentCreation({
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
}: UseDocumentCreationParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const setNotice = useUiStore((s) => s.setNotice);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);

  const doCreateNewFile = async () => {
    if (!window.bookMDDesktop) {
      setNotice("新建文件功能仅在桌面版可用。");
      return;
    }

    try {
      const rootPath = manifest?.rootPath;
      const result = await window.bookMDDesktop.createMarkdownFile({ rootPath });
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

      const activeChap = nextManifest.chapters.find(
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
      setSidebarOpen(true);
      setSidebarTab("toc");
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

      setNotice(`已新建文件：${activeChap.title}`);
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "新建文件失败。");
    }
  };

  const doCreateNewMindmap = async () => {
    if (!window.bookMDDesktop) {
      setNotice("新建思维导图功能仅在桌面版可用。");
      return;
    }

    try {
      const rootPath = manifest?.rootPath;
      const initialContent = `# 中心主题\n\n- 主要分支 1\n  - 子主题 1.1\n  - 子主题 1.2\n- 主要分支 2\n  - 子主题 2.1\n- 主要分支 3\n`;
      const result = await window.bookMDDesktop.createMarkdownFile({
        rootPath,
        defaultName: "新建思维导图.mindmap.md",
        initialContent,
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
      setSidebarOpen(true);
      setSidebarTab("toc");
      setViewMode("mindmap");
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
      setNotice(`已新建思维导图：${activeChap.title}（按 Tab 添加子主题，Enter 添加同级主题）`);
    } catch (err: any) {
      setNotice(`新建思维导图失败：${err.message || String(err)}`);
    }
  };

  const doCreateNewCanvas = async () => {
    if (!window.bookMDDesktop) {
      setNotice("新建空间白板功能仅在桌面版可用。");
      return;
    }

    try {
      const rootPath = manifest?.rootPath;
      const initialContent = JSON.stringify(createDefaultCanvas(), null, 2);
      const result = await window.bookMDDesktop.createMarkdownFile({
        rootPath,
        defaultName: "新建空间白板.canvas",
        initialContent,
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
      setDirectoryOpen(false);
      setSidebarOpen(false);
      setViewMode("canvas");
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
      setNotice(`已新建空间白板：${activeChap.title}（双击画布添加卡片，拖拽节点圆点连线）`);
    } catch (err: any) {
      setNotice(`新建空间白板失败：${err.message || String(err)}`);
    }
  };
  return { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas };
}
