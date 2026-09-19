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

/**
 * How many folders one review may draw on.
 *
 * A review reading eight folders is a review of everything, which is what the
 * workspace source is for; and the rows live in a narrow sidebar header, where eight
 * of them is a list nobody reads. Small enough to stay a choice, large enough for a
 * few subjects at once.
 */
export const MAX_REVIEW_FOLDERS = 5;

const STORAGE_KEY = "knowspace.review-folders";
/** The single-folder key this replaced. Read once, so an upgrade keeps the folder. */
const LEGACY_KEY = "knowspace.review-folder";

/** The last path segment, whichever separator the platform used. */
function folderName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath;
}

/** A stored entry, or null when it is not one — the shape is checked, not trusted. */
function normaliseChoice(value: unknown): ReviewFolderChoice | null {
  const entry = value as Partial<ReviewFolderChoice> | null;
  if (!entry || typeof entry.rootPath !== "string" || !entry.rootPath) return null;
  return {
    rootPath: entry.rootPath,
    name: typeof entry.name === "string" && entry.name ? entry.name : folderName(entry.rootPath),
    paths: Array.isArray(entry.paths)
      ? entry.paths.filter((path): path is string => typeof path === "string")
      : [],
  };
}

function readStoredChoices(): ReviewFolderChoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normaliseChoice)
        .filter((choice): choice is ReviewFolderChoice => choice !== null)
        .slice(0, MAX_REVIEW_FOLDERS);
    }

    // Nothing under the new key: this may be an upgrade from the single-folder version,
    // and the folder someone chose is not something to throw away because a key was
    // renamed.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const one = normaliseChoice(JSON.parse(legacy) as unknown);
      if (one) return [one];
    }
  } catch {
    // A stored list that will not parse is not worth failing a whole panel over.
  }
  return [];
}

function writeStoredChoices(choices: ReviewFolderChoice[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Storage can be full or unavailable. The session still works without it.
  }
}

/**
 * Folders as a card source.
 *
 * Not the same act as opening a folder as the workspace: that replaces the vault, the
 * tabs and the reading session, and a reader who wants the cards out of some folders
 * does not want any of it. So this asks the main process for folders and their
 * Markdown files, reads them through the same code the workspace source uses, and
 * leaves everything else where it was.
 *
 * More than one, because revision is rarely one subject: a reader with 英语 and 专业课
 * was re-picking a folder every time they switched.
 */
export function useReviewFolders() {
  const bridge =
    typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const [choices, setChoices] = useState<ReviewFolderChoice[]>(() => readStoredChoices());
  const [documents, setDocuments] = useState<ReviewSourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * Whether the folders in state came from storage.
   *
   * Only a restored folder is worth listing again: one the reader has just picked came
   * with a listing the picker made a moment ago, and listing it a second time can only
   * replace a good answer with a worse one.
   */
  const restoredRef = useRef(choices.length > 0);

  // Remembered folders are listed again on mount, so cards written since they were
  // chosen are in tonight's review.
  const rememberedPaths = choices.map((choice) => choice.rootPath).join("\u0000");
  useEffect(() => {
    if (!rememberedPaths || !bridge?.listReviewFolder || !restoredRef.current) return;

    void (async () => {
      const listed = await Promise.all(
        rememberedPaths.split("\u0000").map(async (rootPath) => {
          try {
            const answer = await bridge.listReviewFolder?.(rootPath);
            const paths = answer?.paths;
            // A listing that failed says so, and a failure must not empty a folder the
            // reader chose: "the folder could not be read" and "the folder has no cards"
            // are different things, and showing the second when the first is true is how
            // a reader concludes their cards are gone. One folder failing is also not a
            // reason to stop looking at the others.
            if (!Array.isArray(paths) || answer?.message) return null;
            return { rootPath, paths };
          } catch {
            return null;
          }
        })
      );

      const fresh = listed.filter((entry): entry is { rootPath: string; paths: string[] } => !!entry);
      if (fresh.length === 0) return;

      setChoices((prev) => {
        const next = prev.map((choice) => {
          const updated = fresh.find((entry) => entry.rootPath === choice.rootPath);
          return updated ? { ...choice, paths: updated.paths } : choice;
        });
        writeStoredChoices(next);
        return next;
      });
    })();
  }, [rememberedPaths, bridge?.listReviewFolder]);

  /**
   * Reads the documents of a set of folders.
   *
   * Takes them as an argument rather than reading `choices` out of the closure, and
   * that is the whole reason it exists: `choose` has just worked out a folder that no
   * render has seen yet, and a `load()` closed over the previous list would read
   * nothing at all — which looks exactly like folders with no cards in them.
   */
  const readFolders = useCallback(
    async (targets: ReviewFolderChoice[]) => {
      if (targets.length === 0) {
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

      // Two folders can hold the same file — one inside the other, or the same folder
      // added twice in an earlier session. A path is read once.
      const paths: string[] = [];
      for (const target of targets) {
        for (const path of target.paths) {
          if (!paths.some((seen) => seen.toLowerCase() === path.toLowerCase())) paths.push(path);
        }
      }

      setLoading(true);
      setError(null);
      try {
        setDocuments(await readReviewDocuments(bridge, paths));
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

  /** Reads the folders that are currently chosen — for when this source is switched to. */
  const load = useCallback(() => readFolders(choices), [readFolders, choices]);

  /**
   * Asks for a folder and adds it, or refreshes the one already there.
   *
   * A cancelled pick and a failed one both leave things as they were. Adding a folder
   * that is already in the list replaces its listing rather than listing it twice —
   * which is what a reader who moved it and wants it re-read would mean anyway.
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

    const chosen: ReviewFolderChoice = {
      rootPath: picked.rootPath,
      name: picked.name || folderName(picked.rootPath),
      paths: picked.paths,
    };

    setChoices((prev) => {
      const existing = prev.findIndex(
        (entry) => entry.rootPath.toLowerCase() === chosen.rootPath.toLowerCase()
      );
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = chosen;
        writeStoredChoices(next);
        return next;
      }
      if (prev.length >= MAX_REVIEW_FOLDERS) return prev;
      const next = [...prev, chosen];
      writeStoredChoices(next);
      return next;
    });

    // Freshly listed, so the re-listing effect has nothing to add; and not yet read, so
    // the panel's loading effect has something to do.
    restoredRef.current = false;
    setLoaded(false);
  }, [bridge]);

  /** Forgets one folder. The others stay, and so does the source. */
  const remove = useCallback((rootPath: string) => {
    setChoices((prev) => {
      const next = prev.filter(
        (entry) => entry.rootPath.toLowerCase() !== rootPath.toLowerCase()
      );
      writeStoredChoices(next);
      return next;
    });
    setLoaded(false);
  }, []);

  /** Reloads when the source is already in use — used after a rating is saved. */
  const reloadIfLoaded = useCallback(() => {
    if (loaded) void load();
  }, [loaded, load]);

  const fileCount = choices.reduce((total, choice) => total + choice.paths.length, 0);

  return {
    choices,
    choose,
    remove,
    documents,
    loading,
    error,
    loaded,
    fileCount,
    canAddMore: choices.length < MAX_REVIEW_FOLDERS,
    load,
    reloadIfLoaded,
  };
}
