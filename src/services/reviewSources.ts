import type { ChapterSource } from "../core/types";

/**
 * The documents a review session draws cards from.
 *
 * Deliberately smaller than the summary the Space panel works with: the review only
 * ever needs the path, to save progress back to the right file, and the text, to find
 * cards in. Narrowing it here is what lets a workspace chapter and a file from a
 * folder the reader picked be the same kind of thing.
 */
export type ReviewSourceDocument = {
  /** Absolute path, and the identity progress is written back to. */
  filePath: string;
  content: string;
};

/** Just the two calls reading a document needs, so a test can hand in its own. */
export interface ReviewSourceReader {
  readMarkdownBatch?: (paths: string[]) => Promise<ChapterSource[]>;
  readMarkdownFile: (path: string) => Promise<ChapterSource>;
}

/**
 * Reads a set of documents for review.
 *
 * One function for both sources that come off disk — the open workspace's chapters,
 * and a folder the reader chose for revision — because the rule that has to be right
 * here is the pairing, and it is easy to get wrong: the batch call **drops** what it
 * cannot return (a file it could not read, a chapter that is not Markdown at all,
 * such as a `.canvas`), so its answer is not as long as its question. Pairing by
 * position is how the second document ends up with the first one's text and how a
 * rating then writes its progress into the wrong file.
 *
 * Every result carries its own path, so the answer is keyed by the thing it is about.
 * The single-file read is not required to report its own path, so it is filled in
 * from the path that was asked for — after which both channels have the same shape
 * and the rest of this does not care which one ran.
 *
 * Failures propagate: one unreadable file should not silently shrink a review, and
 * the callers already have somewhere to say what went wrong.
 */
export async function readReviewDocuments(
  bridge: ReviewSourceReader,
  paths: string[]
): Promise<ReviewSourceDocument[]> {
  if (paths.length === 0) return [];

  const sources: ChapterSource[] = bridge.readMarkdownBatch
    ? await bridge.readMarkdownBatch(paths)
    : (await Promise.all(paths.map((path) => bridge.readMarkdownFile(path)))).map(
        (source, index) => ({ ...source, absolutePath: source.absolutePath ?? paths[index] })
      );

  const byPath = new Map<string, ChapterSource>();
  for (const source of sources) {
    if (source?.absolutePath) byPath.set(source.absolutePath.toLowerCase(), source);
  }

  const documents: ReviewSourceDocument[] = [];
  for (const path of paths) {
    const source = byPath.get(path.toLowerCase());
    if (source?.markdown) documents.push({ filePath: path, content: source.markdown });
  }

  return documents;
}
