import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 闪念胶囊配色对比度守卫。
 *
 * 为什么是「读 CSS 文本」的测试：这个 bug 的性质是**覆盖面漏了**，不是某一行写错。
 * 区块里 100% 硬编码颜色，浅色/eink 覆盖是逐条手补的——早期那批选择器补过，后来新增的
 * 「Enhancements」区块（置顶、目录设置、预设标签、状态提示、反馈条）一条没补，于是
 * 19 处前景色落在白底上，最低 1.48:1。渲染测试抓不到这种漏法：jsdom 不算对比度，
 * 断言 `color` 也只是断言硬编码值本身。
 *
 * 所以这里做两件事：
 *
 * 1. **按主题解析级联**（`resolveProperty`）。区块里同一个控件往往有多条规则：基线、
 *    `.theme-light`、`[data-theme="light"]`、`:hover`…… 手写一张「令牌 ↔ 底色」对照表
 *    看着更直白，但它会随 CSS 改动过期——而「过期」正是这次 bug 的成因。改成从 CSS 里
 *    解析出每条规则**实际生效**的颜色，新增规则自动进入测试。
 *
 * 2. **自动收全待测选择器**：凡是把 `color` 写成 `var(--flash-*)` 的规则都会被扫到。
 *    另有几个 hover 态只改 `background`、颜色继承自基础规则，扫不到，只能显式列在
 *    `EXTRA_SELECTORS` 里——它们恰恰是「令牌叠在更深淡色底上」的真实场景。
 *
 * 断言全部从 CSS 里读，没有复制一份常量；底色也不是写死的，而是同一套解析的结果。
 */

// ---------------------------------------------------------------- 区块与规则

/**
 * 闪念胶囊那一段 CSS 的范围，**不按连续区块取**。
 *
 * 原来的做法是切「从 `KnowSpace Flash Capsule` 注释到 `Space Timeline` 注释」这一段。
 * 那是个陷阱：`flash-` 规则在文件里有**两个**聚集区——主区块（约 4566~5874）和
 * wikilink 下拉（约 8255~8353，物理上落在 Knowledge Graph 区块里，是放错位置的 CSS）。
 * 按连续切片取范围时，第二段**从来没被扫到**，于是 `.flash-wikilink-item:hover`
 * 在浅色下只有 1.84:1 也一直是绿的。
 *
 * 改成「凡选择器里出现 `flash-` 就纳入」，范围由选择器本身决定，加在文件哪儿都算数。
 */
const RAW_CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
// 先剥注释：注释里会以散文形式写出 `@media (prefers-color-scheme: light) { … }` 和
// `var(--flash-accent)`，不剥的话前者会被当成真的 at-rule、后者会被当成真的引用。
const { stripped: STRIPPED_CSS, atRules: AT_RULES } = stripAtRules(
  RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
);

/** 剥离 `@media` / `@keyframes` / `@supports` 块，返回剥离后的文本与被剥离的内容。 */
function stripAtRules(text: string): { stripped: string; atRules: string[] } {
  const atRules: string[] = [];
  let stripped = "";
  let i = 0;
  while (i < text.length) {
    const candidates = ["@media", "@keyframes", "@supports"]
      .map((kw) => text.indexOf(kw, i))
      .filter((x) => x !== -1);
    if (candidates.length === 0) {
      stripped += text.slice(i);
      break;
    }
    const at = Math.min(...candidates);
    stripped += text.slice(i, at);
    // 花括号配平找到 at-rule 的结尾
    let depth = 0;
    let j = text.indexOf("{", at);
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    atRules.push(text.slice(at, j + 1));
    stripped += "\n";
    i = j + 1;
  }
  return { stripped, atRules };
}

type Declaration = { prop: string; value: string };

function declarations(body: string): Declaration[] {
  const out: Declaration[] = [];
  for (const raw of body.split(";")) {
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    out.push({ prop: raw.slice(0, colon).trim().toLowerCase(), value: raw.slice(colon + 1).trim() });
  }
  return out;
}

