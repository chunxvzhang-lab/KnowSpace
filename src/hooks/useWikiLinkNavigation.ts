import { useCallback, useMemo } from "react";
import type { WikiLinkTarget } from "../components/EditorPane";
import { useUiStore } from "../store/useUiStore";
import { useTabStore } from "../store/useTabStore";
import { useVaultStore } from "../store/useVaultStore";

type UseWikiLinkNavigationParams = {
  selectChapter: (chapterId: string) => void;
  jumpToHeading: (headingId: string, behavior?: ScrollBehavior, highlight?: boolean) => void;
  openDesktopMarkdownPathRef: { current: (absolutePath: string) => void };
  /** Shared with the reading-position restore: a heading queued for the next document. */
  pendingNavigationRef: { current: { headingId?: string; highlight?: boolean } | null };
};

/**
 * Clicking a `[[wiki link]]`: resolve the name to a document and go there.
 *
 * Three answers exist, in priority order — a chapter of the open vault, a Space
 * flash note, and finally an offer to create the file. All three were inline in
 * App; they are one navigation domain and live here together with the target
 * list the editor's completion reads.
 */
export function useWikiLinkNavigation({
  selectChapter,
  jumpToHeading,
  openDesktopMarkdownPathRef,
  pendingNavigationRef,
}: UseWikiLinkNavigationParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const setNotice = useUiStore((s) => s.setNotice);
  const chapterId = useTabStore((s) => s.activeTabId);

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
          setNotice(
            anchorPart.startsWith("^")
              ? "已跳转至指定段落引用"
              : `已跳转至章节锚点：#${anchorPart.trim()}`,
          );
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
          const anchorLabel = anchorPart
            ? anchorPart.startsWith("^")
              ? " (段落引用)"
              : ` #${anchorPart}`
            : "";
          setNotice(`已跳转至双链文档：${found.title}${anchorLabel}`);
          return;
        }
      }

      // 2. Check in Space flash notes
      const desktop = window.bookMDDesktop;
      if (desktop?.capture.getFlashNotesSummary) {
        try {
          const summary = await desktop.capture.getFlashNotesSummary();
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
      if (rootPath && manifest && desktop?.files.createMarkdownFile) {
        const confirmCreate = window.confirm(
          `双链文档「${cleanTarget}」尚未创建。\n\n是否立即在当前知识库新建「${cleanTarget}.md」？`,
        );
        if (confirmCreate) {
          try {
            const newRes = await desktop.files.createMarkdownFile({
              rootPath,
              defaultName: `${cleanTarget}.md`,
            });
            if (!newRes.canceled && newRes.success) {
              let nextManifest = manifest;
              if (desktop.files.refreshDirectory) {
                nextManifest = await desktop.files.refreshDirectory(rootPath);
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
          } catch (err: unknown) {
            setNotice(err instanceof Error ? err.message : "创建双链新文档失败");
          }
        }
      } else {
        setNotice(`未找到匹配的双链目标「${cleanTarget}」`);
      }
    },
    [
      manifest,
      selectChapter,
      jumpToHeading,
      chapterId,
      pendingNavigationRef,
      openDesktopMarkdownPathRef,
      setManifest,
      setNotice,
    ],
  );

  return { wikiLinkTargets, handleWikiLinkClick };
}
