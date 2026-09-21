import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 青色强调色令牌（`--accent-info`）守卫。
 *
 * 起因：图视图、局部图谱、思维导图、画布、块锚点、命令面板共用同一个青色，但它原来是一串
 * **字面量 `#38bdf8`**，散在 **112 条规则 / 200 处声明**里。`#38bdf8` 是深色主题的正确取值
 * （黑底 9.80:1），错的是**它不随主题切换**——浅色主题下白底只有 **2.14:1**（`--surface-2`
 * 上 1.95:1），而其中 39 处是 `color:`，即正文级文字。
 *
 * 这类 bug 为什么能藏住：**「看起来就是设计如此」**。青色本来就亮，浅色下淡一点不像故障；
 * 而它确实有一批逐条手补的浅色覆盖（`.markdown-body a.wikilink` 那种），于是抽样看几处
 * 都正常。**抽样看不出「覆盖不完整」**——只有把全部引用点当成一个集合来查才看得见。
 *
 * 所以这个测试做三件事：
 *
 * 1. **令牌在每个主题里都有定义**，且 `-rgb` 三元组与十六进制指向同一颜色。两者分开维护，
 *    写歪了就会让「淡底」和「实色」变成两种颜色——肉眼看不太出来，所以必须机器核对。
 * 2. **令牌对每个主题的每个底面都达对比度阈值**。这是关键：只要**令牌本身**达标，
 *    任何用它写的新规则自动达标，不需要记得补主题覆盖——那正是当初出问题的机制。
 * 3. **字面量不得回流**。允许清单只有 `--flash-info` 一处，且必须与深色的 `--accent-info`
 *    同值；一旦有人改了其中一边，清单就腐坏了，测试会红并要求同步。
 *
 * 全部断言从 CSS 文本读，不复制常量——复制的那份迟早和 CSS 脱节。
 */

const RAW_CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
// 剥注释但**补回等量空格**：注释里会以散文形式写出 `#38bdf8`（比如令牌定义旁的说明），
// 不剥会被当成真的引用；不补等量字符则后续按偏移定位会错位。
const STRIPPED = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// ---------------------------------------------------------------- 主题块解析

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 取某个选择器（如 `:root[data-theme="eink"]`）所在块的声明体。 */
function blockBody(selector: string): string | null {
  const re = new RegExp(`^\\s*${escapeRe(selector)}\\s*\\{`, "m");
  const m = re.exec(STRIPPED);
  if (!m) return null;
  const open = STRIPPED.indexOf("{", m.index);
  let depth = 0;
  for (let j = open; j < STRIPPED.length; j++) {
    if (STRIPPED[j] === "{") depth++;
    else if (STRIPPED[j] === "}") {
      depth--;
      if (depth === 0) return STRIPPED.slice(open + 1, j);
    }
  }
  return null;
}

function declarationsOf(body: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body) return out;
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * 主题 → 选择器。`:root` 是**默认主题，即浅色**（`color-scheme: light`、`--bg: #ffffff`），
 * 所以 `light` 主题里没有单独定义的令牌会从 `:root` 继承。
 *
 * `system` 是「跟随系统」，深色分支写在 `@media (prefers-color-scheme: dark)` 里；
 * 浅色分支不另写——渲染层会把 `system` 解析成具体主题（见 `src/services/themeMode.ts`）。
 */
const THEMES = {
  light: ":root",
  eink: ':root[data-theme="eink"]',
  twitter: ':root[data-theme="twitter"]',
  systemDark: ':root[data-theme="system"]',
} as const;
type ThemeKey = keyof typeof THEMES;

const BLOCKS: Record<ThemeKey, Record<string, string>> = Object.fromEntries(
  Object.entries(THEMES).map(([k, sel]) => [k, declarationsOf(blockBody(sel))])
) as Record<ThemeKey, Record<string, string>>;

/** 主题内取值，取不到则回落到 `:root`（浅色默认）。 */
function token(theme: ThemeKey, name: string): string {
  return BLOCKS[theme][name] ?? BLOCKS.light[name];
}

// ---------------------------------------------------------------- 颜色工具

type Rgb = [number, number, number];

