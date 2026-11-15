import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocumentSession } from "../hooks/useDocumentSession";
import { renderMarkdown } from "../services/markdown";
import type { RenderedChapter } from "../core/types";

vi.mock("../services/markdown", () => ({ renderMarkdown: vi.fn() }));
const rendered = (html: string) =>
  ({ html, plainText: html, headings: [] }) as unknown as RenderedChapter;
const params = (source: string, id = "note") => ({
  chapterId: id,
  absolutePath: `C:/${id}.md`,
  fileName: `${id}.md`,
  baseUrl: "",
  source,
  diskVersion: null,
  writable: true,
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("live preview session rendering", () => {
  it("cancels a pending edit render when discarding changes", async () => {
    vi.useFakeTimers();
    vi.mocked(renderMarkdown).mockImplementation(async (source) => rendered(source));
    const { result } = renderHook(() => useDocumentSession());
    await act(async () => result.current.openSession(params("original")));
    act(() => result.current.updateSource("discard me"));
    await act(async () => result.current.discardChanges());
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current.session?.source).toBe("original");
    expect(result.current.renderedChapter?.html).toBe("original");
  });
  it("debounces editing renders and awaits an explicit refresh before printing", async () => {
    vi.useFakeTimers();
    vi.mocked(renderMarkdown).mockImplementation(async (source) => rendered(source));
    const { result } = renderHook(() => useDocumentSession());
    await act(async () => result.current.openSession(params("original")));
    act(() => {
      result.current.setViewMode("live");
      result.current.updateSource("latest");
    });
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(result.current.renderedChapter?.html).toBe("latest");
    act(() => result.current.updateSource("print me"));
    await act(async () => result.current.renderPreviewNow());
    expect(result.current.renderedChapter?.html).toBe("print me");
  });

  it("refreshes paused large documents when returning to reading", async () => {
    vi.mocked(renderMarkdown).mockImplementation(async (source) => rendered(source));
    const { result } = renderHook(() => useDocumentSession());
    await act(async () => result.current.openSession(params("original")));
    act(() => result.current.setViewMode("live"));
    const largeSource = "# latest\n" + "x".repeat(2_000_001);
    act(() => result.current.updateSource(largeSource));
    expect(result.current.autoPreviewPaused).toBe(true);
    expect(result.current.renderedChapter?.html).toBe("original");
    await act(async () => result.current.setViewMode("read"));
    expect(result.current.renderedChapter?.html).toBe(largeSource);
  });

  it("rejects stale render completions after a file switch or closing the session", async () => {
    const finishes: ((value: RenderedChapter) => void)[] = [];
    vi.mocked(renderMarkdown).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve);
        }),
    );
    const { result } = renderHook(() => useDocumentSession());
    act(() => result.current.openSession(params("first", "first")));
    act(() => result.current.openSession(params("second", "second")));
    await act(async () => finishes[1](rendered("second")));
    await act(async () => finishes[0](rendered("first")));
    expect(result.current.renderedChapter?.html).toBe("second");
    act(() => result.current.openSession(params("third", "third")));
    act(() => result.current.closeSession());
    await act(async () => finishes[2](rendered("third")));
    expect(result.current.renderedChapter).toBeNull();
  });
});
