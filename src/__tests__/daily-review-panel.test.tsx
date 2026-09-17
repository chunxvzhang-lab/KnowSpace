import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DailyReviewPanel } from "../components/DailyReviewPanel";
import { computeCardId } from "../services/fsrsService";
import type { FlashNoteSummaryItem } from "../types/desktop";

/**
 * Dispatches a real keydown on window.
 *
 * `fireEvent.keyDown(window, …)` does not reliably reach a
 * `window.addEventListener("keydown")` listener under jsdom, so the panel's
 * keyboard flow is exercised with a genuine event instead.
 */
function pressKey(key: string, code?: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
  });
}

/** Builds a Space note carrying a single inline flashcard. */
function makeNote(
  overrides: Partial<FlashNoteSummaryItem> & { content: string; filePath: string }
): FlashNoteSummaryItem {
  return {
    fileName: overrides.filePath.split(/[\\/]/).pop() ?? "note.md",
    dateStr: "2026-09-17",
    timeDisplay: "09:00",
    modifiedTime: 0,
    size: overrides.content.length,
    todos: [],
    tags: [],
    ...overrides,
  };
}

/** Two cards in one note and one in another — three due cards in total. */
const THREE_CARDS: FlashNoteSummaryItem[] = [
  makeNote({
    filePath: "C:/Space/2026-09-17_0900.md",
    content: "问题甲 :: 答案甲\n\n问题乙 :: 答案乙",
  }),
  makeNote({
    filePath: "C:/Space/2026-09-16_2100.md",
    content: "Q: 问题丙？\nA: 答案丙",
  }),
];

