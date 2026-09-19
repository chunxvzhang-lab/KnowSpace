import { describe, expect, it } from "vitest";
import {
  FSRS_DEFAULT_PARAMS,
  buildReviewQueue,
  computeCardId,
  createNewProgress,
  parseFlashcards,
  parseFsrsMetadata,
  review,
  serializeFsrsMetadata,
  summarize,
  type FsrsProgress,
} from "../services/fsrsService";

/**
 * 闪卡功能：打那些**还没有测试覆盖**、且从代码里读着可疑的地方。
 *
 * 每一条的期望都按代码自己写下的意图来写（注释、命名、类型），而不是按现在跑出来的
 * 结果来写 —— 否则测的只是"它现在这样"，不是"它该这样"。
 */

const Q = "Q: 问题\nA: 答案\n";

/** 一张已经复习过、有历史的卡片进度。 */
function tracked(overrides: Partial<FsrsProgress> = {}): FsrsProgress {
  return {
    stability: 10,
    difficulty: 5,
    due: "2026-09-19",
    reps: 3,
    lapses: 0,
    state: "review",
    last: "2026-09-09",
    ...overrides,
  };
}

describe("闪卡验证 - 同一天再次评分（短时权重）", () => {
  it("今天已复习过、今天再评『重来』：用短时权重，且明天再来", () => {
    // The path at fsrsService.ts:355-358: elapsed < 1 day means the card was
    // reviewed today, and FSRS-5 has dedicated short-term weights for that. The
    // existing tests only ever lapse a card 30 days later, so this branch has never
    // been executed by a test.
    const today = new Date(2026, 8, 19, 15, 0, 0);
    const progress = tracked({ last: "2026-09-19", due: "2026-09-19" });

    const result = review(
      { id: "x", kind: "qa", front: "f", back: "b", line: 1 },
      progress,
      1,
      today
    );

    // w17 is the same-day stability weight; using the 30-day lapse formula here
    // would give a very different number, and the card would come back at the wrong
    // time for a card that was *just* seen.
    expect(result.progress.stability).toBe(FSRS_DEFAULT_PARAMS[17]);
    expect(result.intervalDays).toBe(1);
    expect(result.progress.due).toBe("2026-09-20");
    expect(result.progress.lapses).toBe(1);
    expect(result.progress.state).toBe("relearning");
  });
});

describe("闪卡验证 - 学习态", () => {
  it("评分不会产出『学习』态（它只在文件里被读到）", () => {
    // fsrsService.ts:375-384. The branch tests `intervalDays < 1`, and
    // `nextInterval` returns at least 1 (line 257), so it can never be taken — while
    // the comment above it describes a learning phase the app does not have. This
    // build schedules by whole days: a card is new until its first rating and in
    // review from then on. Pinning that means a reader of the file (or of the next
    // change to this function) is not told otherwise.
    const today = new Date(2026, 8, 19, 15, 0, 0);
    const card = { id: "x", kind: "qa" as const, front: "f", back: "b", line: 1 };

    const fresh = review(card, createNewProgress("2026-09-19"), 3, today);
    const again = review(card, fresh.progress, 3, today);
    const fromLearning = review(card, tracked({ state: "learning" }), 3, today);

    expect([fresh.progress.state, again.progress.state, fromLearning.progress.state]).toEqual([
      "review",
      "review",
      "review",
    ]);
  });
});

describe("闪卡验证 - 同一张卡出现在两篇笔记里", () => {
  // A card's identity is its content (computeCardId), so the same question written
  // in two notes is one card. The queue shows it once — the panel skips an id it has
  // already rated (DailyReviewPanel.tsx:159) — so anything that counts it twice is a
  // number the reader can never satisfy.
  const question = "- 什么是间隔重复 :: 一种复习方法\n";
  const notes = [
    { path: "C:\\Space\\a.md", content: question },
    { path: "C:\\Space\\b.md", content: question },
  ];

  it("队列里只出现一次", () => {
    const queue = buildReviewQueue(notes, new Date(2026, 8, 19, 12, 0, 0));

    expect(queue).toHaveLength(1);
  });

  it("统计里也算一张，而不是两张", () => {
    const stats = summarize(notes, new Date(2026, 8, 19, 12, 0, 0));

    // Otherwise the header says "共 2 张" while the caption underneath counts
    // "0 / 1", and the progress bar can never reach the end.
    expect(stats.total).toBe(1);
    expect(stats.due).toBe(1);
  });
});

describe("闪卡验证 - 已经不存在的卡片不再留记录", () => {
  it("文档里一张卡都不剩时，进度块整个消失", () => {
    // The filter in serializeFsrsMetadata was conditional on there being at least one
    // live card ("liveIds.size > 0 && …"), so with none left it skipped the filter
    // entirely and wrote *every* row back — a file claiming scheduling history for
    // cards that are not in it. The panel's re-read-and-merge is what made it visible:
    // a rating written into a note whose card had just been deleted kept the row alive.
    const id = computeCardId("inline", "要删的");
    const withMeta =
      `要删的 :: 答案\n\n<!-- fsrs:begin\n` +
      `${id} S=1.0000 D=5.0000 due=2026-01-01 reps=1 lapses=0 state=review\n` +
      `fsrs:end -->\n`;
    const deleted = "这篇现在只剩正文了。";

    const written = serializeFsrsMetadata(deleted, parseFsrsMetadata(withMeta));

    expect(written).toBe(deleted);
    expect(written).not.toContain("fsrs-");
  });

  it("还剩别的卡时，只有被删掉那张的行消失", () => {
    const gone = computeCardId("inline", "要删的");
    const kept = computeCardId("inline", "留着的");
    const withMeta =
      `要删的 :: 答案\n\n留着的 :: 答案\n\n<!-- fsrs:begin\n` +
      `${gone} S=1.0000 D=5.0000 due=2026-01-01 reps=1 lapses=0 state=review\n` +
      `${kept} S=2.0000 D=5.0000 due=2026-02-01 reps=2 lapses=0 state=review\n` +
      `fsrs:end -->\n`;
    const edited = "留着的 :: 答案";

    const written = serializeFsrsMetadata(edited, parseFsrsMetadata(withMeta));

    expect(written).toContain(kept);
    expect(written).not.toContain(gone);
  });
});

describe("闪卡验证 - 卡片识别", () => {
  it("同一条问题在两篇笔记里得到同一个 id", () => {
    const [a] = parseFlashcards("- 什么是间隔重复 :: 一种复习方法");
    const [b] = parseFlashcards("- 什么是间隔重复 :: 一种复习方法");

    expect(a.id).toBe(b.id);
    // Same id, but each parse keeps its own card object: the panel maps the id to
    // whichever note it saw first.
    expect(a.front).toBe(b.front);
  });

  it("大小写与首尾空白不影响身份，改字才影响", () => {
    const [lower] = parseFlashcards("- what is fsrs :: a scheduler");
    const [upper] = parseFlashcards("-  What is FSRS   :: a scheduler");

    expect(lower.id).toBe(upper.id);
    expect(parseFlashcards("- what is fsrs? :: a scheduler")[0].id).not.toBe(lower.id);
  });
});
