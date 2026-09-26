import { useCallback, useEffect, useRef, useState } from "react";
import { samePath } from "../core/paths";
import type { ManifestScanTruncation, ManifestScanUnreadable } from "../core/types";
import {
  readReviewDocumentsChunked,
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
  /**
   * Set when the last listing of this folder stopped before it had seen
   * everything.
   *
   * Carried on the choice rather than reported once, because the row that shows
   * the count is also the row that has to qualify it: "12 篇" next to a folder
   * that actually holds 4000 documents is a number the reader will trust, and
   * the whole point of surfacing a truncation is that they should not.
   */
  scanTruncated?: ManifestScanTruncation;
  /** Set when part of the folder could not be opened at all. */
  scanUnreadable?: ManifestScanUnreadable;
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
    // Re-checked rather than passed through: this comes out of localStorage and
    // the renderer reads `.seen` off it to build a sentence.
    scanTruncated: normaliseTruncation(entry.scanTruncated),
    scanUnreadable: normaliseUnreadable(entry.scanUnreadable),
  };
}

/** The truncation marker, or undefined when there is nothing trustworthy to carry. */
function normaliseTruncation(value: unknown): ReviewFolderChoice["scanTruncated"] {
  if (!value || typeof value !== "object") return undefined;
  const marker = value as { reason?: unknown; seen?: unknown; remainingDirs?: unknown; at?: unknown };
  if (marker.reason !== "files" && marker.reason !== "depth" && marker.reason !== "time") return undefined;
  return {
    reason: marker.reason,
    seen: typeof marker.seen === "number" ? marker.seen : 0,
    ...(typeof marker.remainingDirs === "number" ? { remainingDirs: marker.remainingDirs } : {}),
    ...(typeof marker.at === "string" ? { at: marker.at } : {}),
  };
}

/** The unreadable marker, checked the same way for the same reason. */
function normaliseUnreadable(value: unknown): ReviewFolderChoice["scanUnreadable"] {
  if (!value || typeof value !== "object") return undefined;
  const marker = value as { count?: unknown; samples?: unknown; reason?: unknown };
  if (typeof marker.count !== "number" || marker.count <= 0) return undefined;
  return {
    count: marker.count,
    samples: Array.isArray(marker.samples)
      ? marker.samples.filter((path): path is string => typeof path === "string")
      : [],
    reason: typeof marker.reason === "string" ? marker.reason : "EACCES",
  };
}

/** Both markers at once, for the places that carry a fresh listing around. */
function normaliseScanMarkers(value: {
  scanTruncated?: unknown;
  scanUnreadable?: unknown;
}): Pick<ReviewFolderChoice, "scanTruncated" | "scanUnreadable"> {
  return {
    scanTruncated: normaliseTruncation(value.scanTruncated),
    scanUnreadable: normaliseUnreadable(value.scanUnreadable),
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
 *
 * `enabled` gates the work that would otherwise happen on mount. The review panel
 * is kept mounted now — that is what preserves its parse cache — so without this
 * the remembered folders would be listed again at app start, for a panel the
 * reader may never open. Defaults to true so a caller that does not know about it
 * gets the old behaviour.
 */
export function useReviewFolders(enabled = true) {
  const bridge =
    typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const [choices, setChoices] = useState<ReviewFolderChoice[]>(() => readStoredChoices());
  const [documents, setDocuments] = useState<ReviewSourceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** How many of the chosen folders' files have been read, while they are being read. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** Guards the batch loop against a read that has been superseded by a newer one. */
  const loadTokenRef = useRef(0);

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
    if (!enabled) return;
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
            // A listing that stopped early is still a listing, and the markers have
            // to travel with it — dropping them here would turn a truncated count
            // back into a number presented as the folder's real size.
            return { rootPath, paths, ...normaliseScanMarkers(answer ?? {}) };
          } catch {
            return null;
          }
        })
      );

      const fresh = listed.filter(
        (entry): entry is {
          rootPath: string;
          paths: string[];
          scanTruncated: ReviewFolderChoice["scanTruncated"];
          scanUnreadable: ReviewFolderChoice["scanUnreadable"];
        } => !!entry
      );
      if (fresh.length === 0) return;

      setChoices((prev) => {
        const next = prev.map((choice) => {
          const updated = fresh.find((entry) => entry.rootPath === choice.rootPath);
          return updated
            ? {
                ...choice,
                paths: updated.paths,
                scanTruncated: updated.scanTruncated,
                scanUnreadable: updated.scanUnreadable,
              }
            : choice;
        });
        writeStoredChoices(next);
        return next;
      });
    })();
  }, [enabled, rememberedPaths, bridge?.listReviewFolder]);

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
      const token = loadTokenRef.current + 1;
      loadTokenRef.current = token;

      if (targets.length === 0) {
        setDocuments([]);
        setError(null);
        setLoaded(true);
        setProgress(null);
        return;
      }

      if (!bridge?.readMarkdownFile && !bridge?.readMarkdownBatch) {
        setError("当前环境不支持读取文件夹。");
        setLoaded(true);
        setProgress(null);
        return;
      }

      // Two folders can hold the same file — one inside the other, or the same folder
      // added twice in an earlier session. A path is read once.
      //
      // Through a Set of the folded paths rather than `paths.some(...)`: that scan
      // is O(n²) over the whole set, and it lower-cases both sides on every one of
      // those comparisons — so five folders of a thousand notes each cost a
      // million comparisons and two million throwaway strings, on the click that
      // switches to this source.
      const seen = new Set<string>();
      const paths: string[] = [];
      for (const target of targets) {
        for (const path of target.paths) {
          const key = path.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          paths.push(path);
        }
      }

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
        setError(cause instanceof Error ? cause.message : "读取文件夹失败");
        setDocuments([]);
        setLoaded(true);
      } finally {
        if (loadTokenRef.current === token) {
          setLoading(false);
          setProgress(null);
        }
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
      ...normaliseScanMarkers(picked),
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

  /**
   * The content of one document as it now stands.
   *
   * Same reason as the vault source's: a rating knows what it wrote, and re-reading
   * every file in every chosen folder to learn it again is work nobody asked for.
   */
  const applySaved = useCallback((filePath: string, content: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (samePath(doc.filePath, filePath) ? { ...doc, content } : doc))
    );
  }, []);

  const fileCount = choices.reduce((total, choice) => total + choice.paths.length, 0);

  return {
    choices,
    choose,
    remove,
    documents,
    loading,
    error,
    loaded,
    progress,
    fileCount,
    canAddMore: choices.length < MAX_REVIEW_FOLDERS,
    load,
    reloadIfLoaded,
    applySaved,
  };
}
