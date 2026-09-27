import { useCallback } from "react";
import type { ChapterManifest } from "../core/types";
import {
  updateDocumentInIndex,
  getLinkedReferences,
  refactorWikiLinksInContent,
} from "../services/backlinkIndex";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";
import { samePath } from "../core/paths";
import type { OpenSessionParams } from "./useDocumentSession";

type UseChapterRenameParams = {
  session: import("../core/types").DocumentSession | null;
  updateSource: (source: string) => void;
  openSession: (params: OpenSessionParams) => void;
};

/**
 * Renaming a document is five coordinated writes: the file on disk, every
 * `[[wiki link]]` that named it (when the reader opts in), the manifest, the
 * open tabs, and the live session if the renamed document is the one on
 * screen. Missing any one of them desynchronises a different layer, which is
 * why they live in one function instead of beside whichever caller noticed.
 */
export function useChapterRename({ session, updateSource, openSession }: UseChapterRenameParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const backlinkIndex = useVaultStore((s) => s.backlinkIndex);
  const setNotice = useUiStore((s) => s.setNotice);
  const setTabs = useTabStore((s) => s.setTabs);

  const handleRenameChapter = useCallback(
    async (chapter: ChapterManifest) => {
      const desktop = window.bookMDDesktop;
      if (!desktop?.files.renameMarkdownFile || !chapter.absolutePath) {
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
            `· 点击【取消】：仅重命名文件，保留原有引用文本`,
        );
      }

      // 2. Perform native file rename
      const renameRes = await desktop.files.renameMarkdownFile({
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
            const { newContent, changedCount } = refactorWikiLinksInContent(
              session.source,
              oldTitle,
              newTitle,
            );
            if (changedCount > 0) {
              updateSource(newContent);
              refactoredTotal += changedCount;
            }
            continue;
          }

          // If it's another chapter on disk
          const otherCh = manifest?.chapters.find((c) => c.id === sourceId);
          if (
            otherCh?.absolutePath &&
            desktop.files.readMarkdownFile &&
            desktop.files.saveMarkdownFile
          ) {
            try {
              const fileRes = await desktop.files.readMarkdownFile(otherCh.absolutePath);
              if (fileRes?.markdown) {
                const { newContent, changedCount } = refactorWikiLinksInContent(
                  fileRes.markdown,
                  oldTitle,
                  newTitle,
                );
                if (changedCount > 0) {
                  await desktop.files.saveMarkdownFile({
                    absolutePath: otherCh.absolutePath,
                    content: newContent,
                  });
                  updateDocumentInIndex(
                    backlinkIndex,
                    otherCh.id,
                    otherCh.title,
                    newContent,
                    otherCh.src,
                  );
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
      if (manifest?.rootPath && desktop.files.refreshDirectory) {
        try {
          const nextManifest = await desktop.files.refreshDirectory(manifest.rootPath);
          setManifest(nextManifest);
        } catch {}
      }

      // 5. Update tabs
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id === chapter.id || samePath(t.absolutePath, chapter.absolutePath)) {
            return {
              ...t,
              title: newTitle,
              relativePath: renameRes.fileName || `${newTitle}.md`,
              absolutePath: renameRes.newPath || t.absolutePath,
            };
          }
          return t;
        }),
      );

      // 6. Update active session if the renamed chapter is currently open
      if (
        session &&
        session.chapterId === chapter.id &&
        renameRes.newPath &&
        desktop.files.readMarkdownFile
      ) {
        try {
          const nextSource = await desktop.files.readMarkdownFile(renameRes.newPath);
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
        `已成功重命名为「${newTitle}」${refactoredTotal > 0 ? `，并同步更新了 ${refactoredTotal} 处双链引用` : ""}`,
      );
    },
    [session, manifest, backlinkIndex, updateSource, openSession, setManifest, setNotice, setTabs],
  );

  return { handleRenameChapter };
}
