import { useCallback, useEffect, useRef, useState } from "react";
import {
  readReviewDocuments,
  type ReviewSourceDocument,
} from "../services/reviewSources";

/**
 * A folder the reader chose to revise from, as it is remembered between sessions.
 *
 * The path is what is stored, not the listing: a folder gains files, and a review
 * that cannot see this week's cards because it remembered last week's list would be
 * worse than one that takes a moment to look again.
 */
export type ReviewFolderChoice = {
  rootPath: string;
  /** The folder's own name, for the one place it is shown. */
  name: string;
  /** The Markdown files in it, as of the last listing. */
  paths: string[];
};

const STORAGE_KEY = "knowspace.review-folder";

/** The last path segment, whichever separator the platform used. */
function folderName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath;
}

function readStoredChoice(): ReviewFolderChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReviewFolderChoice>;
    if (!parsed?.rootPath || typeof parsed.rootPath !== "string") return null;
    return {
      rootPath: parsed.rootPath,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : folderName(parsed.rootPath),
      paths: Array.isArray(parsed.paths) ? parsed.paths.filter((p): p is string => typeof p === "string") : [],
    };
  } catch {
    // A stored choice that will not parse is not worth failing a whole panel over.
    return null;
  }
}

function writeStoredChoice(choice: ReviewFolderChoice | null): void {
  try {
    if (!choice) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage can be full or unavailable. The session still works without it.
  }
}

/**
 * A folder as a card source.
 *
 * Not the same act as opening a folder as the workspace: that replaces the vault,
 * the tabs and the reading session, and a reader who wants the cards out of some
 * folder does not want any of it. So this asks the main process for a folder and its
 * Markdown files, reads them through the same code the workspace source uses, and
 * leaves everything else where it was.
 *
 * The choice is remembered, because picking the same folder before every review is
 * the kind of small labour that stops people revising.
 */
export function useReviewFolder() {
  const bridge =
    typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const [choice, setChoice] = useState<ReviewFolderChoice | null>(() => readStoredChoice());
  const [documents, setDocuments] = useState<ReviewSourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * Whether the folder in state is one restored from storage.
   *
   * Only a restored folder is worth listing again: a folder the reader has just picked
   * came with a listing the picker made a moment ago, and listing it a second time can
   * only replace a good answer with a worse one.
   */
  const restoredRef = useRef(Boolean(choice));

  // A remembered folder is listed again on mount, so cards added since it was chosen
  // are in tonight's review.
  const rememberedPath = choice?.rootPath;
  useEffect(() => {
    if (!rememberedPath || !bridge?.listReviewFolder) return;
    if (!restoredRef.current) return;

    void (async () => {
      try {
        const listed = await bridge.listReviewFolder?.(rememberedPath);
        const paths = listed?.paths;
        // A listing that failed says so, and a failure must not empty a folder the
        // reader chose: "the folder could not be read" and "the folder has no cards"
        // are different things, and showing the second when the first is true is how
        // a reader concludes their cards are gone.
        if (!Array.isArray(paths) || listed?.message) return;
        setChoice((prev) => {
          if (!prev || prev.rootPath !== rememberedPath) return prev;
          const next = { ...prev, paths };
          writeStoredChoice(next);
          return next;
        });
      } catch {
        // The stored listing is still usable; a failed refresh is not an error the
        // reader needs to hear about before they have even chosen this source.
      }
    })();
  }, [rememberedPath, bridge?.listReviewFolder]);

  /**
   * Reads a folder's documents.
   *
   * Takes the folder as an argument rather than reading `choice` out of the closure,
   * and that is the whole reason it exists: `choose` has just worked out a folder that
   * no render has seen yet, and a `load()` closed over the previous choice would read
   * nothing at all — which looks exactly like a folder with no cards in it.
   */
  const readFolder = useCallback(
    async (target: ReviewFolderChoice | null) => {
      if (!target) {
        setDocuments([]);
        setError(null);
        setLoaded(true);
        return;
      }

      if (!bridge?.readMarkdownFile && !bridge?.readMarkdownBatch) {
        setError("当前环境不支持读取文件夹。");
        setLoaded(true);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        setDocuments(await readReviewDocuments(bridge, target.paths));
        setLoaded(true);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "读取文件夹失败");
        setDocuments([]);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    },
    [bridge]
  );

  /** Reads the folder that is currently chosen — for when this source is switched to. */
  const load = useCallback(() => readFolder(choice), [readFolder, choice]);

  /**
   * Asks for a folder, and hands it to whoever reads it.
   *
   * A cancelled pick and a failed one both leave things as they were. What is picked
   * is not read here: `readFolder` takes its folder as an argument precisely so that a
   * caller can hand it one no render has seen, and the panel's effect — which loads
   * whichever source is in use — is that caller.
   */
  const choose = useCallback(async (): Promise<void> => {
    if (!bridge?.pickReviewFolder) {
      setError("当前环境不支持选择文件夹。");
      return;
    }

    const picked = await bridge.pickReviewFolder();
    if (picked?.canceled) return;
    if (!picked?.rootPath || !Array.isArray(picked.paths)) {
      setError(picked?.message || "无法读取这个文件夹。");
      return;
    }

    const next: ReviewFolderChoice = {
      rootPath: picked.rootPath,
      name: picked.name || folderName(picked.rootPath),
      paths: picked.paths,
    };
    setChoice(next);
    writeStoredChoice(next);
    // Freshly listed, so the re-listing effect has nothing to add; and not yet read, so
    // the panel's loading effect has something to do.
    restoredRef.current = false;
    setLoaded(false);
  }, [bridge]);

  /** Forgets the folder, so the panel goes back to asking for one. */
  const forget = useCallback(() => {
    writeStoredChoice(null);
    setChoice(null);
    setDocuments([]);
    setLoaded(false);
  }, []);

  /** Reloads when the source is already in use — used after a rating is saved. */
  const reloadIfLoaded = useCallback(() => {
    if (loaded) void load();
  }, [loaded, load]);

  return {
    choice,
    choose,
    forget,
    documents,
    loading,
    error,
    loaded,
    fileCount: choice?.paths.length ?? 0,
    load,
    reloadIfLoaded,
  };
}
