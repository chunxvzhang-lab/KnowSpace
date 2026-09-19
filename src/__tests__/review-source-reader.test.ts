import { describe, expect, it, vi } from "vitest";
import { readReviewDocuments, type ReviewSourceReader } from "../services/reviewSources";

/**
 * Reading a set of documents for review.
 *
 * The rule this file exists for is the pairing. The batch call **drops** what it
 * cannot return — a file it could not read, and any document that is not Markdown at
 * all, such as a `.canvas` — so its answer is not as long as its question, and
 * anything that walks the two side by side hands the wrong text to a path. Since a
 * card's source path is what a rating writes to, "wrong text" becomes "progress saved
 * into the wrong document".
 */
const source = (absolutePath: string, markdown: string) => ({ absolutePath, markdown, baseUrl: "" });

function reader(overrides: Partial<ReviewSourceReader> = {}): ReviewSourceReader {
  return {
    readMarkdownBatch: vi.fn().mockResolvedValue([]),
    readMarkdownFile: vi.fn().mockResolvedValue({ markdown: "", baseUrl: "" }),
    ...overrides,
  };
}

describe("复习来源的读取", () => {
  it("批量结果少了一项时，剩下的仍按路径归位", async () => {
    // c1 was never returned — a canvas file, or one that could not be read. Walking
    // the results by position would give c2's path c3's text.
    const bridge = reader({
      readMarkdownBatch: vi
        .fn()
        .mockResolvedValue([source("C:/Vault/c2.md", "第二篇"), source("C:/Vault/c3.md", "第三篇")]),
    });

    const documents = await readReviewDocuments(bridge, [
      "C:/Vault/c1.md",
      "C:/Vault/c2.md",
      "C:/Vault/c3.md",
    ]);

    expect(documents).toEqual([
      { filePath: "C:/Vault/c2.md", content: "第二篇" },
      { filePath: "C:/Vault/c3.md", content: "第三篇" },
    ]);
  });

  it("大小写不同也算同一个文件", async () => {
    // Windows hands the same path back in whatever casing it likes.
    const bridge = reader({
      readMarkdownBatch: vi.fn().mockResolvedValue([source("c:/vault/C1.MD", "内容")]),
    });

    const documents = await readReviewDocuments(bridge, ["C:/Vault/c1.md"]);

    expect(documents).toEqual([{ filePath: "C:/Vault/c1.md", content: "内容" }]);
  });

  it("没人要的路径不会被收进来", async () => {
    // A batch that answers with more than it was asked for is not a reason to review
    // documents the reader did not choose.
    const bridge = reader({
      readMarkdownBatch: vi
        .fn()
        .mockResolvedValue([source("C:/Vault/c1.md", "要的"), source("C:/Other/x.md", "不要的")]),
    });

    const documents = await readReviewDocuments(bridge, ["C:/Vault/c1.md"]);

    expect(documents.map((document) => document.filePath)).toEqual(["C:/Vault/c1.md"]);
  });

  it("没有批量通道时逐篇读，并补上各自应有的路径", async () => {
    // The single read is not required to report its own path, so it is filled in from
    // the path that was asked for — otherwise both channels would have different
    // shapes and this function would need two versions of everything below.
    const readMarkdownFile = vi
      .fn()
      .mockResolvedValueOnce({ markdown: "甲", baseUrl: "" })
      .mockResolvedValueOnce({ markdown: "乙", baseUrl: "" });
    const bridge: ReviewSourceReader = { readMarkdownFile };

    const documents = await readReviewDocuments(bridge, ["C:/Vault/a.md", "C:/Vault/b.md"]);

    expect(documents).toEqual([
      { filePath: "C:/Vault/a.md", content: "甲" },
      { filePath: "C:/Vault/b.md", content: "乙" },
    ]);
  });

  it("没有文件时一次都不读", async () => {
    const bridge = reader();

    expect(await readReviewDocuments(bridge, [])).toEqual([]);
    expect(bridge.readMarkdownBatch).not.toHaveBeenCalled();
    expect(bridge.readMarkdownFile).not.toHaveBeenCalled();
  });

  it("读取失败往上抛，不把来源悄悄变小", async () => {
    // One unreadable file should not silently shrink a review: the callers all have
    // somewhere to say what went wrong, and a shorter queue with no explanation is
    // how a reader concludes their cards are gone.
    const bridge = reader({
      readMarkdownBatch: vi.fn().mockRejectedValue(new Error("磁盘不可读")),
    });

    await expect(readReviewDocuments(bridge, ["C:/Vault/c1.md"])).rejects.toThrow("磁盘不可读");
  });

  it("结果里有路径但没有正文的，按没有处理", async () => {
    const bridge = reader({
      readMarkdownBatch: vi.fn().mockResolvedValue([{ absolutePath: "C:/Vault/c1.md", baseUrl: "" }]),
    });

    expect(await readReviewDocuments(bridge, ["C:/Vault/c1.md"])).toEqual([]);
  });
});
