import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// @ts-ignore
const markdownFiles = require("../../electron/markdown-files.cjs");

describe("electron/markdown-files.cjs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bookmd-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("generates stable chapter IDs based on relative path", () => {
    const id1 = markdownFiles.generateStableChapterId("docs/01-intro.md");
    const id2 = markdownFiles.generateStableChapterId("docs\\01-intro.md");
    const id3 = markdownFiles.generateStableChapterId("docs/02-guide.md");

    expect(id1).toBe("chapter:path:docs%2F01-intro.md");
    expect(id2).toBe("chapter:path:docs%2F01-intro.md");
    expect(id3).toBe("chapter:path:docs%2F02-guide.md");
  });

  it("scans directories and creates manifests with stable IDs", async () => {
    const file1 = path.join(tempDir, "01-start.md");
    const subDir = path.join(tempDir, "sub");
    const file2 = path.join(subDir, "02-detail.markdown");

    await fs.writeFile(file1, "# Start", "utf8");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(file2, "# Detail", "utf8");

    const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
    expect(manifest.chapters.length).toBe(2);
    expect(manifest.chapters[0].id).toBe("chapter:path:01-start.md");
    expect(manifest.chapters[1].id).toBe("chapter:path:sub%2F02-detail.markdown");
  });

  it("reads markdown files and captures diskVersion, BOM and line endings", async () => {
    const filePath = path.join(tempDir, "test-bom.md");
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Line 1\r\nLine 2\r\n", "utf8"),
    ]);
    await fs.writeFile(filePath, bomBuffer);

    const source = await markdownFiles.readMarkdownSource(filePath);
    expect(source.hasBom).toBe(true);
    expect(source.lineEnding).toBe("\r\n");
    expect(source.markdown).toBe("Line 1\r\nLine 2\r\n");
    expect(source.diskVersion.size).toBe(bomBuffer.length);
  });

  it("saves markdown file atomically and detects conflict", async () => {
    const filePath = path.join(tempDir, "sample.md");
    await fs.writeFile(filePath, "Original Content", "utf8");

    const source = await markdownFiles.readMarkdownSource(filePath);
    const originalVersion = source.diskVersion;

    // First save succeeds
    const saveResult1 = await markdownFiles.saveMarkdownFile({
      absolutePath: filePath,
      content: "Updated Content",
      expectedVersion: originalVersion,
    });
    expect(saveResult1.success).toBe(true);
    expect(saveResult1.diskVersion.size).toBe(15);

    // External modification simulation
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(filePath, "Externally Modified", "utf8");

    // Saving with old version fails with FILE_CONFLICT
    const saveResult2 = await markdownFiles.saveMarkdownFile({
      absolutePath: filePath,
      content: "Another Edit",
      expectedVersion: saveResult1.diskVersion,
    });
    expect(saveResult2.success).toBe(false);
    expect(saveResult2.errorCode).toBe("FILE_CONFLICT");

    // Force save succeeds
    const saveResult3 = await markdownFiles.saveMarkdownFile({
      absolutePath: filePath,
      content: "Force Overwritten",
      expectedVersion: saveResult1.diskVersion,
      force: true,
    });
    expect(saveResult3.success).toBe(true);
  });

  it("rejects non-markdown files", async () => {
    const saveResult = await markdownFiles.saveMarkdownFile({
      absolutePath: path.join(tempDir, "malicious.exe"),
      content: "dangerous",
    });
    expect(saveResult.success).toBe(false);
    expect(saveResult.errorCode).toBe("INVALID_EXTENSION");
  });

  it("finds search matches with exact line numbers when sourceMarkdown is provided", async () => {
    const { findInChapter } = await import("../services/markdown");
    const sourceMarkdown = `# Chapter 1\n\nFirst line with react.\nSecond line with nothing.\n\nThird line with another react keyword.\n`;
    const headings = [{ id: "chapter-1", text: "Chapter 1", level: 1 }];
    const results = findInChapter("react", "Chapter 1 First line with react...", headings, sourceMarkdown);

    expect(results.length).toBe(2);
    expect(results[0].lineNumber).toBe(3);
    expect(results[0].matchedText).toBe("react");
    expect(results[0].excerpt).toContain("First line with react");

    expect(results[1].lineNumber).toBe(6);
    expect(results[1].matchedText).toBe("react");
    expect(results[1].excerpt).toContain("Third line with another react keyword");
  });

  it("groups multiple keyword matches within the same paragraph into a single card with matchCountInBlock", async () => {
    const { findInChapter } = await import("../services/markdown");
    const sourceMarkdown = `# Guide

BookMD is fast. With BookMD, you can read markdown. Yes, BookMD is great!

## Next Section

Another mention of BookMD here.
`;
    const headings = [
      { id: "guide", text: "Guide", level: 1 },
      { id: "next-section", text: "Next Section", level: 2 },
    ];
    const results = findInChapter("BookMD", "Guide BookMD is fast...", headings, sourceMarkdown);

    // Should only have 2 cards: 1 for the first paragraph (3 matches inside), 1 for the second paragraph
    expect(results.length).toBe(2);
    expect(results[0].title).toBe("Guide");
    expect(results[0].lineNumber).toBe(3);
    expect(results[0].matchCountInBlock).toBe(3);
    expect(results[0].excerpt).toContain("BookMD is fast");

    expect(results[1].title).toBe("Next Section");
    expect(results[1].lineNumber).toBe(7);
    expect(results[1].matchCountInBlock).toBe(1);
  });

  it("groups matches inside a fenced code block into a single card", async () => {
    const { findInChapter } = await import("../services/markdown");
    const sourceMarkdown = `# Code Example

\`\`\`typescript
const electron = require('electron');
function initElectron() {
  console.log('electron app ready');
}
\`\`\`
`;
    const headings = [{ id: "code-example", text: "Code Example", level: 1 }];
    const results = findInChapter("electron", "Code Example const electron...", headings, sourceMarkdown);

    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Code Example");
    expect(results[0].lineNumber).toBe(3);
    expect(results[0].lineEndNumber).toBe(8);
    expect(results[0].matchCountInBlock).toBe(4);
  });

  it("reads multiple markdown files concurrently via readMarkdownSourcesBatch", async () => {
    const fileA = path.join(tempDir, "docA.md");
    const fileB = path.join(tempDir, "docB.md");
    const fileC = path.join(tempDir, "docC.md");

    await fs.writeFile(fileA, "# Doc A\nHello A", "utf8");
    await fs.writeFile(fileB, "# Doc B\nHello B", "utf8");
    await fs.writeFile(fileC, "# Doc C\nHello C", "utf8");

    const batch = await markdownFiles.readMarkdownSourcesBatch([fileA, fileB, fileC, path.join(tempDir, "missing.md")]);
    expect(batch.length).toBe(3);

    const docA = batch.find((item: any) => item.absolutePath === fileA);
    const docB = batch.find((item: any) => item.absolutePath === fileB);
    expect(docA).toBeDefined();
    expect(docA.markdown).toContain("Hello A");
    expect(docB).toBeDefined();
    expect(docB.markdown).toContain("Hello B");
  });
});