function parseHex(value: string): Rgb {
  const h = value.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function parseTriplet(value: string): Rgb {
  const nums = value.split(",").map((s) => Number(s.trim()));
  expect(nums.length, `通道三元组应为 3 个数: ${value}`).toBe(3);
  for (const n of nums) expect(Number.isInteger(n) && n >= 0 && n <= 255, `通道越界: ${value}`).toBe(true);
  return nums as Rgb;
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

const ACCENT = "--accent-info";
const ACCENT_RGB = "--accent-info-rgb";
const ALL_THEMES = Object.keys(THEMES) as ThemeKey[];

// ---------------------------------------------------------------- 断言

describe("青色强调色令牌 --accent-info", () => {
  it("每个主题都定义了令牌（不依赖继承）", () => {
    // 漏定义会让某个主题拿到 `unset`，于是 `color: var(--accent-info)` 整条失效、
    // 静默继承成别的颜色——比硬编码更难查。
    for (const theme of ALL_THEMES) {
      expect(BLOCKS[theme][ACCENT], `${theme} 缺少 ${ACCENT}`).toBeTruthy();
      expect(BLOCKS[theme][ACCENT_RGB], `${theme} 缺少 ${ACCENT_RGB}`).toBeTruthy();
    }
  });

  it("通道三元组与十六进制指向同一颜色", () => {
    // 两者分开维护：实色用 hex、需要透明度合成的地方用 rgb 三元组。
    // 写歪了会变成「淡底偏一个色、实色偏另一个色」，肉眼几乎看不出。
    for (const theme of ALL_THEMES) {
      const hex = parseHex(token(theme, ACCENT));
      const triplet = parseTriplet(token(theme, ACCENT_RGB));
      expect(triplet, `${theme} 的 ${ACCENT_RGB} 与 ${ACCENT} 不是同一颜色`).toEqual(hex);
    }
  });

  it("令牌在每个主题的每个底面上都达对比度阈值", () => {
    // 这是本测试的核心：只要**令牌本身**达标，任何用它写的新规则自动达标。
    // 逐条补主题覆盖的机制正是当初漏掉 112 条规则的原因。
    const TEXT_MIN = 4.5; // WCAG AA 正文
    const UI_MIN = 3; // WCAG 1.4.11 图形/界面组件
    // `--surface-sunken` 是浅色系里最深的一档底；`#0369a1` 在 eink 的米色下沉底上
    // 是 4.35:1，够图形阈值但不够正文——所以它按 UI 阈值查，其余按正文阈值查。
    const TEXT_SURFACES = ["--bg", "--surface", "--surface-2", "--surface-elevated"];
    const UI_SURFACES = ["--surface-sunken"];

    const report: string[] = [];
    for (const theme of ALL_THEMES) {
      const fg = parseHex(token(theme, ACCENT));
      for (const s of TEXT_SURFACES) {
        const bg = parseHex(token(theme, s));
        const c = contrast(fg, bg);
        if (c < TEXT_MIN) report.push(`${theme}: ${ACCENT} 对 ${s} 只有 ${c.toFixed(2)}:1（需 ${TEXT_MIN}）`);
      }
      for (const s of UI_SURFACES) {
        const bg = parseHex(token(theme, s));
        const c = contrast(fg, bg);
        if (c < UI_MIN) report.push(`${theme}: ${ACCENT} 对 ${s} 只有 ${c.toFixed(2)}:1（需 ${UI_MIN}）`);
      }
    }
    expect(report, report.join(" | ")).toEqual([]);
  });

  it("深色主题维持原来的 #38bdf8（不是顺手改了观感）", () => {
    // 这次修的是「浅色下不对」，深色下的观感是刻意的，不该被顺手改掉。
    expect(parseHex(token("twitter", ACCENT))).toEqual([0x38, 0xbd, 0xf8]);
    expect(parseHex(token("systemDark", ACCENT))).toEqual([0x38, 0xbd, 0xf8]);
  });

  it("字面量没有回流（除允许清单外）", () => {
    // 允许清单：只有 `--flash-info` 的定义。它是**组件级**令牌（闪念胶囊），且被
    // `flash-capsule-theme-contrast.test.ts` **直接读值**算对比度——若改成 `var(...)`，
    // 那边的解析器拿不到颜色，会把断言静默跳过，守卫反而变弱。所以这里保留字面量，
    // 由下一条断言负责「两边必须同值」，避免它悄悄漂走。
    const ALLOWED = new Set([ACCENT, ACCENT_RGB, "--flash-info"]);
    // 不加 `g` 标志：带 `g` 的 `test()` 会记忆 lastIndex，跨循环累积状态会让断言随机漏判。
    const LITERAL = /#38bdf8\b|rgba\(\s*56\s*,\s*189\s*,\s*248/i;

    const offenders: string[] = [];
    for (const m of STRIPPED.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const [, prop, value] = m;
      if (!LITERAL.test(value)) continue;
      if (!ALLOWED.has(prop)) offenders.push(`${prop}: ${value.trim().slice(0, 60)}`);
    }
    expect(
      offenders,
      `这些地方应改用 var(${ACCENT}) / rgba(var(${ACCENT_RGB}), …): ${offenders.join(" | ")}`
    ).toEqual([]);
  });

  it("允许清单没有腐坏：--flash-info 仍与深色 --accent-info 同值", () => {
    // 规则 5 的成对断言：白名单若某条已经不再需要，它就成了掩盖问题的盲区。
    const flash = declarationsOf(blockBody(".flash-capsule-overlay"))["--flash-info"];
    expect(flash, "闪念胶囊基线里应有 --flash-info 定义").toBeTruthy();
    expect(
      parseHex(flash),
      `--flash-info (${flash}) 与深色 ${ACCENT} 已不同值——要么同步，要么把它也换成令牌并从允许清单移除`
    ).toEqual(parseHex(token("twitter", ACCENT)));
  });
});
