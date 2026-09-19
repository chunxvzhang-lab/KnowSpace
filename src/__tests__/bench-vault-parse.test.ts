// 量测，不是守护测试：默认跳过，按需运行 ——
//   KNOWSPACE_BENCH=1 npx vitest run src/__tests__/bench-vault-parse.test.ts
//
// 它测的是"当前知识库"来源在真实体量下的解析代价：面板在渲染期同步解析整库，
// 每个 note 被解析了三遍。改动解析路径之后重跑一次，就能看见前后差多少。
import { describe, it } from "vitest";

const benchEnabled = process.env.KNOWSPACE_BENCH === "1";
import {
  buildQueueFromParsed,
  buildReviewQueue,
  parseFlashcards,
  parseFsrsMetadata,
  parseReviewSource,
  summarize,
  summarizeParsed,
} from "../services/fsrsService";

/**
 * 一次性的量测（不是守护测试，跑完即弃）：模拟"当前知识库"来源在真实规模下的代价。
 *
 * 面板在渲染期同步做这些事，而其中 parseFlashcards 被调用了三次 —— 这个文件用来看
 * 这个"三遍"到底值多少毫秒。
 */
function makeNote(index: number): string {
  const lines: string[] = [`# 第 ${index} 章`, ""];
  for (let card = 0; card < 5; card += 1) {
    lines.push(`Q: 第 ${index} 章的第 ${card} 个问题是什么？`);
    lines.push(`A: 这是第 ${index} 章第 ${card} 题的回答，用来占一些篇幅。`);
    lines.push("");
  }
  // 一点正文，让每篇不是纯卡片
  for (let para = 0; para < 12; para += 1) {
    lines.push(`这是第 ${index} 章的正文段落 ${para}，长度刻意接近真实的笔记内容。`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 一篇接近真实笔记体量的文档（约 10 KB），而不是几百字节的玩具样本。 */
function makeRealNote(index: number): string {
  const lines: string[] = [`# 第 ${index} 章`, ""];
  for (let card = 0; card < 5; card += 1) {
    lines.push(`Q: 第 ${index} 章的第 ${card} 个问题是什么？`);
    lines.push(`A: 这是第 ${index} 章第 ${card} 题的回答，用来占一些篇幅。`);
    lines.push("");
  }
  for (let para = 0; para < 40; para += 1) {
    lines.push(`## 小节 ${para}`);
    lines.push("");
    lines.push(
      `这是第 ${index} 章的正文段落 ${para}。真实笔记里会有引用、列表、代码与链接，` +
        `长度也远不止一行 —— 这一段刻意写长，让每篇文档接近 10 KB。`
    );
    lines.push("");
    lines.push("- 要点一：长文里多数行都不是卡片，解析要看过每一行才能下结论。");
    lines.push("- 要点二：**格式标记**与 `行内代码` 混在一起。");
    lines.push("");
  }
  return lines.join("\n");
}

describe.skipIf(!benchEnabled)("知识库来源的解析代价（量测）", () => {
  it("1000 篇笔记", () => {
    const notes = Array.from({ length: 1000 }, (_, index) => ({
      path: `C:/vault/ch-${index}.md`,
      content: makeRealNote(index),
    }));
    const inputs = notes.map((n) => ({ path: n.path, content: n.content }));
    const bytes = inputs.reduce((sum, n) => sum + n.content.length, 0);

    const t0 = performance.now();
    for (const note of inputs) parseFlashcards(note.content);
    const tCards = performance.now() - t0;

    const t1 = performance.now();
    for (const note of inputs) parseFsrsMetadata(note.content);
    const tMeta = performance.now() - t1;

    const t2 = performance.now();
    const queue = buildReviewQueue(inputs);
    const tQueue = performance.now() - t2;

    const t3 = performance.now();
    const stats = summarize(inputs);
    const tStats = performance.now() - t3;

    const t4 = performance.now();
    const sources = new Map<string, { path: string; content: string }>();
    for (const note of inputs) {
      const holder = { path: note.path, content: note.content };
      for (const card of parseFlashcards(note.content)) {
        if (!sources.has(card.id)) sources.set(card.id, holder);
      }
    }
    const tSources = performance.now() - t4;

    // What the panel does now: parse once, then derive the queue and the counters from
    // the parsed source. Nothing here blocks a frame either — the panel does this in
    // slices — but the amount of work is what these two numbers are about.
    const t5 = performance.now();
    const parsedSource = parseReviewSource(inputs);
    const tParseOnce = performance.now() - t5;
    const t6 = performance.now();
    const queue2 = buildQueueFromParsed(parsedSource);
    const stats2 = summarizeParsed(parsedSource);
    const tDerive = performance.now() - t6;

    console.log(
      [
        `笔记 ${inputs.length} 篇 / ${(bytes / 1024 / 1024).toFixed(1)} MB`,
        "",
        "改动前（渲染期同步，每篇解析三遍）：",
        `  面板那一段（parseFlashcards + 建 sourceMap）: ${tSources.toFixed(0)} ms`,
        `  队列（内部又解析一遍）:                      ${tQueue.toFixed(0)} ms`,
        `  统计（内部再解析一遍）:                      ${tStats.toFixed(0)} ms`,
        `  —— 合计:                                    ${(tSources + tQueue + tStats).toFixed(0)} ms`,
        "",
        "现在（解析一遍，队列与统计共用；且分片进行，让出主线程）：",
        `  解析源:                                      ${tParseOnce.toFixed(0)} ms`,
        `  由它导出队列 + 统计:                          ${tDerive.toFixed(0)} ms`,
        `  —— 合计:                                    ${(tParseOnce + tDerive).toFixed(0)} ms`,
        "",
        `卡片 ${queue.length} 张（另一次 ${queue2.length} 张，共 ${stats.total} / ${stats2.total} 张）`,
      ].join("\n")
    );
  }, 60000);
});
