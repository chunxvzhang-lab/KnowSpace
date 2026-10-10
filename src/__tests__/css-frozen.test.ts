import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadAppCssBundle } from "./helpers/loadAppCss";

/**
 * CSS 冻结守卫（契约 V2 / 选项 ②A）。
 *
 * 为什么存在：子任务 A 把 `src/App.tsx` 的装配往下沉，验收里有一条「这次重构没有碰
 * 样式」。那条原本写成「比 dist 里 CSS 文件名的哈希」，而那要求跑 `vite build`——
 * build 会写 dist，不在「只验证」档的授权面上。这里换成**不建产物**的等价断言：把浏览
 * 器实际看到的那份样式表（`loadAppCssBundle()`，装载顺序即级联）归一化后取 SHA-256，
 * 与写死在本文件的基线全等。CSS 内容一变就红，比跑 build 更轻、语义更强。
 *
 * 归一化的定义（**这条守卫的适用范围，逐条写清楚**）：
 *  ① 块注释整体替换成空格——注释不进级联；
 *  ② 连续空白压成一个空格；
 *  ③ 结构字符 `{ } ; : , ( ) [ ] =` 与组合符 `> + ~` **两侧的空白全部去掉**——
 *     所以缩进、换行、`a { color: red }` vs `a{color:red}` 这类排版差异不会让它红；
 *  ④ 声明表尾可选的分号（`x;y}` vs `x}`）抹平。
 * 仍然敏感的是**内容本身**：颜色值、选择器、属性增删、规则顺序、装载顺序，都会变摘要。
 *
 * 它**不保证**的事，别拿它当证据：
 *  · 字符串字面量内部的空白差异（`content: "a  b"` → `"a b"`）会被压平，测不出来；
 *  · 语义相同但书写不同的改动（新增一条等价规则、把两条规则调换顺序且级联结果不变）
 *    会让它红——那是**故意**的：A 链根本不该动 CSS，红了就是信号，不该去解释它。
 *
 * 换基线的规矩：若某批任务确实有意改 CSS，先确认改动、再把红条打印出的 actual 摘要写回
 * `FROZEN_SHA256`，且**必须与改 CSS 在同一笔提交**——否则摘要与内容之间出现一段没人负责
 * 的窗口。基线本身由本文件自己的代码路径产出，不是手抄的。
 */

/** 基线：提交 757a349 状态下、由本文件的 normalize+digest 算出（不是手抄的）。
 *  2026-10-09 更新：闪念时间线卡片新增"双击在阅览页打开"的可点提示样式
 *  （space-timeline.css 的 .space-note-card：cursor / user-select / 悬浮上浮）。 */
const FROZEN_SHA256 = "48fa134968a6314d2c76a56666e90290406645d9f8a66042a5134ee4ff900884";

function normalize(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,()[\]=])\s*/g, "$1")
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function digest(css: string): string {
  return createHash("sha256").update(normalize(css), "utf8").digest("hex");
}

const BUNDLE = loadAppCssBundle();
const ACTUAL = digest(BUNDLE.css);

describe("CSS 冻结（A 链不得改样式）", () => {
  it("扫描器自身有效（否则本守卫会空转全绿）", () => {
    expect(BUNDLE.sources.length, "一条 CSS 装载都没解析到——入口形状变了？").toBeGreaterThanOrEqual(
      4,
    );
    expect(normalize(BUNDLE.css).length, "归一化后的样式表短得不对劲").toBeGreaterThan(50_000);
  });

  it("变异断言：对书写差异不敏感，对内容差异必须敏感", () => {
    const base = digest(".a{color:red}");
    // 刻意不变：书写形式。
    expect(digest("  .a {  color: red; }  "), "排版变化不该让守卫红").toBe(base);
    expect(digest("/* 说明 */ .a{color:red}"), "注释变化不该让守卫红").toBe(base);
    expect(digest(".a{color:red;}"), "表尾可选分号不该让守卫红").toBe(base);
    expect(digest("a > b{color:red}"), "组合符两侧空格不该让守卫红").toBe(digest("a>b{color:red}"));
    // 必须变：内容。每一条都是"守卫要是坏了会怎样"的一种形状。
    expect(digest(".a{color:blue}"), "改颜色没让摘要变：守卫恒绿").not.toBe(base);
    expect(digest(".a{color:red}.a{color:red}"), "重复规则没让摘要变：守卫恒绿").not.toBe(base);
    expect(
      digest("ab{color:red}"),
      "后代组合器被压成了交集选择器：`a b` 与 `ab` 必须区分",
    ).not.toBe(base);
    expect(digest(""), "空样式表与样例等值：守卫恒绿").not.toBe(base);
  });

  it("浏览器看到的那份样式表与基线摘要全等", () => {
    // 失败时**不做**逐文件比对：本守卫的职责只是证明 A 链没碰样式。改 CSS 的那些批
    // 自有 diff 可查——`git diff -- src/styles src/styles.css` 会精确指出哪一块、哪一行，
    // 比在这里内嵌 32 份摘要更准，也不会逼每次合法改动重抄一整张表（重抄整表恰好会把
    // 「我本来只想改这一处」这件事糊掉）。
    expect(
      ACTUAL,
      "CSS 内容变了，而这条守卫存在的意义就是证明「App.tsx 下沉」这类重构没碰样式。\n" +
        "第一步：`git diff -- src/styles src/styles.css` 看是谁改的、改了哪几行。\n" +
        `若那次改动是有意的：把新摘要 ${ACTUAL} 写回 FROZEN_SHA256，并与改 CSS 同一笔提交。\n` +
        "若那次改动是无意的（比如下沉时顺手挪了样式）：当场停下，那就是行为变化。\n" +
        `装载清单（顺序即级联，共 ${BUNDLE.sources.length} 个文件）：` +
        BUNDLE.sources.map((s) => s.file).join(" → "),
    ).toBe(FROZEN_SHA256);
  });
});
