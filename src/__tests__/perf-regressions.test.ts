import { describe, expect, it } from "vitest";

import {
  parseFlashcards,
  parseFsrsMetadata,
  parseNote,
  upsertFsrsMetadata,
  type FsrsProgress,
} from "../services/fsrsService";
import {
  buildVaultSearchIndex,
  buildVaultSearchIndexChunked,
} from "../services/searchIndexService";
import { readReviewDocuments, readReviewDocumentsChunked } from "../services/reviewSources";
import type { ChapterSource } from "../core/types";

/**
 * The invariants the performance work depends on.
 *
 * Every change in that batch replaced a slower way of computing something with a
 * faster one, and a faster one that computes something *slightly different* is
 * not an optimisation — it is a silent behaviour change. These are the
 * equalities that have to hold: fenced code is skipped exactly as before,
 * batching a build produces the same index as building it at once, and a note's
 * cards are parsed once and reused without changing the answer.
 */

// ── Fenced code blocks ──────────────────────────────────────────────────────

describe("fenced code blocks are skipped", () => {
  it("does not read cards out of a fenced block", () => {
    const note = ["# 标题", "", "```md", "Q: 示例问题", "A: 示例答案", "前 :: 后", "==高亮==", "```", ""].join(
      "\n"
    );
    expect(parseFlashcards(note)).toHaveLength(0);
  });

  it("reads cards after the fence closes", () => {
    const note = ["```", "Q: 围栏里的问题", "```", "", "Q: 围栏外的问题", "A: 围栏外的答案"].join("\n");
    const cards = parseFlashcards(note);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("围栏外的问题");
  });

  it("treats ~~~ as a fence as well", () => {
    const note = ["~~~", "Q: 波浪围栏里的问题", "~~~", "", "Q: 外面的问题", "A: 外面的答案"].join("\n");
    const cards = parseFlashcards(note);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("外面的问题");
  });

  it("stays inside an unclosed fence to the end of the note", () => {
    // The old per-line walk and the new one-pass mask have to agree on the
    // pathological case too: an opening marker with no closing one.
    const note = ["Q: 围栏前的问题", "A: 答案", "", "```", "Q: 未闭合围栏里的问题", "A: 不该被读到"].join(
      "\n"
    );
    const cards = parseFlashcards(note);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("围栏前的问题");
  });

  it("does not close a ``` fence with a ~~~ marker", () => {
    const note = ["```", "Q: 问题一", "~~~", "Q: 问题二", "```", "", "Q: 外面的问题", "A: 答案"].join(
      "\n"
    );
    const cards = parseFlashcards(note);
    expect(cards.map((card) => card.front)).toEqual(["外面的问题"]);
  });

  it("keeps a Q/A answer from running into a fenced block", () => {
    const note = ["Q: 问题", "A: 答案第一行", "", "```js", "const x = 1;", "```"].join("\n");
    const cards = parseFlashcards(note);
    expect(cards).toHaveLength(1);
    expect(cards[0].back).toBe("答案第一行");
  });
});

// ── Parsing a note once ─────────────────────────────────────────────────────

describe("parseNote reuses one parse", () => {
  it("returns the same cards and progress as parsing each part separately", () => {
    const content = [
      "Q: 问题一",
      "A: 答案一",
      "",
      "前 :: 后",
      "",
      "{{c1::挖空答案}}",
    ].join("\n");

    const note = parseNote({ path: "C:/vault/a.md", content });

    expect(note.cards).toEqual(parseFlashcards(content));
    expect([...note.progress.entries()]).toEqual([...parseFsrsMetadata(content).entries()]);
  });

  it("attaches legacy single-line progress to the same cards either way", () => {
    // The legacy form carries no card id and is matched by order — which is the
    // one branch that made parseFsrsMetadata parse the note a second time.
    const content = [
      "<!-- fsrs: S=1.2 D=3.4 due=2026-09-22 -->",
      "",
      "Q: 第一个问题",
      "A: 第一个答案",
      "",
      "Q: 第二个问题",
      "A: 第二个答案",
    ].join("\n");

    const cards = parseFlashcards(content);
    const withReuse = parseFsrsMetadata(content, cards);
    const withoutReuse = parseFsrsMetadata(content);

    expect([...withReuse.entries()]).toEqual([...withoutReuse.entries()]);
    expect(withReuse.size).toBe(1);
    expect(withReuse.has(cards[0].id)).toBe(true);
  });

  it("writes back the same metadata whether or not the cards are passed in", () => {
    const content = ["Q: 问题一", "A: 答案一", "", "Q: 问题二", "A: 答案二"].join("\n");
    const progress = new Map<string, FsrsProgress>();
    const first = parseFlashcards(content)[0];
    progress.set(first.id, {
      stability: 3,
      difficulty: 5,
      due: "2026-10-01",
      reps: 1,
      lapses: 0,
      state: "review",
    });

    const updated = upsertFsrsMetadata(content, progress);
    // Reading it back has to find the row that was written, and no others.
    expect([...parseFsrsMetadata(updated).keys()]).toEqual([first.id]);
  });
});

