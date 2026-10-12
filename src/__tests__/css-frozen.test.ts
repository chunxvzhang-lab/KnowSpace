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
 *  （space-timeline.css 的 .space-note-card：cursor / user-select / 悬浮上浮）。
 *  2026-10-11 更新：删除关系图旧弹窗留下的死选择器（graph.css 890 → 468 行，
 *  28 个类名在整个 src/electron 里无任何引用）。这不是"改了样式"，而是删掉
 *  永远匹配不上的规则——所以摘要变了、外观不该变，两者并不矛盾。证明方式：
 *  对代码里真实渲染得出的每个元素，比对删除前后**实际生效的声明**（按源码
 *  顺序），148 个候选元素零差异；同一次比对在选择器文字层面会报出 6 处差异，
 *  2026-10-11 更新（第二笔，与本笔的 CSS 同提交）：幽灵令牌收口。`--surface-1` /
 *  `--text-normal` / `--border-color` 三个**未定义**的名字改成既有令牌（命令面板 →
 *  --surface-elevated / --text / --border / --border-subtle；分栏快捷条 →
 *  --surface-elevated；graph-filters 分隔线 → --border-subtle）。styles.css 那 7 处
 *  `fill` 属图内固定观感，把兜底写成显式字面量 #1e293b，一个像素都不动。
 *  这一笔**确实改了外观**（深色下底色 #1e293b → #1a202c，通道差 15/255），所以逐条
 *  算了对比度：14 项全过（正文 ≥4.5、非文字 ≥3），并**顺带修掉一个真 bug**——eink
 *  主题下命令面板是白底，而 `.item-title` / `.command-palette-input` 读的
 *  `--text-normal` 兜底是浅色 #f8fafc，即**白字压白底 1.00:1，完全看不见**；浅色主题
 *  有专门覆盖救回，eink 只覆盖了选中项。改读 `--text` 后 eink 实测 17.40:1。
 *  2026-10-11 更新（第三笔，与本笔的 CSS 同提交）：给 `.text-orange` / `.text-cyan`
 *  补两条**工具类**。这两个类名在 23 个元素上是裸用的，而全仓只有复合规则
 *  （`.about-icon.text-orange` 等），裸用从来匹配不上 ⇒ 那些图标一直拿继承色，
 *  写代码的人以为它是橙/青。颜色走新令牌 `--icon-orange` / `--icon-cyan`，**按主题取值**：
 *  照抄复合规则里的字面量（#f59e0b / #06b6d4）在浅色与墨屏底上只有 2.15:1 / 2.04:1，
 *  低于图标 3:1 门槛（WCAG 1.4.11）——那会把"颜色不对"换成"颜色对了但看不清"。
 *  实测最差面 ≥3.5:1。新增守卫 `css-color-classes.test.ts` 钉住这类空转（含变异断言）。
 *  **作用域限定在 `.app-shell` 之下**：胶囊窗口也用这两个类名（4 处），但胶囊
 *  **不消费任何全局变量**（规则 9），不加限定会被 `theme-mode` 守卫正确地判为
 *  "胶囊引用了全局变量"——限定之后主窗口 23 处拿到颜色、胶囊 4 处保持原样。
 *  2026-10-12 更新（第四笔，与本笔的 CSS 同提交）：胶囊控件轮廓改实色。
 *  `.flash-mini-btn` 与 `.flash-tool-insert-persistent` 的描边原为
 *  `rgba(245,158,11,0.35 / 0.30)`，实测**三个主题全不达标**（深色 2.07/1.84、
 *  浅色 1.31/1.26、墨屏 1.28/1.23，WCAG 1.4.11 要求 ≥3）——技术债表只算了
 *  浅色/墨屏，误以为深色没问题。换成实色 `var(--flash-accent)` 后
 *  8.19 / 5.02 / 4.65:1。守卫此前只测文字色（`resolveProperty` 只认
 *  color/background），已补一条测描边的。
 *  2026-10-12 更新（第五笔，与本笔的 CSS 同提交）：第四笔漏掉的同族描边全部收口。
 *  `.flash-starter-tag` / `.flash-shortcut-badge` / `.flash-tool-tag`（base+hover）
 *  与 `.flash-mini-btn.secondary` 的淡描边实测 1.19~2.68:1，同样三主题不达标；
 *  dark/light 换实色 `var(--flash-accent)`，eink 取压深一档的 `#6b6152`
 *  （#b45309 压在 hover 实色底 #cfc7b5 上只有 2.99:1）。修后最差面 3.61:1。
 *  守卫的 RING_SELECTORS 从 2 个扩到 10 个并纳入 hover 态——盲区正是"只查基础态"。 */
const FROZEN_SHA256 = "1be780a1b19232bf63337f96801d08941605c4d0b4de5df978f1656f4501d303";

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
