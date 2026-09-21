import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * CSS 动画名守卫。
 *
 * 起因：`fadeIn` / `fadeInScale` 被 7 处引用（遮罩层、下拉、右键菜单、空态卡片），
 * 但全仓库**从来没有定义过**。引用一个不存在的动画名不会报任何错——浏览器把整条
 * `animation` 声明当无效值丢掉，元素瞬间出现而不是淡入。
 *
 * 这类 bug 的可怕之处在于它**三个常规信号全都沉默**：
 *   - 没有报错（不是语法错误）；
 *   - 没有视觉异常（"没动画"看起来就是"设计如此"）；
 *   - 没有测试能看见（CSS 文件不被任何断言读取）。
 * 只有人去翻"这个动画名到底定义在哪"才会发现。所以必须机器化。
 *
 * 这里只做**单向**检查：引用 → 定义。反向（定义了但没人用）不做断言——
 * 动画名可能由 TSX 内联样式引用，报出来多半是假阳性。
 */

const SRC = resolve(__dirname, "..");

/** 递归收集 src 下的 .css 文件（排除测试目录本身）。 */
function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

/**
 * 去掉注释：注释里出现动画名（比如说明文字）不能算引用。
 *
 * 关键：**按注释里的换行数补回等量换行**。直接删掉整段注释会连带吃掉它的换行，
 * 之后所有偏移相对真实文件前移，报出来的行号全是错的（实测差了 25 行）——
 * 而行号是这个测试唯一的定位手段，错了就等于没有。
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length));
}

/**
 * 抠掉 `@keyframes` 块，**但补回等量换行**。
 *
 * 两个理由：
 * 1. 不抠掉的话，块内的 `from { opacity: 0 }` 会被当成普通规则参与解析——这里恰好没有
 *    `animation:` 声明所以不会出错，但依赖"恰好"太脆：以后有人在 keyframe 里写
 *    `animation-timing-function` 就会被误判成引用。
 * 2. 补回换行是为了让 `body` 与原文**行号一一对应**，这样 `matchAll` 给出的 `m.index`
 *    可以直接换算成真实行号，不用再拿值去 `indexOf` 猜位置（那样遇到重复声明会指错行）。
 */
function stripKeyframes(css: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const at = css.indexOf("@keyframes", i);
    if (at < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf("{", at);
    if (open < 0) {
      out += css.slice(at);
      break;
    }
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const removed = css.slice(at, j + 1);
    out += "\n".repeat((removed.match(/\n/g) || []).length);
    i = j + 1;
  }
  return out;
}

/**
 * 按分隔符切分，但跳过括号内的分隔符。
 * `animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)` 里那个逗号不能当分隔符。
 */
function splitTop(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** `animation` / `animation-name` 的简写里，这些词不是动画名。 */
const NOT_A_NAME = new Set([
  // 方向
  "normal", "reverse", "alternate", "alternate-reverse",
  // 填充模式
  "none", "forwards", "backwards", "both",
  // 播放状态
  "running", "paused",
  // 次数
  "infinite",
  // 缓动（函数形式由下面的括号判断兜住）
  "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
]);

/** 从一条 animation 值里挑出动画名。 */
function namesIn(value: string): string[] {
  const out: string[] = [];
  for (const one of splitTop(value, ",")) {
    for (const raw of splitTop(one, " ")) {
      const tok = raw.trim();
      if (!tok) continue;
      if (NOT_A_NAME.has(tok)) continue;
      if (tok.includes("(")) continue; // cubic-bezier(...) / steps(...) / var(...)
      if (/^-?[\d.]+m?s$/.test(tok)) continue; // 时长/延迟
      if (/^[\d.]+$/.test(tok)) continue; // 纯数字（部分简写允许）
      if (!/^[A-Za-z_][\w-]*$/.test(tok)) continue; // 不是标识符
      out.push(tok);
    }
  }
  return out;
}

const FILES = cssFiles(SRC);
const DEFINED = new Set<string>();
const REFS: { file: string; line: number; name: string }[] = [];

for (const file of FILES) {
  const css = stripComments(readFileSync(file, "utf8"));

  for (const m of css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)) {
    DEFINED.add(m[1]);
  }

  // `stripComments` / `stripKeyframes` 都补回了等量换行，所以 body 与真实文件
  // 行号一一对应，`m.index` 可以直接换算。
  const body = stripKeyframes(css);
  const lineStart: number[] = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === "\n") lineStart.push(i + 1);

  const declRe = /(^|[;{])\s*(animation|animation-name)\s*:\s*([^;}]+)/gm;
  for (const m of body.matchAll(declRe)) {
    // 必须取 `animation` 关键字本身的位置，不能用 m.index —— 正则的开头是前一条
    // 声明末尾的 `;`（或 `{`），那通常落在**上一行**，直接换算会整体差一行。
    const at = m.index! + m[0].indexOf(m[2]);
    let line = 1;
    for (let k = lineStart.length - 1; k >= 0; k--) {
      if (lineStart[k] <= at) {
        line = k + 1;
        break;
      }
    }
    for (const name of namesIn(m[3])) {
      REFS.push({ file: file.replace(/\\/g, "/").replace(SRC.replace(/\\/g, "/") + "/", ""), line, name });
    }
  }
}

describe("CSS 动画名守卫", () => {
  it("扫描器本身有效（否则会静默全绿）", () => {
    expect(FILES.length, "没扫到任何 css 文件").toBeGreaterThan(0);
    expect(DEFINED.size, `扫到的 @keyframes 太少（${DEFINED.size}），解析器可能坏了`).toBeGreaterThan(20);
    expect(REFS.length, `扫到的 animation 引用太少（${REFS.length}），解析器可能坏了`).toBeGreaterThan(30);
  });

  it("每个被引用的动画名都有 @keyframes 定义", () => {
    const dangling = REFS.filter((r) => !DEFINED.has(r.name));
    const seen = new Set<string>();
    const uniq = dangling.filter((d) => {
      const k = `${d.file}:${d.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    expect(
      uniq.map((d) => `${d.file}:${d.line} 引用了未定义的动画 "${d.name}"`),
      "引用了不存在的 @keyframes：浏览器会把整条 animation 声明当无效值丢掉，动画静默失效"
    ).toEqual([]);
  });

  it("fadeIn / fadeInScale 有定义（回归锚点）", () => {
    // 这两个正是本次修的：它们跨区块共用、被 7 处引用，却从未定义过。
    expect(DEFINED.has("fadeIn"), "fadeIn 又没了").toBe(true);
    expect(DEFINED.has("fadeInScale"), "fadeInScale 又没了").toBe(true);
    expect(REFS.filter((r) => r.name === "fadeIn").length).toBeGreaterThanOrEqual(5);
  });
});
