import { useCallback, useEffect, useMemo } from "react";

import { convertUnlinkedMentionInText, getLinkedReferences, getUnlinkedMentions, updateDocumentInIndex, type UnlinkedMention } from "../services/backlinkIndex";
import { buildGraphDataFromIndex } from "../services/graphService";
import { updateVaultSearchIndexForDocument } from "../services/searchIndexService";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { ChapterManifest, ChapterSource } from "../core/types";
import type { EditorView } from "@codemirror/view";
import type { DocumentSessionState, useDocumentSession } from "./useDocumentSession";

/**
 * The backlink index, the graph derived from it, and the two actions that act
 * on it — jumping to a referring document, and turning a mention into a link.
 *
 * Fifth logic hook out of App.tsx (R1 batch B3b-5). It holds the whole
 * lifecycle: the index is built document by document on idle callbacks so the
 * editor stays responsive on a large vault, kept up to date as documents are
 * saved, and read back as references for the panel and as nodes for the graph.
 *
 * Three things travel in. `session` and `activeChapter` say which document the
 * index should be updated with. `selectChapter` lets a backlink navigate
 * through App's unsaved-changes guard rather than around it. `editorViewRef` is
 * where a converted mention is written when the editor is showing.
 *
 * The index itself is not returned: three call sites further down App.tsx read
 * it straight from the store, and duplicating it here would give the same value
 * two owners.
 */

type UseBacklinkIndexParams = {
  session: DocumentSessionState["session"];
  activeChapter?: ChapterManifest;
  selectChapter: (chapterId: string) => void;
  editorViewRef: { current: EditorView | null };
  /**
   * Mirrors the session, because the index work is scheduled on idle callbacks
   * and a value captured when the callback was queued can be out of date by the
   * time it runs.
   */
  sessionRef: { current: DocumentSessionState["session"] };
  /**
   * Opens a document that is not loaded yet — how converting a mention into a
   * link to a document outside the current one gets there.
   */
  openDesktopMarkdownPathRef: {
    current: (absolutePath: string, preloadedSource?: ChapterSource | null) => void;
  };
  /** Writes a converted mention back into the open document. */
  updateSource: ReturnType<typeof useDocumentSession>["updateSource"];
};

