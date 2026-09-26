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

  /**
   * The mind map's companion file, at the level where it actually touches disk.
   *
   * The renderer's half — parsing, merging, what a note means — is in
   * mindmap-sidecar.test.ts. What can only be checked here is the file: that the
   * companion is named after the document, that a document without one is not an
   * error, and that saving one leaves the document alone.
   */
  describe("导图伴生文件", () => {
    it("伴生文件的路径是文档名加上后缀", () => {
      const documentPath = path.join(tempDir, "笔记.md");

      expect(markdownFiles.sidecarPathFor(documentPath)).toBe(
        path.join(tempDir, "笔记.md.mindmap.json")
      );
    });

    it("只认文档，不给任意文件配伴生文件", () => {
      // The containment of the whole feature: the renderer names a document it
      // has open, and the main process derives the rest. A non-document, or a
      // companion file itself, is not a document to hang a companion off.
      expect(() => markdownFiles.sidecarPathFor(path.join(tempDir, "notes.txt"))).toThrow();
      expect(() => markdownFiles.sidecarPathFor(path.join(tempDir, "a.md.mindmap.json"))).toThrow();
    });

    it("没有伴生文件不是错误", async () => {
      const result = await markdownFiles.readMindmapSidecar(path.join(tempDir, "未写过.md"));

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.content).toBeUndefined();
    });

    it("存了再读，拿回原文，且文档本身没被碰过", async () => {
      const documentPath = path.join(tempDir, "有备注.md");
      await fs.writeFile(documentPath, "# 标题\n", "utf8");
      const before = await fs.stat(documentPath);

      const content = '{\n  "version": 1,\n  "notes": {}\n}\n';
      const saved = await markdownFiles.saveMindmapSidecar({ documentPath, content });
      expect(saved.success).toBe(true);

      const read = await markdownFiles.readMindmapSidecar(documentPath);
      expect(read.exists).toBe(true);
      expect(read.content).toBe(content);

      // A companion is written beside the document, never instead of it.
      expect(await fs.readFile(documentPath, "utf8")).toBe("# 标题\n");
      expect((await fs.stat(documentPath)).size).toBe(before.size);
    });

    it("内容不是文本时拒绝写入", async () => {
      const documentPath = path.join(tempDir, "a.md");
      await fs.writeFile(documentPath, "# a\n", "utf8");

      const saved = await markdownFiles.saveMindmapSidecar({ documentPath, content: { notes: {} } });

      expect(saved.success).toBe(false);
      await expect(fs.stat(markdownFiles.sidecarPathFor(documentPath))).rejects.toThrow();
    });
  });

  /**
   * Reading the file a reader picked to import.
   *
   * The parsers and everything after them are covered by mindmap-import.test.ts;
   * what can only be checked here is this end of it — that the bytes arrive as
   * they are, and that the one thing standing between the reader and a file that
   * should not be read into memory says no.
   */
  describe("导入文件的读取", () => {
    it("读成 base64，字节一模一样", async () => {
      const filePath = path.join(tempDir, "导出.xmind");
      // Written as bytes, not text: the point of this path is that it does not
      // pretend to know what the file is.
      const original = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x7f]);
      await fs.writeFile(filePath, original);

      const result = await markdownFiles.readOutlineFile(filePath);

      expect(result.success).toBe(true);
      expect(result.fileName).toBe("导出.xmind");
      expect(Buffer.from(result.contentBase64, "base64").equals(original)).toBe(true);
    });

    it("扩展名不再拦人：解析器会说出这是什么", async () => {
      // It used to check the extension to fail early. The parsers now read the
      // content and say what they found, and a reader whose exporter wrote .txt
      // should not be told their outline is not an outline.
      const filePath = path.join(tempDir, "大纲.txt");
      await fs.writeFile(filePath, '<opml version="2.0"><body><outline text="甲"/></body></opml>', "utf8");

      expect((await markdownFiles.readOutlineFile(filePath)).success).toBe(true);
    });

    it("太大的文件在读之前就拒绝", async () => {
      const filePath = path.join(tempDir, "巨大.xmind");
      // Sparse: the size is what is being tested, not the contents, and writing
      // 64MB of bytes to prove it would be a slow way to say the same thing. The
      // file has to exist first — truncate resizes, it does not create — and an
      // empty one stretched to the boundary is exactly the input this needs.
      await fs.writeFile(filePath, "");
      await fs.truncate(filePath, markdownFiles.MAX_OUTLINE_FILE_BYTES + 1);

      const result = await markdownFiles.readOutlineFile(filePath);

      expect(result.success).toBe(false);
      expect(result.message).toContain("太大");
    });

    it("目录与空路径各有各的说法", async () => {
      const asDirectory = await markdownFiles.readOutlineFile(tempDir);
      expect(asDirectory.success).toBe(false);
      expect(asDirectory.message).toContain("不是一个文件");

      expect((await markdownFiles.readOutlineFile("")).success).toBe(false);
    });

    it("文件不存在时说读不了，而不是崩掉", async () => {
      const result = await markdownFiles.readOutlineFile(path.join(tempDir, "没有这个文件.opml"));

      expect(result.success).toBe(false);
      expect(result.message).toContain("无法读取文件");
    });
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

  /**
   * The scan has to reach everything, and it did not.
   *
   * The depth ceiling was 6 and the file ceiling 3000, both silent — a folder
   * nested deeper than six levels lost whole subtrees, and a folder with more
   * than 3000 documents lost the rest. Neither produced a warning, so the only
   * thing the reader could conclude was that their documents were not there.
   * These are the two shapes that used to be wrong.
   */
  describe("深层与大量文件的目录扫描", () => {
    it("reaches a document nested far below the old depth ceiling", async () => {
      // Seven levels is already past the old limit of 6, and `专业课/第一学期/…/
      // 资料/期末` is a real folder someone would have.
      const deepDir = path.join(tempDir, "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8");
      await fs.mkdir(deepDir, { recursive: true });
      await fs.writeFile(path.join(deepDir, "深处.md"), "# 深处", "utf8");
      await fs.writeFile(path.join(tempDir, "顶层.md"), "# 顶层", "utf8");

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);

      expect(manifest.chapters.map((chapter: { src: string }) => chapter.src).sort()).toEqual([
        "L1/L2/L3/L4/L5/L6/L7/L8/深处.md",
        "顶层.md",
      ]);
      // A complete scan says nothing about being incomplete.
      expect(manifest.scanTruncated).toBeUndefined();
    });

    it("collects well past the old file ceiling without truncating", async () => {
      // 40 documents — three read batches, so the scan is exercised across the
      // batching boundary and proves it is not stopping early. The ceiling
      // itself is asserted against the exported constant below rather than by
      // creating thousands of files: this suite runs one fork and does real disk
      // I/O, and a fixture large enough to matter to the assertion is also large
      // enough to make the test fail on a busy machine and pass on an idle one.
      const wideDir = path.join(tempDir, "wide");
      await fs.mkdir(wideDir, { recursive: true });
      const total = 40;
      await Promise.all(
        Array.from({ length: total }, (_, index) =>
          fs.writeFile(path.join(wideDir, `n${String(index).padStart(4, "0")}.md`), "x", "utf8")
        )
      );

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);

      expect(manifest.chapters.length).toBe(total);
      expect(manifest.scanTruncated).toBeUndefined();
    }, 30000);

    it("keeps the ceilings clear of a real vault", () => {
      // The old values were 3000 files and 6 levels, and both failed silently.
      // Asserted against the exported constants so the number and the test cannot
      // drift apart.
      expect(markdownFiles.MAX_DIRECTORY_SCAN_FILES).toBeGreaterThanOrEqual(50000);
      expect(markdownFiles.MAX_DIRECTORY_SCAN_DEPTH).toBeGreaterThanOrEqual(32);
    });

    it("still skips ignored directories", async () => {
      const ignored = path.join(tempDir, "node_modules", "pkg");
      await fs.mkdir(ignored, { recursive: true });
      await fs.writeFile(path.join(ignored, "skip.md"), "# skip", "utf8");
      await fs.writeFile(path.join(tempDir, "keep.md"), "# keep", "utf8");

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);

      expect(manifest.chapters.map((chapter: { src: string }) => chapter.src)).toEqual(["keep.md"]);
    });

    it("reports a scan it had to cut short rather than dropping files silently", async () => {
      const files = await markdownFiles.collectMarkdownFilesDetailed(tempDir, tempDir);
      // The detailed form always answers with the truncation marker, present or
      // not — that is what the manifest and the review folder rows read.
      expect(files).toHaveProperty("truncated");
      expect(files.truncated).toBeNull();
      expect(Array.isArray(files.files)).toBe(true);
    });
  });

  /**
   * A directory that cannot be opened returns no entries — so it looks exactly
   * like an empty directory, and "empty" is the reading the reader will land on.
   * The failure has to travel back with the result instead of being folded into
   * "nothing in here".
   */
  describe("无法读取的目录", () => {
    it("reports the errno instead of answering an empty list", async () => {
      const missing = path.join(tempDir, "并不存在");

      const result = await markdownFiles.readDirectoryEntries(missing);

      expect(result.entries).toEqual([]);
      expect(result.error).toBeTruthy();
      expect(result.error.code).toBe("ENOENT");
    });

    it("reports a path that is a file rather than a directory", async () => {
      const filePath = path.join(tempDir, "是文件.md");
      await fs.writeFile(filePath, "# 内容", "utf8");

      const result = await markdownFiles.readDirectoryEntries(filePath);

      expect(result.entries).toEqual([]);
      expect(result.error).toBeTruthy();
      expect(result.error.code).toBe("ENOTDIR");
    });

    it("answers a readable directory with its entries and no error", async () => {
      const result = await markdownFiles.readDirectoryEntries(tempDir);

      expect(result.error).toBeNull();
      expect(Array.isArray(result.entries)).toBe(true);
    });

    it("leaves the manifest unmarked when every directory was readable", async () => {
      await fs.writeFile(path.join(tempDir, "正常.md"), "# 正常", "utf8");

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);

      // A clean scan says nothing about being clean, which is what makes the
      // marker worth reading when it is there.
      expect(manifest.scanUnreadable).toBeUndefined();
    });

    it("keeps unreadable directories out of the file list without failing the scan", async () => {
      await fs.writeFile(path.join(tempDir, "可见.md"), "# 可见", "utf8");

      const scan = await markdownFiles.collectMarkdownFilesDetailed(tempDir, tempDir);

      // `unreadable` is always an array, so the manifest can summarise it
      // without a presence check.
      expect(Array.isArray(scan.unreadable)).toBe(true);
      expect(scan.unreadable).toHaveLength(0);
      expect(scan.files).toHaveLength(1);
    });
  });

  /**
   * Names starting with `.` fall into two groups that used to be one rule:
   * tooling that is never a document, and the reader's own files hidden by a
   * naming convention they chose. Only the second is a preference.
   */
  describe("点开头的文件（隐藏文件）", () => {
    afterEach(() => {
      // Module-level setting, so it has to be put back or the next file's tests
      // inherit it.
      markdownFiles.setScanOptions({ includeHidden: false });
    });

    /** A vault with one visible note, one hidden note, and one hidden folder. */
    async function makeVault() {
      await fs.writeFile(path.join(tempDir, "可见.md"), "# 可见", "utf8");
      await fs.writeFile(path.join(tempDir, ".草稿.md"), "# 草稿", "utf8");
      const hiddenDir = path.join(tempDir, ".archive");
      await fs.mkdir(hiddenDir, { recursive: true });
      await fs.writeFile(path.join(hiddenDir, "旧稿.md"), "# 旧稿", "utf8");
    }

    it("hides them by default", async () => {
      await makeVault();

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);

      expect(manifest.chapters.map((c: { src: string }) => c.src)).toEqual(["可见.md"]);
      // Nothing is marked hidden when nothing hidden is listed — the flag only
      // appears on documents that are actually in the tree.
      expect(manifest.chapters.every((c: { hidden?: boolean }) => c.hidden === undefined)).toBe(true);
    });

    it("lists them when asked, and marks them", async () => {
      await makeVault();
      markdownFiles.setScanOptions({ includeHidden: true });

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      const sources = manifest.chapters.map((c: { src: string }) => c.src);

      // Membership, not an exact order: how two hidden names sort against each
      // other is the collator's business, and pinning it here would make this
      // test fail on a Node upgrade for no reason. The order rule that matters
      // is asserted on its own below.
      expect(sources).toHaveLength(3);
      expect([...sources].sort()).toEqual(["可见.md", ".archive/旧稿.md", ".草稿.md"].sort());

      const hidden = manifest.chapters
        .filter((c: { hidden?: boolean }) => c.hidden === true)
        .map((c: { src: string }) => c.src);
      expect([...hidden].sort()).toEqual([".archive/旧稿.md", ".草稿.md"].sort());
      // The visible one is not marked.
      expect(manifest.chapters.find((c: { src: string }) => c.src === "可见.md").hidden).toBeUndefined();
    });

    it("sorts hidden documents after the visible ones", async () => {
      await makeVault();
      markdownFiles.setScanOptions({ includeHidden: true });

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      const firstHidden = manifest.chapters.findIndex((c: { hidden?: boolean }) => c.hidden === true);
      const lastVisible = manifest.chapters
        .map((c: { hidden?: boolean }) => c.hidden === true)
        .lastIndexOf(false);

      // The visible block is contiguous and comes first: turning the preference
      // on appends, rather than interleaving.
      expect(lastVisible).toBeLessThan(firstHidden);
    });

    it("marks a document hidden when a folder above it is", async () => {
      await makeVault();
      markdownFiles.setScanOptions({ includeHidden: true });

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      const inside = manifest.chapters.find((c: { src: string }) => c.src === ".archive/旧稿.md");

      // Its own name has no dot; the folder's does, and the folder is what the
      // reader hid.
      expect(inside.hidden).toBe(true);
    });

    it("still skips tooling directories even when hidden files are shown", async () => {
      await makeVault();
      const gitDir = path.join(tempDir, ".git");
      const modulesDir = path.join(tempDir, "node_modules", "pkg");
      await fs.mkdir(gitDir, { recursive: true });
      await fs.mkdir(modulesDir, { recursive: true });
      await fs.writeFile(path.join(gitDir, "notes.md"), "# 不是文档", "utf8");
      await fs.writeFile(path.join(modulesDir, "readme.md"), "# 不是文档", "utf8");
      markdownFiles.setScanOptions({ includeHidden: true });

      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      const sources = manifest.chapters.map((c: { src: string }) => c.src);

      // The preference is about the reader's own files. It must not be able to
      // drag a repository's internals into the tree.
      expect(sources).not.toContain(".git/notes.md");
      expect(sources.some((src: string) => src.includes("node_modules"))).toBe(false);
    });

    it("ignores a non-boolean includeHidden rather than flipping it on", async () => {
      await makeVault();

      // A renderer sending `"yes"` or `1` is a bug on the other side; the safe
      // reading of it is "not asked for", not "show everything".
      markdownFiles.setScanOptions({ includeHidden: "yes" });
      let manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      expect(manifest.chapters).toHaveLength(1);

      markdownFiles.setScanOptions({ includeHidden: 1 });
      manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      expect(manifest.chapters).toHaveLength(1);
    });

    it("survives being handed nothing at all", async () => {
      await makeVault();
      markdownFiles.setScanOptions({ includeHidden: true });
      markdownFiles.setScanOptions(null);
      markdownFiles.setScanOptions(undefined);

      // A malformed call must not throw and must not change the setting: the
      // last valid value stands.
      const manifest = await markdownFiles.buildDirectoryManifest(tempDir);
      expect(manifest.chapters).toHaveLength(3);
    });
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
