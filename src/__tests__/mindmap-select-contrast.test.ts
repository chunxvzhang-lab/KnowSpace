import { describe, expect, it } from "vitest";
import { loadAppCssBundle } from "./helpers/loadAppCss";

/**
 * 思维导图下拉弹层的颜色守卫（第三版：手写弹层的成对同源令牌）。
 *
 * 这个守卫的断言对象已经换了两次，每次都跟着一次真实失效：
 *
 * 1. 原生 `<select>` 时代钉 option 的恒定对——直到发现 Windows 的 OS 弹层
 *    根本不应用 option 颜色（深色主题实测 1.22:1，样式化是黑盒）。
 * 2. 换成主题跟随的 var 对——同样无效，var 在 OS 弹层里也不解析。
 * 3. 现在弹层是手写 DOM（MindmapSelect，portal 到 body），普通 CSS 规则
 *    真正生效——守卫钉住它的成对同源：弹层的底/字必须是同一主题块的
 *    var(--surface)/var(--text)，hover 底必须是同块的 var(--surface-2)，
 *    并逐主题用**应用样式表里实际值对**验算对比度。
 *
 * 历史两种失效形状（恒定底+主题字、主题底+恒定字）作为负向 fixture 保留：
 * 成对检查必须拒绝它们。
 *
 * 读 `loadAppCssBundle()`（阶段 B 之后主题令牌分布在 `src/styles/tokens.css` 等切片里）：
 * 只读 styles.css 会拿 mid-file 的覆盖块当"主题取值"，验算的是不存在于级联里的颜色对。
 */

const { css: cssText, locate } = loadAppCssBundle();

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
  const at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(
      `解析失败：找不到 ${what}（选择器 "${selector}"）——它被改名/删掉了，本守卫的断言对象已不存在。`,
    );
  }
  const open = css.indexOf("{", at);
  const close = open === -1 ? -1 : css.indexOf("}", open);
  if (open === -1 || close === -1) {
    throw new Error(
      `解析失败：${what} 的选择器找到了，但花括号不配对——应用样式表在 ${locate(lineOf(css, at))} 这一点上坏了。`,
    );
  }
  return { body: css.slice(open + 1, close), line: lineOf(css, at) };
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

/** 每个 { … } 声明块里成对出现的 --surface/--text/--surface-2 实际值。 */
function themeTokens(
  css: string,
): Map<string, { surface: string; text: string; surface2: string }> {
  const pairs = new Map<string, { surface: string; text: string; surface2: string }>();
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
        const surface2 = readToken(block, "--surface-2");
        if (surface && text && surface2) {
          pairs.set(`${surface}/${text}`, { surface, text, surface2 });
        }
        blockStart = -1;
      }
    }
  }
  return pairs;
}

describe("思维导图下拉弹层的颜色守卫（手写弹层 · 成对同源令牌）", () => {
  const clean = stripComments(cssText);
  const pop = extractBlock(clean, ".mindmap-select-pop {", "手写弹层容器");
  const optionRow = extractBlock(clean, ".mindmap-select-option {", "弹层选项行");
  const activeRow = extractBlock(clean, ".mindmap-select-option.is-active {", "弹层活动行");

  it("弹层底色与字色必须是成对同源的主题令牌（var(--surface) + var(--text)）", () => {
    const paired =
      pop.body.includes("background: var(--surface)") && pop.body.includes("color: var(--text)");
    expect(
      paired,
      `手写弹层是普通 DOM，令牌在这里真实生效——但两端必须同源。历史两种失效形状（恒定底+主题字 1.22:1、主题底+恒定字）都在某个主题下崩。当前块（${locate(pop.line)}）：${pop.body.trim()}`,
    ).toBe(true);
  });

  it("活动行与选项行的字色同源，活动行底色用同主题系的 --surface-2", () => {
    expect(optionRow.body).toContain("color: var(--text)");
    expect(activeRow.body).toContain("background: var(--surface-2)");
    expect(
      activeRow.body,
      "活动行不应自带字色——继承弹层的 var(--text)，避免第二来源",
    ).not.toContain("color:");
  });

  it("逐主题用实际值对验算：--surface/--text/--surface-2 两两对比度都达 AA 正文", () => {
    const pairs = themeTokens(cssText);
    expect(pairs.size, "一个主题对都没解析到——解析器坏了，别让它空转全绿").toBeGreaterThanOrEqual(
      3,
    );
    for (const [key, { surface, text, surface2 }] of pairs) {
      expect(
        contrast(text, surface),
        `主题对 ${key}：--text on --surface = ${contrast(text, surface).toFixed(2)}:1，低于 4.5:1——先修令牌再谈弹层`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(text, surface2),
        `主题对 ${key}：--text on --surface-2（活动行底）= ${contrast(text, surface2).toFixed(2)}:1，低于 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("负向对照：历史混合形（恒定底 + 主题字）必须被成对检查抓到", () => {
    // 历史 bug 形状的原样 fixture——不是应用样式表的内容。
    const broken = `.mindmap-select-pop {
        background: #1e293b;
        color: var(--text);
      }`;
    // 成对检查的判别：两端必须恰好是 var(--surface) / var(--text)。
    const paired =
      broken.includes("background: var(--surface)") && broken.includes("color: var(--text)");
    expect(paired, "成对检查连 fixture 的混合形都放行了，它在真实文件上同样会失明").toBe(false);
  });

  it("回归锚点：当前配对就是修复后的令牌对，被改回任何历史形状即失败", () => {
    expect(pop.body).toContain("background: var(--surface)");
    expect(pop.body).toContain("color: var(--text)");
  });
});
