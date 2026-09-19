import { useCallback, useState } from "react";
import { useVaultStore } from "../store/useVaultStore";
import {
  readReviewDocuments,
  type ReviewSourceDocument,
} from "../services/reviewSources";

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
 * The reading itself lives in reviewSources.ts, shared with the folder source, so
 * that the rule about pairing results with paths has one home rather than two.
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
      setDocuments(await readReviewDocuments(bridge, paths));
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