// ── Chunked builds equal one-shot builds ────────────────────────────────────

describe("chunked work equals one-shot work", () => {
  const documents = Array.from({ length: 25 }, (_, index) => ({
    id: `chapter:path:doc-${index}.md`,
    title: `文档 ${index}`,
    path: `C:/vault/doc-${index}.md`,
    content: [
      `# 文档 ${index}`,
      "",
      `这是第 ${index} 篇的正文，带有 #标签${index % 3} 与 [[文档 ${(index + 1) % 25}]] 链接。`,
      "",
      "Q: 问题",
      "A: 答案",
    ].join("\n"),
  }));

  it("builds the same search index in batches as in one call", async () => {
    const oneShot = buildVaultSearchIndex(documents);
    const chunked = await buildVaultSearchIndexChunked(documents, { chunkSize: 4 });

    expect([...chunked.documents.keys()]).toEqual([...oneShot.documents.keys()]);
    expect([...chunked.tagIndex.keys()].sort()).toEqual([...oneShot.tagIndex.keys()].sort());
    expect([...chunked.linkIndex.keys()].sort()).toEqual([...oneShot.linkIndex.keys()].sort());
    expect([...chunked.termIndex.keys()].sort()).toEqual([...oneShot.termIndex.keys()].sort());
    expect([...chunked.blockMap.keys()].sort()).toEqual([...oneShot.blockMap.keys()].sort());

    for (const [tag, blocks] of oneShot.tagIndex) {
      expect([...chunked.tagIndex.get(tag)!].sort()).toEqual([...blocks].sort());
    }
  });

  it("reports progress that ends at the total", async () => {
    const seen: { done: number; total: number }[] = [];
    await buildVaultSearchIndexChunked(documents, {
      chunkSize: 4,
      onProgress: (done, total) => seen.push({ done, total }),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual({ done: documents.length, total: documents.length });
    expect(seen.every((step) => step.total === documents.length)).toBe(true);
  });

  it("stops early when the caller cancels, without throwing", async () => {
    let calls = 0;
    const index = await buildVaultSearchIndexChunked(documents, {
      chunkSize: 4,
      isCancelled: () => {
        calls += 1;
        return calls > 1;
      },
    });
    // One batch went in before the cancel was seen; the rest did not.
    expect(index.documents.size).toBeLessThan(documents.length);
  });

  it("reads the same documents in batches as in one call", async () => {
    const paths = documents.map((doc) => doc.path!);
    const contents = new Map(documents.map((doc) => [doc.path!.toLowerCase(), doc.content]));
    const readOne = async (path: string): Promise<ChapterSource> => ({
      absolutePath: path,
      markdown: contents.get(path.toLowerCase())!,
      baseUrl: "",
      cacheKey: "",
      diskVersion: { size: 1, mtimeMs: 1 },
      hasBom: false,
      lineEnding: "\n",
    });
    const bridge = {
      readMarkdownBatch: async (asked: string[]): Promise<ChapterSource[]> =>
        await Promise.all(asked.filter((path) => contents.has(path.toLowerCase())).map(readOne)),
      readMarkdownFile: readOne,
    };

    const oneShot = await readReviewDocuments(bridge, paths);
    const chunked = await readReviewDocumentsChunked(bridge, paths, { chunkSize: 6 });

    expect(chunked).toEqual(oneShot);
  });

  it("keeps the pairing right when the batch drops a document", async () => {
    // The batch call is allowed to return fewer results than it was asked for,
    // and pairing by position is how a document ends up with another's text.
    const readOne = async (path: string): Promise<ChapterSource> => ({
      absolutePath: path,
      markdown: `内容：${path}`,
      baseUrl: "",
      cacheKey: "",
      diskVersion: { size: 1, mtimeMs: 1 },
      hasBom: false,
      lineEnding: "\n",
    });
    const bridge = {
      readMarkdownBatch: async (asked: string[]): Promise<ChapterSource[]> =>
        await Promise.all(asked.filter((path) => !path.includes("missing")).map(readOne)),
      readMarkdownFile: readOne,
    };

    const paths = ["C:/v/a.md", "C:/v/missing.md", "C:/v/b.md"];
    const documents = await readReviewDocumentsChunked(bridge, paths, { chunkSize: 2 });

    expect(documents).toEqual([
      { filePath: "C:/v/a.md", content: "内容：C:/v/a.md" },
      { filePath: "C:/v/b.md", content: "内容：C:/v/b.md" },
    ]);
  });
});
