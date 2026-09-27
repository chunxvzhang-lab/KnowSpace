import { useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import type { ChapterManifest, DocumentSession, EditorViewMode } from "../core/types";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";

type UseAppActionsParams = {
  session: DocumentSession | null;
  setViewMode: (mode: EditorViewMode | ((prev: EditorViewMode) => EditorViewMode)) => void;
  updateSource: (source: string) => void;
  renderPreviewNow: () => void;
  saveSession: (options?: {
    force?: boolean;
    content?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  activeChapter: ChapterManifest | undefined;
  editorViewRef: { current: EditorView | null };
};

/**
 * The document-level actions App orchestrates for the workspace and the
 * overlays (eighth logic hook out of App.tsx, final trim): printing, extracting
 * a selection to a note, sending one to the flash capsule, toggling the mind
 * map, revealing the document in the TOC, merging a flash note into the
 * editor, collapsing the shell around the review, and reverting to a history
 * snapshot.
 *
 * These are bound as props on WorkspaceRouter / SidebarPanel / AppOverlays and
 * the print command rather than living in the command-binding hook, because
 * they are single-caller actions of the editing session — what they need
 * (session, updateSource, the editor view) is exactly what App owns. Store
 * values are read from the stores here rather than threaded through.
 */
export function useAppActions({
  session,
  setViewMode,
  updateSource,
  renderPreviewNow,
  saveSession,
  activeChapter,
  editorViewRef,
}: UseAppActionsParams) {
  const setNotice = useUiStore((s) => s.setNotice);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setReviewFocus = useUiStore((s) => s.setReviewFocus);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);

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

  const handlePrintDocument = useCallback(async () => {
    if (renderPreviewNow) {
      try {
        await renderPreviewNow();
      } catch {
        // ignore
      }
    }
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    const title = activeChapter?.title || session?.fileName || "KnowSpace_文档";
    if (desktop?.system.printToPdf) {
      try {
        await desktop.system.printToPdf({ title });
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
      const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
      const cleanTitle = suggestedTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "未命名笔记";

      if (desktop?.files.createMarkdownFile && session.absolutePath) {
        const parentDir = session.absolutePath.replace(/[\\/][^\\/]+$/, "");
        try {
          const res = await desktop.files.createMarkdownFile({
            rootPath: parentDir,
            defaultName: cleanTitle,
            initialContent: `# ${cleanTitle}\n\n${selectedText}\n`,
          });
          if (res.canceled || !res.success) {
            return;
          }
          if (manifest?.rootPath && desktop.files.refreshDirectory) {
            const next = await desktop.files.refreshDirectory(manifest.rootPath);
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
    [manifest?.rootPath, session, setManifest, editorViewRef],
  );

  const handleSendSelectionToFlash = useCallback(async (text: string) => {
    const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;
    if (desktop?.capture.saveFlashNote && text.trim()) {
      try {
        await desktop.capture.saveFlashNote({
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
  }, [setViewMode]);

  const handleRevealInToc = useCallback(() => {
    setSidebarTab("toc");
    setSidebarOpen(true);
  }, [setSidebarTab, setSidebarOpen]);

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
    [session, updateSource, editorViewRef],
  );

  const handleRevertToContent = useCallback(
    async (revertedContent: string) => {
      updateSource(revertedContent);
      await saveSession({ force: true });
      setNotice("已成功从历史快照安全还原当前文档。");
      return true;
    },
    [updateSource, saveSession, setNotice],
  );

  return {
    handleReviewActiveChange,
    handlePrintDocument,
    handleExtractSelectionToNote,
    handleSendSelectionToFlash,
    handleToggleMindmap,
    handleRevealInToc,
    handleMergeFlashNote,
    handleRevertToContent,
  };
}
