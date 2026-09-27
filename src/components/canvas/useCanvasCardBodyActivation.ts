import { useCallback } from "react";
import { toggleChecklistInMarkdown } from "../../services/canvasService";
import type { CanvasData } from "../../types/canvasTypes";

/**
 * What a press on a rendered card body means: a link opens the note it names,
 * a checkbox toggles its line. One handler for both, kept stable so the card
 * body can be memoised (see CanvasCardMarkdown).
 *
 * Extracted from useCanvasPointer (the final trim wave) — the pointer hook
 * multiplexes drags through the container's mouse effect; this handler belongs
 * to the card, not to the drag system, and giving it its own file keeps that
 * file's one job honest.
 */
export function useCanvasCardBodyActivation({
  allChapters,
  onOpenFile,
  latestDataRef,
  pushHistory,
  showToast,
}: {
  allChapters: Array<{ id: string; title: string; src: string; absolutePath?: string }>;
  onOpenFile?: (filePath: string) => void;
  latestDataRef: { current: CanvasData };
  pushHistory: (newData: CanvasData) => void;
  showToast: (msg: string) => void;
}) {
  const handleCardBodyActivate = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const cardEl = target?.closest(".canvas-card-markdown") as HTMLElement | null;
      if (!target || !cardEl) return;

      // A rendered [[link]] goes to the note it names.
      const link = target.closest("a[data-wikilink-target]") as HTMLAnchorElement | null;
      if (link) {
        e.stopPropagation();
        const wanted = (link.getAttribute("data-wikilink-target") || "")
          .replace(/\.md$/i, "")
          .trim()
          .toLowerCase();
        const hit = allChapters.find((c) => {
          const title = c.title.trim().toLowerCase();
          const fileName = (c.src.split("/").pop() ?? "").replace(/\.md$/i, "").toLowerCase();
          return title === wanted || fileName === wanted;
        });
        if (hit?.absolutePath && onOpenFile) {
          onOpenFile(hit.absolutePath);
          showToast(`已打开：${hit.title}`);
        } else {
          showToast(`找不到笔记：${link.getAttribute("data-wikilink-target")}`);
        }
        return;
      }

      // A checkbox flips its own line in the Markdown.
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
        e.stopPropagation();
        const nodeId = cardEl.dataset.nodeId;
        if (!nodeId) return;
        const idx = Array.from(cardEl.querySelectorAll('input[type="checkbox"]')).indexOf(
          target as HTMLInputElement,
        );
        if (idx === -1) return;
        const live = latestDataRef.current;
        const node = live.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== "text") return;
        const updatedText = toggleChecklistInMarkdown(node.text, idx);
        pushHistory({
          ...live,
          nodes: live.nodes.map((n) => (n.id === nodeId ? { ...n, text: updatedText } : n)),
        });
      }
    },
    [allChapters, onOpenFile, pushHistory, showToast, latestDataRef],
  );

  return { handleCardBodyActivate };
}
