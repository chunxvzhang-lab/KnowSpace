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
function pressKey(key: string, code?: string, modifiers: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, ...modifiers }));
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

/**
 * One step of undo.
 *
 * "重来" sits one key away from "良好", and the wrong one silently moves a card's
 * schedule — a lapse it did not have, an interval it did not earn. Nothing on screen
 * says so afterwards, and the reader's only other recourse was editing the metadata
 * block by hand.
 */
describe("DailyReviewPanel - 撤销上一次评分", () => {
  let saveMarkdownFile: ReturnType<typeof vi.fn>;
  let readMarkdownFile: ReturnType<typeof vi.fn>;

  /** What the file on disk holds, which is the last thing written to it. */
  const onDisk = () => String(saveMarkdownFile.mock.calls.at(-1)?.[0]?.content ?? "");
  const savedContent = () => onDisk();

  beforeEach(() => {
    saveMarkdownFile = vi.fn().mockResolvedValue({ success: true });
    // A real file, modelled honestly: reading gives back what was last written, or the
    // note as it started. Anything else would make the merge look better than it is.
    readMarkdownFile = vi.fn();
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile,
      readMarkdownFile,
    };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  const installDisk = (note: FlashNoteSummaryItem) => {
    readMarkdownFile.mockImplementation(() =>
      Promise.resolve({ markdown: onDisk() || note.content, baseUrl: "" })
    );
  };

  it("还没评分时没有撤销按钮", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    expect(screen.queryByTitle(/撤销上一次评分/)).toBeNull();
  });

  it("给从没复习过的卡片撤销：连那一行也收回去", async () => {
    const note = makeNote({ filePath: "C:/Space/fresh.md", content: "问题甲 :: 答案甲" });
    installDisk(note);
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(savedContent()).toContain("fsrs-");

    fireEvent.click(screen.getByTitle(/撤销上一次评分/));

    // A card that had no row of its own gets no row back: the note is left exactly as
    // it was, byte for byte — block gone, and the blank line it was appended after
    // gone with it, because that blank line is a mark of the block too.
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));
    expect(savedContent()).not.toContain("fsrs-");
    expect(savedContent()).toBe("问题甲 :: 答案甲");
  });

  it("给复习过的卡片撤销：写回的是它原来的调度", async () => {
    const cardId = computeCardId("inline", "复习过的卡");
    const note = makeNote({
      filePath: "C:/Space/tracked.md",
      content:
        `复习过的卡 :: 答案\n\n<!-- fsrs:begin\n` +
        `${cardId} S=1.0000 D=5.0000 due=2026-01-01 reps=2 lapses=0 state=review last=2025-12-31\n` +
        `fsrs:end -->`,
    });
    installDisk(note);
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(savedContent()).toContain("reps=3");

    fireEvent.click(screen.getByTitle(/撤销上一次评分/));

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));
    const restored = /S=([\d.]+) D=([\d.]+) due=(\S+) reps=(\d+)/.exec(savedContent());
    expect(restored?.slice(1)).toEqual(["1.0000", "5.0000", "2026-01-01", "2"]);
  });

  it("撤销之后，那张卡回到眼前", async () => {
    const note = makeNote({ filePath: "C:/Space/back.md", content: "问题甲 :: 答案甲" });
    installDisk(note);
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    // The queue is empty, so the panel is on the completion screen.
    await waitFor(() => expect(screen.getByText(/今日复习完成/)).toBeDefined());

    fireEvent.click(screen.getByTitle(/撤销上一次评分/));

    // Taking the rating back hands the card back: it has not been reviewed, so it is
    // the card being asked about again.
    await waitFor(() => expect(screen.getByText("问题甲")).toBeDefined());
  });

  it("Ctrl+Z 与按钮等效", async () => {
    const note = makeNote({ filePath: "C:/Space/keys.md", content: "问题甲 :: 答案甲" });
    installDisk(note);
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    pressKey("z", undefined, { ctrlKey: true });

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));
    expect(savedContent()).not.toContain("fsrs-");
  });

  it("读不到文件就不撤销，并留着那一步等重试", async () => {
    const note = makeNote({ filePath: "C:/Space/unreadable.md", content: "问题甲 :: 答案甲" });
    readMarkdownFile.mockRejectedValue(new Error("读不了"));
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle(/撤销上一次评分/));

    // Refusing is the honest answer: without the file's own text there is nothing to
    // put a row back into. The step is still there to try again, and the card has not
    // been handed back — nothing happened at all.
    await waitFor(() => expect(screen.getByText(/撤销失败/)).toBeDefined());
    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle(/撤销上一次评分/)).toBeDefined();
  });
});

/**
 * The parts of the review flow the first round of tests left unexercised: three of
 * the four rating keys, revealing and un-revealing, and the two ways a save can go
 * wrong. They are cheap to check and they are what a reader actually presses.
 */
