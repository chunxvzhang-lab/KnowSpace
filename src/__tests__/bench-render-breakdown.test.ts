/**
 * 渲染成本分解基准（阶段 2 的决策数据，默认跳过）。
 *
 * KNOWSPACE_BENCH=1 npx vitest run src/__tests__/bench-render-breakdown.test.ts --no-file-parallelism
 *
 * 172-253ms 的打字后渲染长任务要切 Worker/增量，第一刀往哪下取决于管线内部
 * 各段的占比：markdown-it 全量解析（字符串进字符串出，可离开主线程）、
 * DOMPurify 净化（需要 DOM）、innerHTML 与后处理（必须主线程）。
 * 与 bench-vault-parse 同一口径：预热 + 取 3 次最快（guide 4.5），且**不断言
 * 时序**——只打印分布，供人读。
 *
 * 注意：jsdom 的解析/净化速度与真实 Chromium 有出入，**比例**是决策要读的
 * 数字，绝对值不是。
 */
import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";
import { buildMarkdownIt } from "../services/markdown";

const RUNS = Number(process.env.KNOWSPACE_BENCH_RUNS ?? 3);

/** 确定性语料：混合标题/段落/列表/代码围栏/任务清单/表格，约 100k 字符。 */
function corpus(chars: number): string {
  const parts: string[] = [];
  let n = 0;
  const words =
    "知识 工作台 本地优先 双向链接 闪念 复习 导图 白板 段落 标题 列表 代码 表格 任务 清单项".split(
      " ",
    );
  while (parts.join("\n\n").length < chars) {
    n += 1;
    switch (n % 6) {
      case 0:
        parts.push(`## 分节 ${n}\n\n${words.slice(0, 12).join(" ")}。`.repeat(3));
        break;
      case 1:
        parts.push(
          `- ${words.slice(0, 8).join(" ")}\n- [ ] 待办项 ${n}\n- [x] 已完成 ${n}\n1. 有序一\n2. 有序二`,
        );
        break;
      case 2:
        parts.push("```js\nconst x = " + n + ";\nfunction f(){return " + n + "}\n```");
        break;
      case 3:
        parts.push(`> 引用块 ${n}\n\n${words.slice(0, 20).join(" ")}。`.repeat(2));
        break;
      case 4:
        parts.push(`| 列甲 | 列乙 |\n| --- | --- |\n| a${n} | b${n} |`);
        break;
      default:
        parts.push(`${words.slice(0, 25).join(" ")}。`.repeat(2));
    }
  }
  return parts.join("\n\n").slice(0, chars);
}

function timed<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const out = fn();
  return [out, performance.now() - start];
}

const run = process.env.KNOWSPACE_BENCH === "1" ? it : it.skip;

describe.skipIf(process.env.KNOWSPACE_BENCH !== "1")("渲染成本分解（bench，不断言时序）", () => {
  run("100k 字符：解析 / 净化 / 建 DOM 各段耗时", () => {
    const source = corpus(100_000);

    const bench = buildMarkdownIt(() => {});
    // 预热：JIT 起来。
    bench.render(source);
    const samples: { parse: number; sanitize: number; dom: number; post: number }[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const [rawHtml, parse] = timed(() => bench.render(source));
      const [fragment, sanitize] = timed(() => {
        // 与生产一致：RETURN_DOM_FRAGMENT 净化（需要 window DOM，主线程固有段）。
        return DOMPurify.sanitize(rawHtml, {
          RETURN_DOM_FRAGMENT: true,
        }) as unknown as DocumentFragment;
      });
      const [, dom] = timed(() => {
        const template = document.createElement("template");
        template.content.append(fragment);
        return template.innerHTML;
      });
      samples.push({ parse, sanitize, dom, post: 0 });
    }
    const min = (pick: (s: (typeof samples)[number]) => number) => Math.min(...samples.map(pick));
    const total = min((s) => s.parse) + min((s) => s.sanitize) + min((s) => s.dom);
    console.log(
      [
        `[bench] 100k chars · ${source.length} 字符 · ${RUNS} 次取每段最快:`,
        `  markdown-it render : ${min((s) => s.parse).toFixed(1)} ms`,
        `  DOMPurify sanitize : ${min((s) => s.sanitize).toFixed(1)} ms`,
        `  template DOM       : ${min((s) => s.dom).toFixed(1)} ms`,
        `  合计（近似 renderMarkdown 的同步主体）: ${total.toFixed(1)} ms`,
        `  解析占比: ${((min((s) => s.parse) / total) * 100).toFixed(0)}% —— 这是 Worker 可搬走的上限`,
      ].join("\n"),
    );
    expect(total).toBeGreaterThan(0);
  });
});
