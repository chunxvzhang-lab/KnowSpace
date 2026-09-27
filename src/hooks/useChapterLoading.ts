import { useEffect } from "react";
import type { DocumentSession, EditorViewMode, RenderedChapter } from "../core/types";
import { loadPackagedChapterMarkdown } from "../services/bookSource";
import { renderMarkdown } from "../services/markdown";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";
import { samePath } from "../core/paths";
import type { OpenSessionParams } from "./useDocumentSession";

type UseChapterLoadingParams = {
  session: DocumentSession | null;
  /** The session hook's view mode — the canvas-close rule reads it directly. */
  viewMode: EditorViewMode;
  openSession: (params: OpenSessionParams) => void;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  activeLoadedChapterIdRef: { current: string };
  /** The comparison pane's rendered content — owned by the shell, filled here. */
  setSecondaryRenderedChapter: (rendered: RenderedChapter | null) => void;
};

/**
 * Turning "the active tab is chapter X" into "the session holds chapter X".
 *
 * Three syncs that all answer the same question — the chapter loader (with its
 * already-loaded short-circuits and its file-type view routing), the rule that
 * a canvas file closes both side panels, and the dual-split pane's independent
 * load. They were three effects scattered through App; they are one concern:
 * what is on disk becoming what is in the editor.
 */
export function useChapterLoading({
  session,
  viewMode,
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
  setSecondaryRenderedChapter,
}: UseChapterLoadingParams) {
  const chapterId = useTabStore((s) => s.activeTabId);
  const dualSplitTabId = useTabStore((s) => s.dualSplitTabId);
  const tabs = useTabStore((s) => s.tabs);
  const manifest = useVaultStore((s) => s.manifest);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setNotice = useUiStore((s) => s.setNotice);

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

    if (samePath(session?.absolutePath, targetAbsPath)) {
      activeLoadedChapterIdRef.current = chapterId;
      return;
    }

    activeLoadedChapterIdRef.current = chapterId;

    const loadPromise =
      targetAbsPath && window.bookMDDesktop
        ? window.bookMDDesktop.files.readMarkdownFile(targetAbsPath)
        : manifest
          ? loadPackagedChapterMarkdown(manifest, chapterId)
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
  }, [
    chapterId,
    manifest,
    tabs,
    openSession,
    session?.chapterId,
    session?.absolutePath,
    setViewMode,
    setDirectoryOpen,
    setSidebarOpen,
    setNotice,
    activeLoadedChapterIdRef,
  ]);

  // Close directory and outline whenever a canvas file/mode is active
  useEffect(() => {
    if (viewMode === "canvas" || session?.fileName?.toLowerCase().endsWith(".canvas")) {
      setDirectoryOpen(false);
      setSidebarOpen(false);
    }
  }, [viewMode, session?.fileName, setDirectoryOpen, setSidebarOpen]);

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
        ? window.bookMDDesktop.files.readMarkdownFile(targetAbsPath)
        : manifest
          ? loadPackagedChapterMarkdown(manifest, dualSplitTabId)
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
  }, [dualSplitTabId, manifest, tabs, setSecondaryRenderedChapter, setNotice]);
}
