import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 思维导图主题/布局下拉的弹出层配对性守卫（第二版：成对同源，而非禁用 var）。
 *
 * 原生 `<select>` 的弹出列表是**操作系统画的**，不随应用主题自动重绘——但
 * option 的声明值是可以主题化的（Chromium 用同一 style engine 解析它）。
 * 这个家族的失效有两种形状，都真实发生过：
 *
 * 1. **混合形**：恒定底色 + 主题化字色。`background: var(--surface-1, #1e293b)`
 *    （该令牌故意不桥接，恒定落回深藏青）配 `color: var(--text-primary)`（桥接
 *    到随主题的 `--text`）——浅色主题下深字压深底，实测 1.22:1，菜单项几乎不可见。
 * 2. **反向混合形**：主题化底色 + 恒定字色——深色主题下浅字落浅底，同族失效。
 *
 * 唯一稳固的形状是**两端同源**：`--surface` 与 `--text` 在每个主题块里成对定义
 * （light #ffffff/#18181b、eink #fbf9f4/#1a1a1a、twitter #0f1419/#e7e9ea），
 * 弹层跟随应用主题并继承令牌系统自己的对比度保证。守卫钉住这个配对：两端必须
 * 恰好是这对令牌，并且逐主题用**实际值对**验算对比度。
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

/** 声明块里某自定义属性的十六进制值（纯字符串解析，值形如 #rrggbb）。 */
function readToken(block: string, name: string): string | null {
  const at = block.indexOf(name + ":");
  if (at === -1) return null;
  const after = block.slice(at + name.length + 1, at + name.length + 12);
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

/** 每个 { … } 声明块里成对出现的 --surface/--text 实际值。 */
function themePairs(css: string): Map<string, [string, string]> {
  const pairs = new Map<string, [string, string]>();
  let depth = 0;
  let blockStart = -1;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === "{") {
      if (depth === 0) blockStart = i;
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0 && blockStart !== -1) {
        const block = css.slice(blockStart, i + 1);
        const surface = readToken(block, "--surface");
        const text = readToken(block, "--text");
        if (surface && text) pairs.set(`${surface}/${text}`, [surface, text]);
        blockStart = -1;
      }
    }
  }
  return pairs;
}

describe("思维导图下拉弹层的颜色配对（弹层跟随主题，两端必须同源）", () => {
  const clean = stripComments(cssText);
  const option = extractBlock(clean, ".mindmap-theme-select option,", "两个下拉共用的 option 规则");
  // 同一控件选择器对出现在多个规则里（max-width、外观、color-scheme 各一处），
  // 全部收集后对"并集"断言——只查第一个块的话，守卫会因为级联的存在而漏判。
  const controls = extractBlocks(
    clean,
    ".mindmap-theme-select,\n.mindmap-layout-select {",
    "两个 select 控件的共用规则",
  );

  it("option 的底色与字色必须是成对同源的主题令牌（var(--surface) + var(--text)）", () => {
    const bg = option.body.trim().startsWith("background: var(--surface)");
    const fg = option.body.includes("color: var(--text)");
    expect(
      bg && fg,
      `OS 弹层不随主题自动重绘，唯一稳固的形状是两端同源：background: var(--surface) + color: var(--text)。历史两种失效形状（恒定底+主题字、主题底+恒定字）都在某个主题下掉到 1.22:1。当前块（styles.css:${option.line}）：${option.body.trim()}`,
    ).toBe(true);
    // 混合形（一端 var、一端字面量）是两种历史失效的共同形状——显式排除。
    expect(option.body.includes("background: var("), "底色端必须是 var(--surface)").toBe(true);
    expect(option.body.includes("color: var("), "字色端必须是 var(--text)").toBe(true);
  });

  it("逐主题用实际值对验算：每个主题块里的 --surface/--text 对比度都达 AA 正文", () => {
    // 值对来自 styles.css 本体（同一来源的实际渲染对，规则 1：一个概念只有
    // 一处定义），而不是这里抄一份调色板。
    const pairs = themePairs(cssText);
    expect(pairs.size, "一个主题对都没解析到——解析器坏了，别让它空转全绿").toBeGreaterThanOrEqual(
      3,
    );
    for (const [key, [surface, text]] of pairs) {
      const ratio = contrast(text, surface);
      expect(
        ratio,
        `主题对 ${key}（--text on --surface）= ${ratio.toFixed(2)}:1，低于 4.5:1——下拉弹层跟随这对值，先修令牌再谈弹层`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("两个 select 控件不再声明 color-scheme: dark——弹层颜色已主题化，强制深色板会与浅色主题打架", () => {
    const declared = controls.filter((b) => b.body.includes("color-scheme: dark"));
    expect(
      declared.map((b) => b.line),
      "控件的 color-scheme: dark 与主题化的 option 颜色矛盾：浅色主题下系统深色板会顶掉弹层的浅色对。弹层的深浅由根部的 color-scheme 声明（每个主题块各自声明）。",
    ).toEqual([]);
  });

  it("负向对照：历史混合形（恒定底 + 主题字）必须被成对检查抓到", () => {
    // 历史 bug 形状的原样 fixture——不是 styles.css 的内容。
    const broken = `.mindmap-theme-select option,
      .mindmap-layout-select option {
        background: var(--surface-1, #1e293b);
        color: var(--text-primary, #e2e8f0);
      }`;
    // 成对检查的判别：两端必须恰好是 var(--surface) / var(--text)。
    const paired =
      broken.includes("background: var(--surface)") && broken.includes("color: var(--text)");
    expect(paired, "成对检查连 fixture 的混合形都放行了，它在真实文件上同样会失明").toBe(false);
    // 反向混合形（主题底 + 恒定字）同样必须被抓。
    const reverse = "background: var(--surface); color: #e2e8f0;".includes("color: var(--text)");
    expect(reverse, "反向混合形（主题底+恒定字）必须同样被拒").toBe(false);
  });

  it("回归锚点：当前配对就是修复后的令牌对，被改回任何历史形状即失败", () => {
    expect(option.body).toContain("background: var(--surface)");
    expect(option.body).toContain("color: var(--text)");
  });
});