/** 同一规则里同名属性取最后一条（CSS 内联重复时后者胜）。 */
function declaredValue(body: string, prop: string): string | null {
  const found = declarations(body).filter((d) => d.prop === prop);
  return found.length ? found[found.length - 1].value : null;
}

type Rule = { selector: string; body: string; order: number };

const RULES: Rule[] = (() => {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(STRIPPED_CSS))) {
    for (const part of m[1].split(",")) {
      const selector = part.trim().replace(/\s+/g, " ");
      if (!selector || selector.startsWith("@")) continue;
      // 范围由选择器决定：`flash-` 出现在哪儿都算胶囊的样式。
      if (!selector.includes("flash-")) continue;
      out.push({ selector, body: m[2], order: m.index });
    }
  }
  return out;
})();

// ---------------------------------------------------------------- 选择器分析

/** 去掉主题限定，得到「控件本身」的选择器。 */
function normalize(selector: string): string {
  return selector
    .replace(/\.flash-capsule-overlay\.theme-[\w-]+/g, "")
    .replace(/\[data-theme="[\w-]+"\]/g, "")
    .replace(/^\.flash-capsule-overlay\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function themeQualifiers(selector: string): string[] {
  return [...selector.matchAll(/\.theme-([\w-]+)|\[data-theme="([\w-]+)"\]/g)].map(
    (m) => m[1] ?? m[2]
  );
}

/** 最后一个复合选择器里的类名（`.a.b .c` → c 的部分）。 */
function classesOf(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]));
}

function attrsOf(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/\[[^\]]*\]/g)].map((m) => m[0]));
}

/** 伪类与伪元素（`:hover`、`::placeholder`）。它们决定一条规则能否命中某元素。 */
function pseudoParts(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/::?[\w-]+/g)].map((m) => m[0]));
}

/**
 * 特异度。**必须数整条选择器**。
 *
 * 只数最后一个复合选择器会把 `.theme-eink` 那部分权重丢掉，于是
 * `.theme-eink .flash-tab-btn`(0,3,0) 被误判为输给 `.flash-tab-btn:hover`(0,2,0)——
 * 引擎会报出一个不存在的失败。伪元素不计入特异度，伪类计入。
 */
function specificity(selector: string): number {
  const s = selector.replace(/::[\w-()]+/g, "");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+/g) ?? []).length;
  const attrs = (s.match(/\[[^\]]*\]/g) ?? []).length;
  const pseudoClasses = (s.match(/:[\w-]+/g) ?? []).length;
  return ids * 1000 + (classes + attrs + pseudoClasses) * 10;
}

/**
 * 规则选择器 `ruleSelector` 能否命中「由 `elementSelector` 描述的那个元素」。
 *
 * 判断依据是复合选择器的包含关系：`.flash-mini-btn` 能命中 `.flash-mini-btn:hover`
 * （这正是 hover 态只改背景、颜色继承基础规则的原因），反过来不行。
 * 伪类必须被满足：`.flash-mini-btn:hover` 命中不了 `.flash-mini-btn`。
 */
function matchesElement(ruleSelector: string, elementSelector: string): boolean {
  for (const c of classesOf(ruleSelector)) if (!classesOf(elementSelector).has(c)) return false;
  for (const a of attrsOf(ruleSelector)) if (!attrsOf(elementSelector).has(a)) return false;
  for (const p of pseudoParts(ruleSelector)) if (!pseudoParts(elementSelector).has(p)) return false;
  return true;
}

// ---------------------------------------------------------------- 颜色

type Rgb = [number, number, number];

