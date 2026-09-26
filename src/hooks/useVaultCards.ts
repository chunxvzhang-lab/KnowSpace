import { useCallback, useRef, useState } from "react";
import { samePath } from "../core/paths";
import { useVaultStore } from "../store/useVaultStore";
import {
  readReviewDocumentsChunked,
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
  /**
   * How much of the vault has been read, while it is being read.
   *
   * A whole-vault read is the longest wait the review has, and it used to be a
   * bare spinner over it. Reported in documents rather than bytes because that
   * is the unit the reader is about to see counted in the queue.
   */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /**
   * Guards the batch loop against a load that has been superseded.
   *
   * Switching away from this source and back starts a second read while the
   * first is still in flight; without this the older one would keep reading
   * every file and then overwrite the newer answer.
   */
  const loadTokenRef = useRef(0);

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
      setProgress(null);
      return;
    }

    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;

    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: paths.length });
    try {
      const documents = await readReviewDocumentsChunked(bridge, paths, {
        onProgress: (done, total) => {
          if (loadTokenRef.current === token) setProgress({ done, total });
        },
        isCancelled: () => loadTokenRef.current !== token,
      });
      if (loadTokenRef.current !== token) return;
      setDocuments(documents);
      setLoaded(true);
    } catch (cause: unknown) {
      if (loadTokenRef.current !== token) return;
      setError(cause instanceof Error ? cause.message : "读取知识库失败");
      setDocuments([]);
      setLoaded(true);
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
        setProgress(null);
      }
    }
  }, [manifest]);

  /** Reloads when the source is already in use — used after a rating is saved. */
  const reloadIfLoaded = useCallback(() => {
    if (loaded) void load();
  }, [loaded, load]);

  /**
   * The content of one document as it now stands.
   *
   * A rating writes into a file, and the panel already knows what it wrote — so
   * re-reading the whole vault to learn it again is the one thing not to do. On a real
   * vault that is tens of megabytes read off disk, parsed, and handed over IPC, after
   * every single rating. Patching the one document answers the same question for the
   * price of a list walk, and the note that changed is the only one whose answer did.
   */
  const applySaved = useCallback((filePath: string, content: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (samePath(doc.filePath, filePath) ? { ...doc, content } : doc))
    );
  }, []);

  return {
    documents,
    loading,
    error,
    loaded,
    progress,
    chapterCount,
    load,
    reloadIfLoaded,
    applySaved,
  };
}