describe("DailyReviewPanel - 每日复盘视图", () => {
  let saveMarkdownFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveMarkdownFile = vi.fn().mockResolvedValue({ success: true, absolutePath: "x" });
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = { saveMarkdownFile };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("没有闪卡时显示引导空态", () => {
    render(<DailyReviewPanel notes={[makeNote({ filePath: "a.md", content: "普通段落，没有卡片。" })]} />);

    expect(screen.getByText("Space 里还没有闪卡")).toBeDefined();
    // The guidance names all three supported syntaxes
    expect(screen.getByText(/问题 :: 答案/)).toBeDefined();
  });

  it("渲染第一张卡片的正面并隐藏答案", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    expect(screen.getByText("问题甲")).toBeDefined();
    expect(screen.queryByText("答案甲")).toBeNull();
    expect(screen.getByText(/按/)).toBeDefined();
  });

  it("显示来源笔记名与卡片类型徽标", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    expect(screen.getByText("2026-09-17_0900.md")).toBeDefined();
    expect(screen.getByText("行内")).toBeDefined();
  });

  it("点击卡片显示答案", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    fireEvent.click(screen.getByText("问题甲"));

    expect(screen.getByText("答案甲")).toBeDefined();
  });

  it("点击「显示答案」按钮同样可以翻面", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    fireEvent.click(screen.getByText("显示答案"));

    expect(screen.getByText("答案甲")).toBeDefined();
  });

  it("未翻面时不显示评分按钮", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    expect(screen.queryByText("重来")).toBeNull();
    expect(screen.queryByText("简单")).toBeNull();
  });

  it("翻面后显示四个评分档位与预计间隔", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));

    expect(screen.getByText("重来")).toBeDefined();
    expect(screen.getByText("困难")).toBeDefined();
    expect(screen.getByText("良好")).toBeDefined();
    expect(screen.getByText("简单")).toBeDefined();

    // Each button shows the interval that rating would produce
    expect(screen.getAllByText(/天后|明天/).length).toBe(4);
  });

  it("按空格键翻面", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    pressKey(" ", "Space");

    expect(screen.getByText("答案甲")).toBeDefined();
  });

  it("按数字键 3 评分并写回笔记", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));

    pressKey("3");

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    });

    const request = saveMarkdownFile.mock.calls[0][0];
    expect(request.absolutePath).toBe("C:/Space/2026-09-17_0900.md");
    // Progress is persisted as an HTML comment block
    expect(request.content).toContain("<!-- fsrs:begin");
    expect(request.content).toContain("fsrs:end -->");
    expect(request.content).toContain("state=review");
    // The card text itself is untouched
    expect(request.content).toContain("问题甲 :: 答案甲");
  });

  it("评分后前进到下一张卡片", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));

    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });

    await waitFor(() => {
      expect(screen.getByText("问题乙")).toBeDefined();
    });
    // The answer is hidden again for the new card
    expect(screen.queryByText("答案乙")).toBeNull();
  });

  it("父组件刷新笔记列表后仍停在下一张，不退回第一张", async () => {
    // The panel asks its parent to reload after every rating, and the parent
    // hands back a fresh notes array. The queue is rebuilt from it — and the
    // previous implementation reset its cursor to zero on that rebuild, so
    // rating a card put the first card back on screen and looked like it had
    // done nothing. The test above passes either way because it never re-renders
    // with new notes; this one is the case that was broken.
    const { rerender } = render(<DailyReviewPanel notes={THREE_CARDS} />);

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(screen.getByText("问题乙")).toBeDefined());

    // The parent reload: same notes, new array identity.
    await act(async () => {
      rerender(<DailyReviewPanel notes={THREE_CARDS.map((note) => ({ ...note }))} />);
    });

    expect(screen.getByText("问题乙")).toBeDefined();
    expect(screen.queryByText("问题甲")).toBeNull();
  });

  it("父组件刷新后本轮进度与统计不会重置", async () => {
    // The same rebuild used to clear the session log, so a completed session
    // could never show its summary — `log.length` was always zero by then.
    const { rerender } = render(<DailyReviewPanel notes={THREE_CARDS} />);

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(screen.getByText(/1 \/ 3/)).toBeDefined());

    await act(async () => {
      rerender(<DailyReviewPanel notes={THREE_CARDS.map((note) => ({ ...note }))} />);
    });

    // One rated, two still to go — the totals must not shrink under the reader.
    expect(screen.getByText(/1 \/ 3/)).toBeDefined();
  });

  it("评为「重来」会写入重置后的进度", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));

    await act(async () => {
      fireEvent.click(screen.getByText("重来"));
    });

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalled());

    const request = saveMarkdownFile.mock.calls[0][0];
    expect(request.content).toContain("lapses=1");
    expect(request.content).toContain("state=relearning");
  });

  it("同一篇笔记的第二张卡会在前一次写入的基础上继续合并", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    // Grade both cards of the first note (they are the first two in the queue)
    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("问题乙")).toBeDefined());

    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));

    // The second write must still contain the first card's progress, otherwise
    // the earlier rating would be silently discarded.
    const secondContent = saveMarkdownFile.mock.calls[1][0].content;
    const lines = secondContent.split("\n").filter((l: string) => l.startsWith("fsrs-"));
    expect(lines.length).toBe(2);
  });

  it("全部评完后显示完成态与本轮统计", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByText("显示答案"));
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        fireEvent.click(screen.getByText("良好"));
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/今日复习完成/)).toBeDefined();
    });
    expect(screen.getByText("本轮复习")).toBeDefined();
    expect(screen.getByText("3 张")).toBeDefined();
  });

  it("保存失败时给出提示且不前进", async () => {
    saveMarkdownFile.mockResolvedValueOnce({ success: false, message: "磁盘只读" });
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));

    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });

    await waitFor(() => {
      expect(screen.getByText(/保存失败/)).toBeDefined();
    });
    // Still on the same card
    expect(screen.getByText("问题甲")).toBeDefined();
  });

  it("在输入框内按键不会触发翻面或评分", () => {
    render(
      <div>
        <input data-testid="probe" />
        <DailyReviewPanel notes={THREE_CARDS} />
      </div>
    );

    const input = screen.getByTestId("probe");
    act(() => {
      fireEvent.keyDown(input, { key: " ", code: "Space" });
      fireEvent.keyDown(input, { key: "3" });
    });

    // The answer must stay hidden — the guard treats inputs as "editing"
    expect(screen.queryByText("答案甲")).toBeNull();
    expect(saveMarkdownFile).not.toHaveBeenCalled();
  });

  it("头部显示待复习数量与进度", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    expect(screen.getByText("3 张待复习")).toBeDefined();
    expect(screen.getByText("0 / 3")).toBeDefined();
    expect(screen.getByText(/共 3 张/)).toBeDefined();
  });

  it("点击刷新重新开始本轮", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    fireEvent.click(screen.getByText("显示答案"));
    await act(async () => {
      fireEvent.click(screen.getByText("良好"));
    });
    await waitFor(() => expect(screen.getByText("问题乙")).toBeDefined());

    fireEvent.click(screen.getByTitle("重新开始本轮"));

    expect(screen.getByText("问题甲")).toBeDefined();
  });

  it("未到期的卡片不会进入今日队列", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureKey = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
      future.getDate()
    ).padStart(2, "0")}`;

    // The metadata entry must carry the card's real content-derived id, which
    // is the whole point of that id being content-based: a made-up one simply
    // would not match and the card would look unreviewed (and therefore due).
    const cardId = computeCardId("inline", "未来卡");
    const note = makeNote({
      filePath: "C:/Space/scheduled.md",
      content:
        `未来卡 :: 答案\n\n<!-- fsrs:begin\n` +
        `${cardId} S=30.0000 D=5.0000 due=${futureKey} reps=5 lapses=0 state=review last=2026-09-01\n` +
        `fsrs:end -->`,
    });

    render(<DailyReviewPanel notes={[note]} />);

    // The card exists in the library but is not due, so today's queue is empty
    expect(screen.getByText(/今日复习完成/)).toBeDefined();
    expect(screen.getByText(/共 1 张/)).toBeDefined();
  });

  it("到期的卡片会进入队列", () => {
    const cardId = computeCardId("inline", "待复习卡");
    const note = makeNote({
      filePath: "C:/Space/due.md",
      content:
        `待复习卡 :: 答案\n\n<!-- fsrs:begin\n` +
        `${cardId} S=1.0000 D=5.0000 due=2026-01-01 reps=2 lapses=0 state=review last=2025-12-31\n` +
        `fsrs:end -->`,
    });

    render(<DailyReviewPanel notes={[note]} />);

    expect(screen.getByText("待复习卡")).toBeDefined();
    expect(screen.getByText("1 张待复习")).toBeDefined();
  });
});