function parseHex(value: string): Rgb {
  const h = value.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function parseRgba(value: string): { rgb: Rgb; alpha: number } {
  const nums = value.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(nums.length, `无法解析颜色: ${value}`).toBeGreaterThanOrEqual(3);
  return { rgb: [nums[0], nums[1], nums[2]], alpha: nums.length > 3 ? nums[3] : 1 };
}

/** 把半透明色叠到不透明底色上——胶囊窗口是透明的，背后取最坏情况的白。 */
function composite(rgb: Rgb, alpha: number, behind: Rgb): Rgb {
  return rgb.map((c, i) => Math.round(c * alpha + behind[i] * (1 - alpha))) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];

/** CSS 颜色值 → 不透明 RGB。`transparent` / `none` 等非颜色值返回 null。 */
function toRgb(value: string, behind: Rgb): Rgb | null {
  if (value.startsWith("#")) return parseHex(value);
  if (/^rgba?\(/.test(value)) {
    const { rgb, alpha } = parseRgba(value);
    return composite(rgb, alpha, behind);
  }
  return null;
}

// ---------------------------------------------------------------- 按主题解析

const THEME_KEYS = ["dark", "light", "eink"] as const;
type ThemeKey = (typeof THEME_KEYS)[number];

/** 某个规则是否属于该主题：没有主题限定 → 都属于；有 → 必须匹配。 */
function ruleAppliesToTheme(selector: string, theme: ThemeKey): boolean {
  const qualifiers = themeQualifiers(selector);
  return qualifiers.length === 0 || qualifiers.includes(theme);
}

type Resolved = { value: string; from: string };

/**
 * 解析「由 `elementSelector` 描述的元素」在某主题下的某个属性。
 *
 * 按 CSS 的逐属性级联：只有声明了该属性的规则参与比较，取特异度最高、同特异度取
 * 源码靠后的那条。所以 `.flash-mini-btn:hover` 的 background 来自 hover 规则、
 * color 来自 `.flash-mini-btn`，两者各自解析——这正是 hover 态能继承基础文字色的原因。
 */
function resolveProperty(
  elementSelector: string,
  prop: "color" | "background",
  theme: ThemeKey
): Resolved | null {
  let best: (Resolved & { weight: number; order: number }) | null = null;
  for (const rule of RULES) {
    if (!ruleAppliesToTheme(rule.selector, theme)) continue;
    if (!matchesElement(rule.selector, elementSelector)) continue;
    const value = declaredValue(rule.body, prop);
    if (value === null) continue;
    const weight = specificity(rule.selector);
    if (!best || weight > best.weight || (weight === best.weight && rule.order >= best.order)) {
      best = { value, from: rule.selector, weight, order: rule.order };
    }
  }
  return best ? { value: best.value, from: best.from } : null;
}

function tokensOf(theme: ThemeKey): Record<string, string> {
  const selector = theme === "dark" ? ".flash-capsule-overlay" : `.flash-capsule-overlay.theme-${theme}`;
  const out: Record<string, string> = {};
  for (const rule of RULES) {
    if (rule.selector !== selector) continue;
    for (const d of declarations(rule.body)) {
      if (d.prop.startsWith("--flash-")) out[d.prop] = d.value;
    }
  }
  return out;
}

function surfaceOf(theme: ThemeKey): Rgb {
  const selector =
    theme === "dark"
      ? ".flash-capsule-container"
      : `.flash-capsule-overlay.theme-${theme} .flash-capsule-container`;
  const resolved = resolveProperty(selector, "background", theme);
  expect(resolved, `解析不到 ${selector} 的 background`).not.toBeNull();
  const rgb = toRgb(resolved!.value, WHITE);
  expect(rgb, `${selector} 的 background 不是颜色: ${resolved!.value}`).not.toBeNull();
  return rgb!;
}

/**
 * 元素坐在哪块容器上。
 *
 * 区块里只有目录设置卡这一层嵌套，而它的背景在深色下是 0.25 的黑洗底——比胶囊面更暗。
 * 卡里的控件背景多半是半透明的，不把这一层叠上去会算出偏亮的底，得到偏乐观的对比度。
 *
 * wikilink 下拉是另一层容器（`.flash-wikilink-dropdown`），而且它 `bottom: calc(100% + 4px)`
 * **浮在胶囊外面**——背后是桌面，不是胶囊面，所以它的基准底取白（见 `backdropOf`）。
 */
const CONTAINER_OF: Record<string, string> = {
  ".flash-dir-label": ".flash-dir-settings-card",
  ".flash-dir-path": ".flash-dir-settings-card",
  ".flash-dir-badge.custom": ".flash-dir-settings-card",
  ".flash-dir-badge.default": ".flash-dir-settings-card",
  ".flash-dir-hint": ".flash-dir-settings-card",
  ".flash-mini-btn": ".flash-dir-settings-card",
  ".flash-mini-btn:hover": ".flash-dir-settings-card",
  ".flash-mini-btn.secondary": ".flash-dir-settings-card",
  ".flash-mini-btn.secondary:hover": ".flash-dir-settings-card",
  ".flash-wikilink-header": ".flash-wikilink-dropdown",
  ".flash-wikilink-header .hint": ".flash-wikilink-dropdown",
  ".flash-wikilink-item": ".flash-wikilink-dropdown",
  ".flash-wikilink-item:hover": ".flash-wikilink-dropdown",
  ".flash-wikilink-item.active": ".flash-wikilink-dropdown",
};

/**
 * 把值里的 `var(--flash-*)` 展开成该主题的取值。
 *
 * 为什么需要：**令牌三元组** `rgba(var(--flash-info-rgb), 0.2)` 是一种新写法——实色用
 * `--flash-info`，需要透明度合成的地方（淡底、边框、光晕）用通道三元组。`toRgb()` 只认
 * `#` / `rgb()` / `rgba()` 字面量，内层的 `var()` 不先展开就会抛「无法解析颜色」。
 *
 * 展开后仍是 `rgba(56, 189, 248, 0.2)`，交给 `toRgb()` 正常合成。
 * 未知令牌保持原样，让 `toRgb()` 抛错——**不静默跳过**，否则守卫会悄悄失去这条覆盖。
 */
function expandFlashTokens(value: string, theme: ThemeKey): string {
  const tokens = tokensOf(theme);
  return value.replace(/var\((--flash-[\w-]+)\)/g, (whole, name: string) => tokens[name] ?? whole);
}

/** 该元素在某主题下文字实际落在什么颜色上（从容器底往上逐层叠）。 */
function backdropOf(elementSelector: string, theme: ThemeKey): Rgb {
  const container = CONTAINER_OF[elementSelector];
  // 浮在胶囊外的容器：背后是桌面，取最坏情况的白；否则从胶囊面起算。
  let base = container === ".flash-wikilink-dropdown" ? WHITE : surfaceOf(theme);
  if (container) {
    const resolved = resolveProperty(container, "background", theme);
    expect(resolved, `解析不到容器 ${container} 的 background（${theme}）`).not.toBeNull();
    const rgb = toRgb(expandFlashTokens(resolved!.value, theme), base);
    if (rgb) base = rgb;
  }
  const own = resolveProperty(elementSelector, "background", theme);
  if (own) {
    const rgb = toRgb(expandFlashTokens(own.value, theme), base);
    if (rgb) base = rgb;
  }
  return base;
}

/** 该元素在某主题下的实际前景色（令牌会被解析成该主题的取值）。 */
function foregroundOf(elementSelector: string, theme: ThemeKey): Resolved | null {
  const resolved = resolveProperty(elementSelector, "color", theme);
  if (!resolved) return null;
  const raw = resolved.value.replace("!important", "").trim();
  const token = raw.match(/^var\((--flash-[\w-]+)\)$/);
  if (!token) return { value: raw, from: resolved.from };
  const tokens = tokensOf(theme);
  expect(tokens[token[1]], `${theme} 主题缺少令牌 ${token[1]}（${elementSelector} 用到）`).toBeTruthy();
  return { value: tokens[token[1]], from: `${resolved.from} → ${token[1]}` };
}

// ---------------------------------------------------------------- 待测选择器

/**
 * 扫不到的选择器。
 *
 * 自动收集只认「把 color 写成 var(--flash-*)」的规则，这些要么用硬编码 hex（eink 的
 * 实色纸底上必须逐个核对），要么只改 background、颜色继承自基础规则。后者恰恰是
 * 「令牌叠在更深淡色底上」的真实场景——`.flash-mini-btn:hover` 的琥珀底深到 0.30，
 * 是区块里最深的一档，漏了它整张表就失去意义。
 */
const EXTRA_SELECTORS = [
  // 硬编码 hex，但落在实色底上（eink 的 #ded9cd / #cfc7b5 尤其需要逐个核对）
  ".flash-preset-tag",
  ".flash-preset-tag:hover",
  ".flash-starter-tag",
  ".flash-starter-tag:hover",
  ".flash-shortcut-badge",
  ".flash-shortcut-badge:hover",
  ".flash-tool-tag",
  ".flash-tool-tag:hover",
  ".flash-target-path",
  ".flash-dir-label",
  ".flash-tab-btn",
  ".flash-tab-btn:hover",
  ".flash-textarea",
  ".flash-textarea::placeholder",
  ".flash-persistent-textarea",
  ".flash-persistent-textarea::placeholder",
  // 只改 background，颜色继承基础规则
  ".flash-mini-btn:hover",
  ".flash-mini-btn.secondary:hover",
  ".flash-icon-btn",
  ".flash-icon-btn:hover",
  ".flash-btn-secondary",
  ".flash-btn-secondary:hover",
  ".flash-btn-primary",
  ".flash-save-btn",
  // 录音态只改边框/底色，文字色继承 `.flash-recorder-input`——正是「主题覆盖与状态类
  // 特异度相同」那类坑的现场，必须单独核对。
  ".flash-recorder-input.recording",
];

const SCANNED_SELECTORS: string[] = (() => {
  const out = new Set<string>(EXTRA_SELECTORS);
  const isToken = /var\(--flash-[\w-]+\)/;
  const isLiteral = /^(#|rgba?\()/;
  for (const rule of RULES) {
    const color = declaredValue(rule.body, "color");
    if (!color) continue;
    const value = color.replace(/\s*!important\s*$/, "").trim();
    // 硬编码色**也要收**：只扫令牌会漏掉「写死了深色调、且没补主题覆盖」的规则——
    // `.flash-wikilink-item:hover` 的 #38bdf8 就是这么漏的。能算出对比度的值才收，
    // `inherit` / `currentColor` 之类交给 EXTRA_SELECTORS 显式列出的场景。
    if (!isToken.test(value) && !isLiteral.test(value)) continue;
    out.add(normalize(rule.selector));
  }
  return [...out].sort();
})();

// ---------------------------------------------------------------- 断言

describe("闪念胶囊配色令牌", () => {
  it("基线（深色）块里定义了全部令牌", () => {
    // 基线漏定义会让某个主题拿到 unset，静默继承成别的颜色——比硬编码更难查。
    const base = tokensOf("dark");
    expect(Object.keys(base).length).toBeGreaterThanOrEqual(6);
    for (const token of [
      "--flash-accent",
      "--flash-accent-on-tint",
      "--flash-success",
      "--flash-danger",
      "--flash-info",
      "--flash-hint",
    ]) {
      expect(base[token], `基线缺少 ${token}`).toBeTruthy();
    }
  });

  it("浅色与 eink 都覆盖了全部令牌（不依赖继承）", () => {
    const base = tokensOf("dark");
    for (const theme of ["light", "eink"] as const) {
      const tokens = tokensOf(theme);
      const missing = Object.keys(base).filter((t) => !(t in tokens));
      expect(missing, `${theme} 主题缺: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("区块内不再残留会落在浅色底上的硬编码琥珀前景色", () => {
    // 琥珀作背景（保存按钮、淡色底）是刻意的：它在任何主题下都是深色文字配琥珀。
    const offenders = RULES.flatMap((rule) => {
      const color = declaredValue(rule.body, "color");
      return color && /^#(f59e0b|fbbf24)$/i.test(color.replace("!important", "").trim())
        ? [`${rule.selector} → ${color}`]
        : [];
    });
    expect(offenders, `这些前景色应改用 var(--flash-*): ${offenders.join(" | ")}`).toEqual([]);
  });

  it("胶囊规则不再依赖 prefers-color-scheme——系统主题只在渲染层解析一次", () => {
    // 曾经这里有一组 `@media (prefers-color-scheme: light) { .theme-system … }`，
    // 是手工复制出来的第二份浅色来源，只覆盖了容器和两个 textarea。
    // 现在系统主题由 resolveThemeMode() 解析成具体主题（见 theme-mode.test.ts）。
    const offenders = AT_RULES.filter(
      (block) => block.includes("prefers-color-scheme") && block.includes("flash-")
    );
    expect(offenders, `胶囊规则不应再出现 prefers-color-scheme：${offenders.join(" | ")}`).toEqual([]);
  });

  it("扫描集足够大，且每条显式列出的选择器都真的存在", () => {
    // 防止「扫描器坏了 → 一个都没扫到 → 全绿」。
    expect(SCANNED_SELECTORS.length).toBeGreaterThan(35);
    // 判定标准是「能解析出前景色」，不是「自己的规则里有 color」——只改 background 的
    // hover 态正是靠继承拿颜色的，用后者会把它们误判成拼错的选择器。
    const missing = EXTRA_SELECTORS.filter((sel) =>
      THEME_KEYS.every((theme) => foregroundOf(sel, theme) === null)
    );
    expect(missing, `EXTRA_SELECTORS 里这些选择器解析不出前景色（拼错？）: ${missing.join(", ")}`)
      .toEqual([]);
  });

  describe("令牌叠在淡色底上（不只是纯底）", () => {
    // 这一组是本次修复最容易漏的地方：令牌不只用在该主题的胶囊面上，还叠在
    // 「水洗底」和「实色淡底」上。只对纯底验会得到偏乐观的结果——我第一轮就是
    // 这么算的，把 #64748b（纯底 4.76:1）判成达标，实际它落在 0.05 的黑水洗底上
    // 只有 4.25:1。

    /** 用 `var(--flash-hint)` 的选择器里，自带底色（水洗底 / eink 实色米底）的那几个。 */
    const HINT_BACKDROPS = [
      ".flash-dir-path",
      ".flash-dir-badge.default",
      ".flash-mini-btn.secondary",
      ".flash-dir-hint",
    ];

    /** 用 `var(--flash-accent-on-tint)` 的选择器里，自带底色（琥珀淡底 / eink 实色米底）的那几个。 */
    const ON_TINT_BACKDROPS = [
      ".flash-preset-tag.current",
      ".flash-mini-btn",
      ".flash-mini-btn:hover",
      ".flash-starter-tag:hover",
      ".flash-icon-btn.active",
    ];

    for (const theme of THEME_KEYS) {
      it(`${theme}：--flash-hint 在水洗底 / 实色底上达到 4.5:1`, () => {
        const token = tokensOf(theme)["--flash-hint"];
        expect(token, `${theme} 缺 --flash-hint`).toBeTruthy();
        for (const selector of HINT_BACKDROPS) {
          const bg = backdropOf(selector, theme);
          const ratio = contrast(parseHex(token), bg);
          expect(ratio, `${selector}: ${token} on rgb(${bg.join(",")}) = ${ratio.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${theme}：--flash-accent-on-tint 在琥珀淡底 / 实色底上达到 4.5:1`, () => {
        const token = tokensOf(theme)["--flash-accent-on-tint"];
        expect(token, `${theme} 缺 --flash-accent-on-tint`).toBeTruthy();
        for (const selector of ON_TINT_BACKDROPS) {
          const bg = backdropOf(selector, theme);
          const ratio = contrast(parseHex(token), bg);
          expect(ratio, `${selector}: ${token} on rgb(${bg.join(",")}) = ${ratio.toFixed(2)}:1`)
            .toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  });

  it("每个令牌都是合法的颜色写法（hex 或通道三元组）", () => {
    // 少一个 `#`、写成 `rgb(...)`、或漏了分号，都会让上面的对比度计算悄悄算错。
    // `-rgb` 后缀的令牌是**通道三元组**（供 `rgba(var(--flash-x-rgb), a)` 合成淡底/
    // 边框/光晕），它不是 hex，但同样必须格式正确——写歪了会让淡底偏色而肉眼看不出。
    for (const theme of THEME_KEYS) {
      for (const [name, value] of Object.entries(tokensOf(theme))) {
        if (name.endsWith("-rgb")) {
          const parts = value.split(",").map((s) => s.trim());
          expect(parts.length, `${theme} 的 ${name} 不是 3 个通道: ${value}`).toBe(3);
          for (const p of parts) {
            expect(p, `${theme} 的 ${name} 通道不是 0-255 的整数: ${value}`).toMatch(/^\d{1,3}$/);
            expect(Number(p), `${theme} 的 ${name} 通道越界: ${value}`).toBeLessThanOrEqual(255);
          }
        } else {
          expect(value, `${theme} 的 ${name} 不是 hex 颜色: ${value}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("通道三元组与对应的实色令牌同色", () => {
    // `--flash-info-rgb` 与 `--flash-info` 是分开维护的两份（实色 vs 透明度合成用的通道）。
    // 写歪了会变成「淡底偏一个色、实色偏另一个色」——肉眼看不太出来，所以必须机器核对。
    for (const theme of THEME_KEYS) {
      const tokens = tokensOf(theme);
      for (const [name, value] of Object.entries(tokens)) {
        if (!name.endsWith("-rgb")) continue;
        const baseName = name.replace(/-rgb$/, "");
        const base = tokens[baseName];
        expect(base, `${theme} 有 ${name} 却没有对应的 ${baseName}`).toBeTruthy();
        expect(
          value.split(",").map((s) => Number(s.trim())),
          `${theme} 的 ${name} 与 ${baseName} 不是同一颜色`
        ).toEqual(parseHex(base));
      }
    }
  });

  it("三个主题解析出的胶囊面互不相同（解析器没有把主题搞混）", () => {
    const surfaces = THEME_KEYS.map((t) => surfaceOf(t).join(","));
    expect(new Set(surfaces).size, `解析出的胶囊面: ${surfaces.join(" | ")}`).toBe(THEME_KEYS.length);
  });

  it("标题用的是令牌，不是硬编码琥珀", () => {
    // 这是本次修复的起点：`.flash-title` 原来写死 `#f59e0b !important`，在浅色下
    // 只有 2.15:1。`!important` 尤其危险——它会让主题覆盖彻底失效。
    for (const theme of THEME_KEYS) {
      const fg = foregroundOf(".flash-title", theme)!;
      expect(fg.value, `${theme} 的 .flash-title 应解析到令牌`).toBe(tokensOf(theme)["--flash-accent"]);
    }
  });

  describe("对比度（自动解析每条规则实际生效的前景色与底色）", () => {
    for (const theme of THEME_KEYS) {
      describe(theme, () => {
        it("每个承载文字的选择器都达到 4.5:1", () => {
          const failures: string[] = [];
          for (const selector of SCANNED_SELECTORS) {
            const fg = foregroundOf(selector, theme);
            if (!fg) continue; // 该主题下没有 color 声明（例如只有别的主题覆盖）
            const bg = backdropOf(selector, theme);
            const ratio = contrast(parseHex(fg.value), bg);
            if (ratio < 4.5) {
              failures.push(
                `${selector}: ${fg.value} on rgb(${bg.join(",")}) = ${ratio.toFixed(2)}:1` +
                  `  [color 来自 ${fg.from}]`
              );
            }
          }
          expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
        });
      });
    }
  });
});

describe("级联解析器本身是可信的", () => {
  // 引擎错解会把「真失败」报成绿，也会把「真通过」报成红。所以先钉住几条已知结果：
  // 它们同时覆盖了「主题覆盖压过基线」「hover 继承基础色」「实色底」三种情形。

  it("主题覆盖压过基线：.flash-preset-tag 在三个主题下取值各不相同", () => {
    expect(foregroundOf(".flash-preset-tag", "dark")!.value).toBe("#cbd5e1");
    expect(foregroundOf(".flash-preset-tag", "light")!.value).toBe("#475569");
    expect(foregroundOf(".flash-preset-tag", "eink")!.value).toBe("#111111");
  });

  it("hover 态的颜色继承基础规则、底色来自 hover 规则", () => {
    // 只改 background 的 hover 规则最容易解错（颜色会变成 null 或取到别的规则）。
    const light = foregroundOf(".flash-mini-btn:hover", "light")!;
    expect(light.value).toBe("#92400e"); // var(--flash-accent-on-tint)，来自 .flash-mini-btn
    expect(light.from).toContain("--flash-accent-on-tint");
  });

  it("实色底取到了具体颜色，而不是被当成胶囊面", () => {
    // eink 的预设标签底是实色 #ded9cd；若解析失败会退回纸底，比值会明显变大。
    const bg = backdropOf(".flash-preset-tag", "eink");
    expect(bg).toEqual([222, 217, 205]);
  });

  it("特异度按整条选择器算：eink 下 tab 的 hover 色不该被 :hover 规则抢走", () => {
    // `.theme-eink .flash-tab-btn`(0,3,0) 必须压过 `.flash-tab-btn:hover`(0,2,0)，
    // 否则会算出 #ffffff 落在纸底上——一个不存在的 1.08:1 失败。
    expect(foregroundOf(".flash-tab-btn:hover", "eink")!.value).toBe("#2b2926");
  });
});

describe("对比度度量与阈值确实在起作用", () => {
  // 反向断言：任何「达标」的断言都要配一条「不达标时确实会报」的断言。
  // 否则把阈值改成永远通过、或者度量算错，上面那张全绿的表格毫无意义。
  const lightSurface = surfaceOf("light");

  it("改动前的琥珀前景色在白底上确实不达标", () => {
    expect(contrast(parseHex("#f59e0b"), lightSurface)).toBeLessThan(4.5);
  });

  it("改动前的 #cbd5e1 落在浅色启动标签底上确实不达标", () => {
    const bg = backdropOf(".flash-starter-tag", "light");
    expect(contrast(parseHex("#cbd5e1"), bg)).toBeLessThan(4.5);
  });

  it("改动前的浅色次要文字 #64748b 落在黑水洗底上确实不达标", () => {
    // 这是我自己第一轮算错的地方：只对纯底验，#64748b 有 4.76:1「达标」；
    // 实际它落在 rgba(0,0,0,0.05) 的洗底上，只有 4.25:1。
    const wash = composite([0, 0, 0], 0.05, lightSurface);
    expect(contrast(parseHex("#64748b"), wash)).toBeLessThan(4.5);
  });

  it("改动后的取值确实达标", () => {
    expect(contrast(parseHex("#475569"), composite([0, 0, 0], 0.05, lightSurface)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex("#b45309"), lightSurface)).toBeGreaterThanOrEqual(4.5);
  });
});
