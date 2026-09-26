import { useCallback } from "react";
import {
  annotationsForDocument,
  bytesFromBase64,
  planOutlineImport,
} from "../services/mindmapImport";
import {
  applyImportedAnnotations,
  emptySidecar,
  saveSidecar,
  sidecarIsEmpty,
} from "../services/mindmapSidecar";
import { useUiStore } from "../store/useUiStore";
import { useTabStore, tabsWithNewDocument } from "../store/useTabStore";
import { chapterForFile, listingWithNewChapter, useVaultStore } from "../store/useVaultStore";
import type { OpenSessionParams } from "./useDocumentSession";

type UseDocumentAuthoringParams = {
  openSession: (params: OpenSessionParams) => void;
  /** The hook only ever leaves the special views, so only "split" is sent. */
  setViewMode: (mode: "split") => void;
  activeLoadedChapterIdRef: { current: string };
};

/**
 * Features that PRODUCE a document rather than edit one: a canvas extraction
 * becoming a note, an outline import becoming a Markdown tree, and the shared
 * sequence underneath both — the file on disk, the listing refreshed so it
 * appears there, and a session opened on it.
 *
 * A copy of that sequence per feature is a copy that has to keep agreeing with
 * the manifest's shape, so both features call the one implementation.
 */
export function useDocumentAuthoring({
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
}: UseDocumentAuthoringParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const setNotice = useUiStore((s) => s.setNotice);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);

  const createDocumentFromContent = useCallback(
    async (options: {
      content: string;
      defaultName: string;
      /** What to say when it worked. `{title}` is the document's own title. */
      notice: string;
      /** What to say when it did not, in the same shape. */
      failureNotice: string;
    }): Promise<{
      absolutePath: string;
      markdown: string;
      chapterId: string;
      title: string;
    } | null> => {
      const desktop = window.bookMDDesktop;
      if (!desktop) return null;

      try {
        const rootPath = manifest?.rootPath;
        const result = await desktop.createMarkdownFile({
          rootPath,
          defaultName: options.defaultName,
          initialContent: options.content,
        });
        if (result.canceled || !result.success) {
          if (!result.canceled && result.message) setNotice(result.message);
          return null;
        }

        // Re-read the folder when there is one — the disk is the authority on what is
        // in it — and otherwise assemble the listing around the new file. Both rules
        // live with the listing, not here: see listingWithNewChapter.
        const nextManifest =
          rootPath && desktop.refreshDirectory
            ? await desktop.refreshDirectory(rootPath)
            : listingWithNewChapter(manifest, result.chapter, result.absolutePath);

        // The listing is the authority on what the file became when it knows the
        // path; the write's own answer is when it does not.
        const activeChap = chapterForFile(nextManifest, result.absolutePath) ?? result.chapter;

        setManifest(nextManifest);
        setChapterId(activeChap.id);
        // Opening the document the reader already has in front of them does not grow
        // a second tab for it — see tabsWithNewDocument, which is also where the file
        // that a command palette jump opens goes through.
        setTabs((prev) => tabsWithNewDocument(prev, activeChap, result.absolutePath));
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
        setNotice(options.notice.split("{title}").join(activeChap.title));
        return {
          absolutePath: result.absolutePath,
          markdown: result.source.markdown,
          chapterId: activeChap.id,
          title: activeChap.title,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setNotice(options.failureNotice.split("{message}").join(message));
        return null;
      }
    },
    [
      manifest,
      openSession,
      setChapterId,
      setManifest,
      setNotice,
      setTabs,
      setViewMode,
      activeLoadedChapterIdRef,
    ],
  );

  const handleCreateCanvasExtractNote = useCallback(
    async (extractedMarkdown: string, defaultDocTitle?: string) => {
      if (!window.bookMDDesktop) {
        navigator.clipboard?.writeText(extractedMarkdown);
        setNotice("专著内容已复制到剪贴板。");
        return;
      }

      await createDocumentFromContent({
        content: extractedMarkdown,
        defaultName: defaultDocTitle ? `${defaultDocTitle}.md` : "白板萃取专著.md",
        notice: "已生成并打开萃取专著：{title}",
        failureNotice: "生成萃取专著失败：{message}",
      });
    },
    [createDocumentFromContent, setNotice],
  );

  /**
   * Imports an outline another app wrote, as a new document.
   *
   * As a new document rather than into the one on screen, and that is the decision
   * this feature rests on: a document is a file, and merging two outlines into one
   * would leave every later question about it — which structure is the real one,
   * which parts came from where — without an answer.
   */
  const handleImportOutline = useCallback(async () => {
    const desktop = window.bookMDDesktop;
    if (!desktop?.pickOutlineFile) {
      setNotice("导入大纲需要桌面版。");
      return;
    }

    const picked = await desktop.pickOutlineFile();
    if (picked.canceled) return;
    if (!picked.success || typeof picked.contentBase64 !== "string") {
      setNotice(picked.message || "无法读取这个文件。");
      return;
    }

    // What the bytes mean is decided in one place with no screen around it — see
    // planOutlineImport, which is where an import's three judgements live. What is
    // left here is what only this component can do: ask for a file, report a
    // sentence, and open what was created.
    const plan = planOutlineImport(bytesFromBase64(picked.contentBase64), picked.fileName ?? "");
    if (plan.kind === "refuse") {
      setNotice(plan.message);
      return;
    }

    const created = await createDocumentFromContent({
      content: plan.markdown,
      defaultName: plan.defaultName,
      notice: "已导入为新文档：{title}",
      failureNotice: "导入大纲失败：{message}",
    });
    if (!created) return;

    // What was not imported, said out loud: a file can hold several sheets and a
    // document is one tree, so "imported" without that would be a half-truth.
    if (plan.warning) {
      setNotice(`已导入为新文档：${created.title} —— ${plan.warning}`);
    }

    // What the file carried besides its shape — notes, links, tags, markers, the
    // lines and spans between topics — belongs in the document's companion file,
    // keyed by the ids the document just produced. Written after the document
    // exists and not before: a sidecar with no document beside it is a file nothing
    // would ever read.
    //
    // Read against a tree built from the document's own Markdown and title, so the
    // ids are the ones the map will use when it opens the file.
    const sidecar = applyImportedAnnotations(
      emptySidecar(),
      annotationsForDocument(plan.outline, created.markdown, created.title),
    );
    if (sidecarIsEmpty(sidecar)) return;

    if (!(await saveSidecar(created.absolutePath, sidecar))) {
      // The document was created; what it carried was not. Saying so is the point:
      // a reader who is told can write the notes again, and a reader who is not
      // will find the outline intact and the notes gone with no explanation.
      setNotice(`已导入为新文档：${created.title}，但它的备注与链接没能写入。`);
    }
  }, [createDocumentFromContent, setNotice]);

  return { createDocumentFromContent, handleCreateCanvasExtractNote, handleImportOutline };
}
