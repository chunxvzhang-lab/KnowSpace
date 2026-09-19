import { useCallback, useState } from "react";
import { useVaultStore } from "../store/useVaultStore";
import type { ChapterSource } from "../core/types";

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
      // Both channels are made to answer in the same shape: one source per path,
      // each carrying the path it is about. The single-file read is not required to
      // report its own path, so it is filled in from the path that was asked for.
      const sources: ChapterSource[] = bridge.readMarkdownBatch
        ? await bridge.readMarkdownBatch(paths)
        : (await Promise.all(paths.map((path) => bridge.readMarkdownFile(path)))).map(
            (source, index) => ({ ...source, absolutePath: source.absolutePath ?? paths[index] })
          );

      // Paired by path, not by position, because the batch **drops** what it could
      // not return: an unreadable file, and any chapter that is not Markdown at all
      // (a `.canvas`) — so its results do not line up with the paths that were asked
      // for. Indexing by position is how every chapter after such a file quietly gets
      // the *next* chapter's text, and how a rating then saves its progress into the
      // wrong document.
      //
      // Every result carries its own path, and `useBacklinkIndex` reads the same call
      // the same way — matched by path — which is where the rule comes from.
      const byPath = new Map<string, ChapterSource>();
      for (const source of sources) {
        if (source?.absolutePath) byPath.set(source.absolutePath.toLowerCase(), source);
      }

      const loadedDocuments: ReviewSourceDocument[] = [];
      for (const path of paths) {
        const source = byPath.get(path.toLowerCase());
        if (source?.markdown) loadedDocuments.push({ filePath: path, content: source.markdown });
      }
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
