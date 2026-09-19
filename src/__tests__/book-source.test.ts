import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPackagedBook, loadPackagedChapterMarkdown } from "../services/bookSource";
import type { BookManifest } from "../core/types";

/**
 * The book that ships inside the app, and the loader the web build falls back to.
 *
 * The module had no tests, and its loader used to be named `loadChapterMarkdown` — which
 * promises more than it does. With a desktop bridge, App reads a chapter from disk and
 * this is never reached; without one, the only book there is, is the packaged one. Both
 * of those are pinned here, because the second is what makes the hard-coded
 * `books/demo/` path correct rather than a bug.
 */
describe("打包书与它的章节", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("打包书就是一份合法清单", async () => {
    const manifest = await loadPackagedBook();

    expect(manifest.chapters.length).toBeGreaterThan(0);
    expect(manifest.chapters.every((chapter) => chapter.id && chapter.title && chapter.src)).toBe(
      true
    );
  });

  it("包里的章节直接给出来，不发网络请求", async () => {
    // The bundle carries its own chapters so the app works offline and over `file://`,
    // where a fetch would fail.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const manifest = await loadPackagedBook();

    const source = await loadPackagedChapterMarkdown(manifest, manifest.chapters[0].id);

    expect(source.markdown.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("不认识的章节 id：报错里带着那个 id", async () => {
    const manifest = await loadPackagedBook();

    await expect(loadPackagedChapterMarkdown(manifest, "不存在的章节")).rejects.toThrow(
      "不存在的章节"
    );
  });

  it("包外的章节走 fetch，路径与 baseUrl 都落在书旁边", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve("# 别的章节") });
    vi.stubGlobal("fetch", fetchMock);
    const manifest: BookManifest = {
      id: "other",
      title: "别的书",
      chapters: [{ id: "x", title: "别的", src: "x.md" }],
    };

    const source = await loadPackagedChapterMarkdown(manifest, "x");

    expect(source.markdown).toBe("# 别的章节");
    expect(fetchMock).toHaveBeenCalledWith("books/demo/x.md");
    // Relative to the page, so images beside the chapter resolve.
    expect(source.baseUrl).toContain("books/demo/");
  });

  it("fetch 不成功时，说的是哪一章、什么状态", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const manifest: BookManifest = {
      id: "other",
      title: "别的书",
      chapters: [{ id: "x", title: "找不到的章节", src: "x.md" }],
    };

    // A bare "failed to load" sends the reader looking for the wrong problem: naming the
    // chapter and the status is what says whether it is missing or the network is.
    await expect(loadPackagedChapterMarkdown(manifest, "x")).rejects.toThrow(/找不到的章节.*404/);
  });
});
