import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 思维导图主题/布局下拉的弹出层配对性守卫。
 *
 * 原生 `<select>` 的弹出列表是**操作系统画的**，不随应用主题重绘。因此弹层的
 * 底色与字色必须成对固定：一旦任何一端换成随主题的令牌，两者必然在某个主题下
 * 分手。这个 bug 真实发生过：`background: var(--surface-1, #1e293b)`（该令牌
 * 故意不桥接，恒定落回深藏青）配 `color: var(--text-primary)`（已桥接到
 * 随主题的 `--text`），浅色主题下深字压深底，实测对比 1.22:1 —— 菜单项几乎
 * 不可见。
 *
 * 守卫形状沿用仓库既有的 CSS 守卫五要素：单一来源（解析 styles.css 原文而非
 * 复制常量）、集合断言（两端都不许出现 var()）、负向对照（重新引入 var 必须被
 * 这条测试抓到，见 fixture）、解析器自检（找不到目标块直接报错，不许空转全绿）、
 * 对比度用算不用看（WCAG 2.1，正文 4.5:1）。
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cssPath = join(repoRoot, "src", "styles.css");
const cssText = readFileSync(cssPath, "utf8");

/**
 * 注释剥除但补回等量换行：行号是这类测试唯一的定位手段，
 * 吃掉换行会让报出的行号整片前移（规则 10 实测差 25 行的坑）。
 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      const comment = text.slice(i, end === -1 ? text.length : end + 2);
      out += comment.replace(/[^\n]/g, " ");
      i += comment.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** 选择器之后第一个 { … } 的体。找不到即抛错——静默失配的提取会把守卫
 * 变成永远全绿的装饰品，比没有守卫更危险。 */
function extractBlock(css: string, selector: string, what: string): { body: string; line: number } {
  const all = extractBlocks(css, selector, what);
  return all[0];
}

/** 同一选择器对可能出现在多个规则里（CSS 的级联本就允许），全部收集。 */
function extractBlocks(
  css: string,
  selector: string,
  what: string,
): Array<{ body: string; line: number }> {
  const blocks: Array<{ body: string; line: number }> = [];
  let at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(
      `解析失败：找不到 ${what}（选择器 "${selector}"）——它被改名/删掉了，本守卫的断言对象已不存在。`,
    );
  }
  while (at !== -1) {
    const open = css.indexOf("{", at);
    const close = open === -1 ? -1 : css.indexOf("}", open);
    if (open === -1 || close === -1) {
      throw new Error(
        `解析失败：${what} 的选择器找到了，但花括号不配对——styles.css 在这一点上坏了。`,
      );
    }
    blocks.push({ body: css.slice(open + 1, close), line: lineOf(css, at) });
    at = css.indexOf(selector, close);
  }
  return blocks;
}

/* ---- WCAG 2.1 对比度（与 flash-capsule 守卫同一算法与阈值口径） ---- */
function relLuminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 声明值里第一个十六进制颜色字面量（纯字符串解析）。 */
function hexValue(body: string, prop: string): string | null {
  const at = body.indexOf(prop + ":");
  if (at === -1) return null;
  const after = body.slice(at + prop.length + 1, at + prop.length + 60);
  const hash = after.indexOf("#");
  if (hash === -1) return null;
  const digits = after.slice(hash + 1, hash + 7);
  if (digits.length !== 6) return null;
  const hexDigits = "0123456789abcdefABCDEF";
  for (const ch of digits) {
    if (!hexDigits.includes(ch)) return null;
  }
  return "#" + digits.toLowerCase();
}

describe("思维导图下拉弹层的颜色配对（OS 弹出层不随主题重绘）", () => {
  const clean = stripComments(cssText);
  const option = extractBlock(clean, ".mindmap-theme-select option,", "两个下拉共用的 option 规则");
  // 同一控件选择器对出现在多个规则里（max-width、外观、color-scheme 各一处），
  // 全部收集后对"并集"断言——只查第一个块的话，守卫会因为级联的存在而漏判。
  const controls = extractBlocks(
    clean,
    ".mindmap-theme-select,\n.mindmap-layout-select {",
    "两个 select 控件的共用规则",
  );

  it("option 的底色与字色都不引用 var()——任何一端主题化都会与另一端分手", () => {
    expect(
      option.body.includes("var("),
      `OS 弹出的列表不随应用主题重绘，成对固定是硬约束（历史失效：--text-primary 落在恒定的 #1e293b 上，浅色主题 1.22:1）。当前块（styles.css:${option.line}）：${option.body.trim()}`,
    ).toBe(false);
  });

  it("配对的十六进制字面量存在且对比度达 AA 正文标准", () => {
    const bg = hexValue(option.body, "background");
    const fg = hexValue(option.body, "color");
    expect(bg, "option 缺 background 十六进制字面量").not.toBeNull();
    expect(fg, "option 缺 color 十六进制字面量").not.toBeNull();
    const ratio = contrast(fg!, bg!);
    expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}:1，低于 4.5:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("两个 select 控件声明 color-scheme: dark，浏览器自绘的选中高亮/滚动条才保持深色", () => {
    const declared = controls.some((b) => b.body.includes("color-scheme: dark"));
    expect(
      declared,
      `控件规则（共 ${controls.length} 处：${controls.map((b) => b.line).join("/")} 行）里没有任何一处声明 color-scheme: dark——OS 弹出层会退回系统浅色板。`,
    ).toBe(true);
  });

  it("负向对照：把字色换回主题化令牌，守卫必须抓到（证明提取与断言在工作）", () => {
    // 历史 bug 形状的原样 fixture——不是 styles.css 的内容。
    const broken = `.mindmap-theme-select option,
      .mindmap-layout-select option {
        background: var(--surface-1, #1e293b);
        color: var(--text-primary, #e2e8f0);
      }`;
    const parsed = extractBlock(broken, ".mindmap-theme-select option,", "fixture 的 option 块");
    expect(
      parsed.body.includes("var("),
      "提取逻辑连 fixture 的 var 都看不见，它在真实文件上同样会失明",
    ).toBe(true);
    // 历史失效的算数复现：浅色的 --text 落进固定深底。
    expect(contrast("#18181b", "#1e293b")).toBeLessThan(1.5);
  });

  it("回归锚点：当前配对就是修复后的值，被改回历史值即失败", () => {
    expect(hexValue(option.body, "background")).toBe("#1e293b");
    expect(hexValue(option.body, "color")).toBe("#e2e8f0");
  });
});
