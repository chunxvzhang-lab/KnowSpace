import { useCallback, useState } from "react";
import { useVaultStore } from "../store/useVaultStore";

/**
 * A document the review can draw cards from.
 *
 * Deliberately smaller than the summary the Space panel works with: the review
 * only ever needs the path, to save progress back to the right file, and the
 * text, to find cards in. Narrowing it here is what lets a knowledge-base
 * chapter be a card source without inventing a date, a time and a tag list that
 * only the timeline ever displays.
 */
export type ReviewSourceDocument = {
  /** Absolute path, and the identity progress is written back to. */
  filePath: string;
  content: string;
};

/**
 * The open knowledge base as a card source.
 *
 * The review used to read only the Space folder, because that was the only
 * place the desktop bridge could list. Everything else in the vault is equally
 * valid material to revise, so this loads the chapters the app already has a
 * manifest for.
 *
 * Loading is on demand rather than on mount, and that is deliberate: reading
 * every chapter is the most expensive thing here, and most review sessions draw
 * on Space. Nothing is fetched until the reader actually picks this source.
 *
 * Documents are read in one batch through readMarkdownBatch when the bridge
 * offers it — the same call the app's own indexing uses — and fall back to
 * reading them one at a time otherwise. A chapter that fails to load is skipped
 * rather than failing the whole source, because one unreadable file in a large
 * vault should not make revision impossible.
 */
export function useVaultCards() {
  const manifest = useVaultStore((s) => s.manifest);
  const [documents, setDocuments] = useState<ReviewSourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const chapterCount = manifest?.chapters.length ?? 0;

  const load = useCallback(async () => {
    const bridge =
      typeof window !== "undefined"
        ? window.knowSpaceDesktop || window.bookMDDesktop
        : undefined;

    const paths = (manifest?.chapters ?? [])
      .map((chapter) => chapter.absolutePath)
      .filter((path): path is string => Boolean(path));

    if (paths.length === 0 || !bridge) {
      setDocuments([]);
      setLoaded(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sources = bridge.readMarkdownBatch
        ? await bridge.readMarkdownBatch(paths)
        : await Promise.all(paths.map((path) => bridge.readMarkdownFile(path)));

      const loadedDocuments: ReviewSourceDocument[] = [];
      paths.forEach((path, index) => {
        const source = sources[index];
        if (source?.markdown) loadedDocuments.push({ filePath: path, content: source.markdown });
      });
      setDocuments(loadedDocuments);
      setLoaded(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "读取知识库失败");
      setDocuments([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [manifest]);

  /** Reloads when the source is already in use — used after a rating is saved. */
  const reloadIfLoaded = useCallback(() => {
    if (loaded) void load();
  }, [loaded, load]);

  return { documents, loading, error, loaded, chapterCount, load, reloadIfLoaded };
}