describe("DailyReviewPanel - 评分与保存的边角", () => {
  let saveMarkdownFile: ReturnType<typeof vi.fn>;
  let readMarkdownFile: ReturnType<typeof vi.fn>;

  const savedContent = () => String(saveMarkdownFile.mock.calls.at(-1)?.[0]?.content ?? "");

  beforeEach(() => {
    saveMarkdownFile = vi.fn().mockResolvedValue({ success: true, absolutePath: "x" });
    // By default the file on disk is whatever the panel was given, which is the
    // ordinary case: nothing wrote to it between loading and rating.
    readMarkdownFile = vi.fn();
    (window as unknown as Record<string, unknown>).knowSpaceDesktop = {
      saveMarkdownFile,
      readMarkdownFile,
    };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("数字键 1（重来）写进的是重学态", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");

    pressKey("1");

    // Waiting for the write: it now happens one await further along, because the file
    // is read again first so the merge goes into what is actually there.
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    // The first rating of a new card, rated Again: relearning, and a lapse counted.
    expect(savedContent()).toContain("state=relearning");
    expect(savedContent()).toContain("lapses=1");
  });

  it("数字键 2（困难）与数字键 4（简单）都能评分", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");
    pressKey("2");
    // Waiting for the write to land before going on: the panel is mid-save until
    // then, and a second keypress while it is would be swallowed by the guard rather
    // than rating the next card.
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(savedContent()).toContain("state=review");

    pressKey(" ");
    pressKey("4");
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(2));
  });

  it("四个按钮上的间隔预览与评分档位同序", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");

    const previewDays = (label: string) => {
      const button = screen.getByText(label).closest("button");
      const text = button?.querySelector(".dr-rate-interval")?.textContent ?? "";
      return text === "明天" ? 1 : Number(/(\d+) 天后/.exec(text)?.[1] ?? 0);
    };

    // The preview is what the reader decides on, so it has to agree with the rating
    // above it. A "简单" button advertising a shorter wait than "良好" would be
    // telling them the wrong thing about a choice they are about to make — and the
    // four previews are computed independently, which is exactly how they could.
    expect(previewDays("困难")).toBeLessThanOrEqual(previewDays("良好"));
    expect(previewDays("良好")).toBeLessThanOrEqual(previewDays("简单"));
    expect(previewDays("简单")).toBeGreaterThan(0);
  });

  it("再按一次空格翻回正面，评分按钮随之收起", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    pressKey(" ");
    expect(screen.getByText("良好")).toBeDefined();

    pressKey(" ");

    // The card is a question again, and the four buttons are gone with the answer.
    expect(screen.queryByText("良好")).toBeNull();
    expect(screen.getByText("显示答案")).toBeDefined();
  });

  it("卡片聚焦时按回车也能翻面", () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);

    const card = screen.getByRole("button", { name: /问题甲/ });
    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByText("答案甲")).toBeDefined();
  });

  it("保存抛异常时给出提示，并且不前进", () => {
    // `{ success: false }` was covered; a rejected promise was not, and it is the
    // one that arrives unannounced from a disconnected bridge.
    saveMarkdownFile.mockRejectedValue(new Error("磁盘已满"));
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");

    fireEvent.click(screen.getByText("良好"));

    return waitFor(() => expect(screen.getByText(/保存失败/)).toBeDefined()).then(() => {
      // Still on the same card: losing the answer would lose the reader's place too.
      expect(screen.getByText("问题甲")).toBeDefined();
      expect(screen.getByText("答案甲")).toBeDefined();
    });
  });

  it("评分请求带着 force，而它现在是安全的", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");

    fireEvent.click(screen.getByText("良好"));

    // Still forced: the version check refuses a write whenever anyone else has touched
    // the file, and a review must not be blocked by that. It is safe now because the
    // content being written is the file's own current content plus one metadata block
    // — see the "别处改过同一文件" case above, which is what makes this a contract
    // rather than a hope.
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(saveMarkdownFile.mock.calls.at(-1)?.[0]).toMatchObject({ force: true });
  });

  it("复习期间别处改过同一文件：别人的改动与本次进度都在", async () => {
    // The panel holds a copy of the note from when it loaded, and a review can be open
    // for a while: another editor, a sync client or the capture flow writes to the same
    // file in the meantime. Writing that copy back whole loses the other edit — and the
    // only thing a rating means to change is its own metadata block, so it is merged
    // into what is actually in the file now.
    const note = makeNote({ filePath: "C:/Space/edited.md", content: "问题甲 :: 答案甲" });
    readMarkdownFile.mockResolvedValue({
      markdown: "问题甲 :: 答案甲\n\n别人刚写下的一段。",
      baseUrl: "",
    });
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    expect(savedContent()).toContain("别人刚写下的一段。");
    expect(savedContent()).toContain("fsrs-");
  });

  it("卡片在别处被删掉了：不再把它的进度写回去", async () => {
    // The same re-read, seen from the other side: the reader deleted the card while the
    // review was open, so re-adding its scheduling row would leave the file claiming
    // progress for a card that is not there any more.
    const note = makeNote({ filePath: "C:/Space/gone.md", content: "要删的 :: 答案" });
    readMarkdownFile.mockResolvedValue({ markdown: "这篇现在只剩正文了。", baseUrl: "" });
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    expect(savedContent()).toContain("这篇现在只剩正文了。");
    expect(savedContent()).not.toContain("fsrs-");
  });

  it("重读失败时退回手里的副本，照样存得下去", async () => {
    // The re-read is a courtesy to other writers, not a requirement: a file that cannot
    // be read right now still has to take the rating, or a failing read would block
    // reviewing altogether.
    const note = makeNote({ filePath: "C:/Space/unreadable.md", content: "问题甲 :: 答案甲" });
    readMarkdownFile.mockRejectedValue(new Error("读不了"));
    render(<DailyReviewPanel notes={[note]} />);

    pressKey(" ");
    fireEvent.click(screen.getByText("良好"));
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));

    expect(savedContent()).toContain("fsrs-");
  });

  it("连点评分只写一次", async () => {
    render(<DailyReviewPanel notes={THREE_CARDS} />);
    pressKey(" ");

    const good = screen.getByText("良好");
    fireEvent.click(good);
    fireEvent.click(good);

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
  });
});