export function useBacklinkIndex({
  session,
  activeChapter,
  selectChapter,
  editorViewRef,
  sessionRef,
  openDesktopMarkdownPathRef,
  updateSource,
}: UseBacklinkIndexParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const backlinkIndex = useVaultStore((s) => s.backlinkIndex);
  const setBacklinkIndex = useVaultStore((s) => s.setBacklinkIndex);
  const setVaultSearchIndex = useVaultStore((s) => s.setVaultSearchIndex);
  const setNotice = useUiStore((s) => s.setNotice);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const chapterId = useTabStore((s) => s.activeTabId);

  /**
   * Which documents the vault holds, as a string that only changes when that
   * set changes.
   *
   * The effect below used to depend on `manifest.chapters`, and the flash-note
   * save path calls `setManifest` — so saving one note produced a new array, a
   * new identity, and a full background re-index of the whole vault queued
   * behind it. The chapter ids are what the index actually keys off, and a save
   * does not change them; a document added or removed does, and that is what
   * this notices.
   */
  const chaptersSignature = useMemo(
    () => manifest?.chapters.map((chapter) => chapter.id).join("|") ?? "",
    [manifest]
  );

  useEffect(() => {
    if (!manifest?.chapters?.length) return;
    let active = true;
    let debounceTimer: number | null = null;

    // 1. Instantly seed active document into index if available (0ms execution time, zero I/O)
    const currentSession = sessionRef.current;
    if (currentSession && currentSession.source) {
      updateDocumentInIndex(
        backlinkIndex,
        currentSession.chapterId,
        activeChapter?.title || currentSession.fileName,
        currentSession.source,
        currentSession.absolutePath || currentSession.fileName
      );
      setBacklinkIndex({ ...backlinkIndex });
      setVaultSearchIndex((prev) =>
        updateVaultSearchIndexForDocument(
          prev,
          currentSession.chapterId,
          activeChapter?.title || currentSession.fileName,
          currentSession.source,
          currentSession.absolutePath || currentSession.fileName
        )
      );
    }

    const chapters = manifest.chapters;
    const activeChapId = currentSession?.chapterId;

    // 2. Schedule background batch processing after an initial idle pause (600ms)
    // This gives ample time for the initial document to render and paint without CPU competition.
    const startIdleIndexing = () => {
      const runChunks = async () => {
        const pendingChapters = chapters.filter((ch) => ch.id !== activeChapId);
        const CHUNK_SIZE = 8;

        for (let i = 0; i < pendingChapters.length; i += CHUNK_SIZE) {
          if (!active) return;
          const chunk = pendingChapters.slice(i, i + CHUNK_SIZE);

          // Fast path: use batch read IPC if available
          const validAbsPaths = chunk
            .map((c) => c.absolutePath)
            .filter((p): p is string => Boolean(p && !p.toLowerCase().endsWith(".canvas")));

          const chunkResults = new Map<string, string>();
          if (window.bookMDDesktop?.readMarkdownBatch && validAbsPaths.length > 0) {
            try {
              const batchData = await window.bookMDDesktop.readMarkdownBatch(validAbsPaths);
              if (!active) return;
              for (const item of batchData) {
                if (item.absolutePath) {
                  chunkResults.set(item.absolutePath.toLowerCase(), item.markdown || "");
                }
              }
            } catch {}
          }

          // Fallback or fill for individual items
          const indexUpdates: { id: string; title: string; content: string; src: string }[] = [];
          for (const ch of chunk) {
            if (!active) return;
            let content = "";
            if (ch.absolutePath && chunkResults.has(ch.absolutePath.toLowerCase())) {
              content = chunkResults.get(ch.absolutePath.toLowerCase()) || "";
            } else if (ch.absolutePath && window.bookMDDesktop?.readMarkdownFile) {
              try {
                const res = await window.bookMDDesktop.readMarkdownFile(ch.absolutePath);
                content = res?.markdown || "";
              } catch {}
            }

            if (!active) return;
            // Mutated in place; the store is told once, below.
            updateDocumentInIndex(backlinkIndex, ch.id, ch.title, content, ch.src);
            indexUpdates.push({ id: ch.id, title: ch.title, content, src: ch.src });
          }

          if (!active) return;
          // One store write for the chunk rather than one per document.
          //
          // Every `setVaultSearchIndex` notifies each subscriber of the search
          // index, and the chunk is eight documents — so this was eight rounds of
          // subscriber work per chunk, for a result only the last of them needed.
          // Folding them into a single updater keeps the intermediate indexes
          // off the store entirely.
          if (indexUpdates.length > 0) {
            setVaultSearchIndex((prev) => {
              let next = prev;
              for (const update of indexUpdates) {
                next = updateVaultSearchIndexForDocument(
                  next,
                  update.id,
                  update.title,
                  update.content,
                  update.src
                );
              }
              return next;
            });
          }
          setBacklinkIndex({ ...backlinkIndex });

          // Cooperative yield: let browser event loop handle render frames, user input, mouse, etc.
          await new Promise<void>((resolve) => {
            if (typeof window.requestIdleCallback === "function") {
              window.requestIdleCallback(() => setTimeout(resolve, 20), { timeout: 120 });
            } else {
              setTimeout(resolve, 25);
            }
          });
        }
      };

      runChunks().catch(() => {});
    };

    debounceTimer = window.setTimeout(() => {
      if (!active) return;
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => {
          if (active) startIdleIndexing();
        }, { timeout: 1000 });
      } else {
        startIdleIndexing();
      }
    }, 600);

    return () => {
      active = false;
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
    };
  }, [chaptersSignature]);

  // Real-time incremental update when current session content changes (debounced by 400ms to keep typing silky smooth)
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      updateDocumentInIndex(
        backlinkIndex,
        session.chapterId,
        activeChapter?.title || session.fileName,
        session.source,
        session.absolutePath || session.fileName
      );
      setBacklinkIndex({ ...backlinkIndex });
      setVaultSearchIndex((prev) =>
        updateVaultSearchIndexForDocument(
          prev,
          session.chapterId,
          activeChapter?.title || session.fileName,
          session.source,
          session.absolutePath || session.fileName
        )
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [session?.source, session?.chapterId, activeChapter?.title, session?.fileName, session?.absolutePath]);

  const currentDocTitle = activeChapter?.title || session?.fileName?.replace(/\.md$/i, "") || "";
  const currentLinkedReferences = useMemo(() => {
    if (!currentDocTitle) return [];
    return getLinkedReferences(backlinkIndex, currentDocTitle, session?.fileName);
  }, [backlinkIndex, currentDocTitle, session?.fileName]);

  const isBacklinksVisible = sidebarOpen && sidebarTab === "backlinks";
  const currentUnlinkedMentions = useMemo(() => {
    if (!isBacklinksVisible || !currentDocTitle || !session?.chapterId) return [];
    return getUnlinkedMentions(backlinkIndex, session.chapterId, currentDocTitle);
  }, [isBacklinksVisible, backlinkIndex, currentDocTitle, session?.chapterId]);

  const isGraphVisible = isGraphPaneOpen || isBacklinksVisible;
  const currentActiveId = chapterId || session?.chapterId || session?.absolutePath || session?.fileName;
  const graphData = useMemo(() => {
    if (!isGraphVisible) {
      return { nodes: [], edges: [] };
    }
    return buildGraphDataFromIndex(manifest, backlinkIndex, currentActiveId);
  }, [isGraphVisible, manifest, backlinkIndex, currentActiveId]);

  const handleJumpToBacklink = useCallback(
    (sourceId: string, line?: number) => {
      const chap = manifest?.chapters.find((c) => c.id === sourceId);
      if (chap) {
        selectChapter(sourceId);
      } else {
        const doc = backlinkIndex.documents.get(sourceId);
        const targetPath = doc?.path || (sourceId.endsWith(".md") ? sourceId : undefined);
        if (targetPath && openDesktopMarkdownPathRef.current) {
          openDesktopMarkdownPathRef.current(targetPath);
        } else {
          selectChapter(sourceId);
        }
      }
      if (line && editorViewRef.current) {
        window.setTimeout(() => {
          const view = editorViewRef.current;
          if (view) {
            try {
              const lineObj = view.state.doc.line(Math.min(line, view.state.doc.lines));
              view.dispatch({
                selection: { anchor: lineObj.from },
                scrollIntoView: true,
              });
            } catch {}
          }
        }, 120);
      }
    },
    [manifest?.chapters, backlinkIndex, selectChapter]
  );

  const handleConvertMention = useCallback(
    async (mention: UnlinkedMention) => {
      if (session && session.chapterId === mention.sourceId) {
        const updated = convertUnlinkedMentionInText(session.source, mention.line, mention.mentionText);
        updateSource(updated);
        setNotice(`已将第 ${mention.line} 行的「${mention.mentionText}」转换为双向链接`);
        return;
      }

      const targetCh = manifest?.chapters.find((c) => c.id === mention.sourceId);
      if (targetCh?.absolutePath && window.bookMDDesktop?.saveMarkdownFile && window.bookMDDesktop?.readMarkdownFile) {
        try {
          const fileRes = await window.bookMDDesktop.readMarkdownFile(targetCh.absolutePath);
          if (fileRes?.markdown) {
            const updated = convertUnlinkedMentionInText(fileRes.markdown, mention.line, mention.mentionText);
            await window.bookMDDesktop.saveMarkdownFile({
              absolutePath: targetCh.absolutePath,
              content: updated,
            });
            updateDocumentInIndex(backlinkIndex, mention.sourceId, mention.sourceTitle, updated, targetCh.src);
            setBacklinkIndex({ ...backlinkIndex });
            setNotice(`已将文档「${mention.sourceTitle}」中的「${mention.mentionText}」转换为双向链接`);
          }
        } catch (err: any) {
          setNotice(err?.message || "转换双链失败");
        }
      }
    },
    [session, manifest?.chapters, updateSource, backlinkIndex]
  );
  return {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  };
}
