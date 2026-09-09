import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DiskVersion,
  DocumentSession,
  EditorViewMode,
  RenderedChapter,
} from "../core/types";
import { renderMarkdown } from "../services/markdown";

export type DocumentSessionState = {
  session: DocumentSession | null;
  renderedChapter: RenderedChapter | null;
  viewMode: EditorViewMode;
  isDirty: boolean;
  isPreviewPending: boolean;
  isSaving: boolean;
  isLargeDocument: boolean;
  autoPreviewPaused: boolean;
  conflict: { diskVersion: DiskVersion; message: string } | null;
};

export type OpenSessionParams = {
  chapterId: string;
  absolutePath: string | null;
  fileName: string;
  baseUrl: string;
  source: string;
  diskVersion: DiskVersion | null;
  writable: boolean;
  hasBom?: boolean;
  lineEnding?: string;
};

const LARGE_DOC_THRESHOLD = 2_000_000; // 2MB
const PREVIEW_DEBOUNCE_MS = 350;

export function useDocumentSession() {
  const [session, setSession] = useState<DocumentSession | null>(null);
  const [renderedChapter, setRenderedChapter] = useState<RenderedChapter | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>("read");
  const [isPreviewPending, setIsPreviewPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [conflict, setConflict] = useState<{ diskVersion: DiskVersion; message: string } | null>(null);
  const [autoPreviewPaused, setAutoPreviewPaused] = useState(false);

  const previewTimerRef = useRef<number | null>(null);
  const currentRenderRevisionRef = useRef(0);
  const renderedCacheRef = useRef(new Map<string, RenderedChapter>());
  const viewModeRef = useRef<EditorViewMode>("read");
  viewModeRef.current = viewMode;
  const sessionRef = useRef<DocumentSession | null>(null);
  sessionRef.current = session;
  const pendingRenderRef = useRef(false);

  const isDirty = Boolean(session && session.sourceRevision !== session.savedRevision);
  const isLargeDocument = Boolean(session && session.source.length > LARGE_DOC_THRESHOLD);

  // Sync state with Electron main process
  useEffect(() => {
    if (window.bookMDDesktop?.setDocumentState) {
      window.bookMDDesktop.setDocumentState({
        activePath: session?.absolutePath ?? null,
        isDirty,
      });
    }
  }, [session?.absolutePath, isDirty]);

  // Execute rendering with revision tracking
  const triggerRender = useCallback(async (sourceText: string, baseUrl: string, revision: number, cacheKey?: string) => {
    currentRenderRevisionRef.current = revision;
    setIsPreviewPending(true);

    if (cacheKey && renderedCacheRef.current.has(cacheKey)) {
      const cached = renderedCacheRef.current.get(cacheKey)!;
      if (currentRenderRevisionRef.current === revision) {
        setRenderedChapter(cached);
        setIsPreviewPending(false);
      }
      return cached;
    }

    try {
      const rendered = await renderMarkdown(sourceText, baseUrl);
      if (currentRenderRevisionRef.current === revision) {
        setRenderedChapter(rendered);
        if (cacheKey && sourceText.length <= LARGE_DOC_THRESHOLD) {
          renderedCacheRef.current.set(cacheKey, rendered);
          while (renderedCacheRef.current.size > 12) {
            renderedCacheRef.current.delete(renderedCacheRef.current.keys().next().value!);
          }
        }
      }
      return rendered;
    } catch {
      // Keep previous rendered chapter on error
    } finally {
      if (currentRenderRevisionRef.current === revision) {
        setIsPreviewPending(false);
      }
    }
  }, []);

  const openSession = useCallback(
    (params: OpenSessionParams) => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }

      const initialSession: DocumentSession = {
        chapterId: params.chapterId,
        absolutePath: params.absolutePath,
        fileName: params.fileName,
        baseUrl: params.baseUrl,
        source: params.source,
        savedSource: params.source,
        diskVersion: params.diskVersion,
        sourceRevision: 1,
        savedRevision: 1,
        writable: params.writable,
        hasBom: params.hasBom,
        lineEnding: params.lineEnding,
      };

      setSession(initialSession);
      setConflict(null);
      const isLarge = params.source.length > LARGE_DOC_THRESHOLD;
      setAutoPreviewPaused(isLarge);

      const cacheKey = params.diskVersion
        ? `file:${params.absolutePath}:${params.diskVersion.size}:${params.diskVersion.mtimeMs}`
        : `source:${params.chapterId}:${params.source.length}`;

      triggerRender(params.source, params.baseUrl, 1, cacheKey);
    },
    [triggerRender]
  );

  const updateSource = useCallback(
    (newSource: string) => {
      setSession((prev) => {
        if (!prev) return null;
        if (prev.source === newSource) return prev;

        const nextRevision = prev.sourceRevision + 1;
        const nextSession: DocumentSession = {
          ...prev,
          source: newSource,
          sourceRevision: nextRevision,
        };

        if (previewTimerRef.current) {
          window.clearTimeout(previewTimerRef.current);
          previewTimerRef.current = null;
        }

        const isLarge = newSource.length > LARGE_DOC_THRESHOLD;
        if (isLarge) {
          setAutoPreviewPaused(true);
        } else if (viewModeRef.current === "source") {
          // In pure source edit mode, preview is hidden; skip rendering on keystrokes to save CPU
          pendingRenderRef.current = true;
        } else {
          setAutoPreviewPaused(false);
          previewTimerRef.current = window.setTimeout(() => {
            triggerRender(nextSession.source, nextSession.baseUrl, nextRevision);
          }, PREVIEW_DEBOUNCE_MS);
        }

        sessionRef.current = nextSession;
        return nextSession;
      });
    },
    [triggerRender]
  );

  const handleSetViewMode = useCallback(
    (modeOrUpdater: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => {
      setViewMode((prev) => {
        const nextMode = typeof modeOrUpdater === "function" ? modeOrUpdater(prev) : modeOrUpdater;
        viewModeRef.current = nextMode;
        if (nextMode !== "source" && pendingRenderRef.current && sessionRef.current) {
          pendingRenderRef.current = false;
          triggerRender(
            sessionRef.current.source,
            sessionRef.current.baseUrl,
            sessionRef.current.sourceRevision
          );
        }
        return nextMode;
      });
    },
    [triggerRender]
  );

  const renderPreviewNow = useCallback(() => {
    if (!session) return;
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    pendingRenderRef.current = false;
    triggerRender(session.source, session.baseUrl, session.sourceRevision);
  }, [session, triggerRender]);

  const saveSession = useCallback(
    async (options: { force?: boolean; content?: string } = {}) => {
      const currentSession = sessionRef.current ?? session;
      if (!currentSession || !currentSession.absolutePath || !currentSession.writable) {
        return { success: false, message: "文档不可写或未关联磁盘文件。" };
      }

      if (!window.bookMDDesktop?.saveMarkdownFile) {
        return { success: false, message: "当前环境不支持保存。" };
      }

      setIsSaving(true);
      try {
        const contentToSave = options.content !== undefined ? options.content : currentSession.source;
        const result = await window.bookMDDesktop.saveMarkdownFile({
          absolutePath: currentSession.absolutePath,
          content: contentToSave,
          expectedVersion: currentSession.diskVersion,
          force: options.force ?? false,
          hasBom: currentSession.hasBom,
          lineEnding: currentSession.lineEnding,
        });

        if (result.success) {
          setSession((prev) => {
            if (!prev) return null;
            const updated: DocumentSession = {
              ...prev,
              source: contentToSave,
              savedSource: contentToSave,
              savedRevision: prev.sourceRevision,
              diskVersion: result.diskVersion,
            };
            sessionRef.current = updated;
            return updated;
          });
          setConflict(null);
          // Invalidate and update cache with new disk version key
          if (renderedChapter) {
            renderedCacheRef.current.set(result.cacheKey, renderedChapter);
          }
          return { success: true };
        } else {
          if (result.errorCode === "FILE_CONFLICT" && result.diskVersion) {
            setConflict({
              diskVersion: result.diskVersion,
              message: result.message,
            });
          }
          return { success: false, message: result.message, errorCode: result.errorCode };
        }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) };
      } finally {
        setIsSaving(false);
      }
    },
    [session, renderedChapter]
  );

  const saveSessionAs = useCallback(async () => {
    if (!session || !window.bookMDDesktop?.saveMarkdownFileAs) {
      return { success: false, message: "当前环境不支持另存为。" };
    }

    setIsSaving(true);
    try {
      const result = await window.bookMDDesktop.saveMarkdownFileAs({
        currentPath: session.absolutePath ?? undefined,
        content: session.source,
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }
      if (!result.success) {
        return { success: false, canceled: false, message: result.message };
      }

      const fileName = result.absolutePath.split(/[\\/]/).pop() ?? session.fileName;
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          absolutePath: result.absolutePath,
          fileName,
          baseUrl: result.baseUrl,
          savedSource: prev.source,
          savedRevision: prev.sourceRevision,
          diskVersion: result.diskVersion,
        };
      });
      setConflict(null);
      return { success: true, absolutePath: result.absolutePath, fileName };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    } finally {
      setIsSaving(false);
    }
  }, [session]);

  const reloadFromDisk = useCallback(async () => {
    if (!session?.absolutePath || !window.bookMDDesktop?.readMarkdownFile) return;
    try {
      const source = await window.bookMDDesktop.readMarkdownFile(session.absolutePath);
      openSession({
        chapterId: session.chapterId,
        absolutePath: session.absolutePath,
        fileName: session.fileName,
        baseUrl: source.baseUrl,
        source: source.markdown,
        diskVersion: source.diskVersion ?? null,
        writable: true,
        hasBom: source.hasBom,
        lineEnding: source.lineEnding,
      });
      setConflict(null);
    } catch (err) {
      console.error("重新载入磁盘文件失败:", err);
    }
  }, [session, openSession]);

  const discardChanges = useCallback(() => {
    if (!session) return;
    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        source: prev.savedSource,
        sourceRevision: prev.savedRevision,
      };
    });
    setConflict(null);
    triggerRender(session.savedSource, session.baseUrl, session.savedRevision);
  }, [session, triggerRender]);

  const clearConflict = useCallback(() => {
    setConflict(null);
  }, []);

  return {
    session,
    renderedChapter,
    viewMode,
    isDirty,
    isPreviewPending,
    isSaving,
    isLargeDocument,
    autoPreviewPaused,
    conflict,
    openSession,
    updateSource,
    renderPreviewNow,
    setViewMode: handleSetViewMode,
    saveSession,
    saveSessionAs,
    reloadFromDisk,
    discardChanges,
    clearConflict,
  };
}
