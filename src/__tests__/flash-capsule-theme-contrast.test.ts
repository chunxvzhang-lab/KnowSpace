import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 闪念胶囊配色对比度守卫。
 *
 * 为什么是一条"读 CSS 文本"的测试：这个 bug 的性质是**覆盖面漏了**，不是某一行写错。
 * 原实现给最早那批选择器逐条补了浅色覆盖，后来新增的「Enhancements」区块（置顶、
 * 目录设置、预设标签、状态提示、反馈条）一条都没补，于是 19 处硬编码前景色落在白底上，
 * 最低 1.48:1（`.flash-preset-tag` 的 #cbd5e1 配白水洗底）。
 *
 * 这种漏法用渲染测试抓不到：jsdom 不做对比度计算，断言 `color` 也只是断言硬编码值本身；
 * 而开发时多半在深色主题下，肉眼也看不出来。所以直接在样式文本上验：令牌要齐、值要达标。
 *
 * 断言全部是"从 CSS 里读出来的"，没有复制一份常量——否则改 CSS 不改测试就会假通过。
 */

const CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

/** 只取闪念胶囊那一段，避免误伤页面其他地方的琥珀色。 */
function flashCapsuleBlock(): string {
  const start = CSS.indexOf("KnowSpace Flash Capsule (闪念胶囊) Floating");
  const end = CSS.indexOf("Space Timeline & Flash Notes Hub Panel Styles");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return CSS.slice(start, end);
}

/**
 * 提取某个选择器块里的 `--flash-*` 定义。
 *
 * 末尾的负向先行断言不能省：没有它 `\.flash-capsule-overlay` 会连
 * `.flash-capsule-overlay.theme-light,` 开头的块一起匹配，把浅色值混进深色基线，
 * 于是"基线必须齐全"这条断言就永远通过——一个假的绿灯。
 */
function tokensOf(block: string, selectorPattern: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(?:^|\\n)[ \\t]*(${selectorPattern}[^{}]*?)[ \\t]*\\{([^}]*)\\}`, "g");
  for (const match of block.matchAll(re)) {
    for (const line of match[2].split("\n")) {
      const decl = line.match(/^\s*(--flash-[a-z-]+)\s*:\s*([^;]+);/);
      if (decl) out[decl[1]] = decl[2].trim();
    }
  }
  return out;
}

/** 取某条规则里的 `background` 颜色（用于拿到各主题真实的胶囊底色）。 */
function backgroundOf(block: string, selectorPattern: string): string {
  const re = new RegExp(`(?:^|\\n)[ \\t]*(${selectorPattern}[^{}]*?)[ \\t]*\\{([^}]*)\\}`);
  const match = block.match(re);
  expect(match, `找不到选择器 ${selectorPattern} 的规则`).not.toBeNull();
  const bg = match![2].match(/background:\s*([^;]+);/);
  expect(bg, `${selectorPattern} 没有 background 声明`).not.toBeNull();
  return bg![1].trim();
}

// --- WCAG 2.1 相对亮度与对比度 ---

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

/** 把半透明色叠到不透明底色上——胶囊窗口是透明的，底色是 0.96 的玻璃层。 */
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

/**
 * 从区块里找出某个色相被当作**底色**用到的最大透明度。
 *
 * 令牌是"叠在淡色底上"时用的，所以要拿区块里实际存在的最深淡色底去验，
 * 而不是写死一个 alpha——否则有人把 0.25 调成 0.4，测试照样绿。
 *
 * 只认 `background` / `background-color` 声明：`border-color: rgba(245,158,11,0.5)`
 * 那种是描边，文字并不落在它上面，把它算进来会得出一个不存在的场景。
 */
function maxTintAlpha(blockText: string, rgbLiteral: string): number {
  const re = new RegExp(
    `background(?:-color)?\\s*:[^;]*rgba\\(\\s*${rgbLiteral}\\s*,\\s*([\\d.]+)\\s*\\)`,
    "g"
  );
  const alphas = [...blockText.matchAll(re)].map((m) => Number(m[1]));
  expect(alphas.length, `区块里没找到以 rgba(${rgbLiteral}, …) 为底的 background`).toBeGreaterThan(0);
  return Math.max(...alphas);
}

const block = flashCapsuleBlock();
const baseTokens = tokensOf(block, "\\.flash-capsule-overlay(?![.:\\w-])");
const lightTokens = tokensOf(block, "\\.flash-capsule-overlay\\.theme-light(?![.\\w-])");
const einkTokens = tokensOf(block, "\\.flash-capsule-overlay\\.theme-eink(?![.\\w-])");

/** 每个主题的"有效令牌" = 该主题覆盖的 + 基线里继承的。 */
function effective(themeTokens: Record<string, string>): Record<string, string> {
  return { ...baseTokens, ...themeTokens };
}

/** 取某主题胶囊层的实际呈现色：0.96/0.98 的玻璃层叠在最坏情况的白底上
 *  （胶囊窗口是透明的，背后可能是浅色桌面）。 */
function capsuleSurface(selectorPattern: string): Rgb {
  const { rgb, alpha } = parseRgba(backgroundOf(block, selectorPattern));
  return composite(rgb, alpha, WHITE);
}

const SURFACE_DARK = capsuleSurface("\\.flash-capsule-container(?![.\\w-])");
const SURFACE_LIGHT = capsuleSurface("\\.flash-capsule-overlay\\.theme-light \\.flash-capsule-container");
const SURFACE_EINK = capsuleSurface("\\.flash-capsule-overlay\\.theme-eink \\.flash-capsule-container");

const THEMES = [
  { name: "深色 (theme-twitter / theme-system 暗)", tokens: effective({}), surface: SURFACE_DARK },
  { name: "浅色 (theme-light)", tokens: effective(lightTokens), surface: SURFACE_LIGHT },
  { name: "eink (theme-eink)", tokens: effective(einkTokens), surface: SURFACE_EINK },
];

const AMBER: Rgb = [245, 158, 11];
const GREEN: Rgb = [34, 197, 94];
const RED: Rgb = [239, 68, 68];

const amberTint = maxTintAlpha(block, "245,\\s*158,\\s*11");
const greenTint = maxTintAlpha(block, "34,\\s*197,\\s*94");
const redTint = maxTintAlpha(block, "239,\\s*68,\\s*68");

describe("闪念胶囊配色令牌", () => {
  it("基线（深色）块里定义了全部令牌", () => {
    // 基线漏定义会让某个主题拿到 unset，静默继承成别的颜色——比硬编码更难查。
    expect(Object.keys(baseTokens).length).toBeGreaterThan(0);
    expect(baseTokens["--flash-accent"]).toBeTruthy();
    expect(baseTokens["--flash-accent-on-tint"]).toBeTruthy();
    expect(baseTokens["--flash-success"]).toBeTruthy();
    expect(baseTokens["--flash-danger"]).toBeTruthy();
    expect(baseTokens["--flash-info"]).toBeTruthy();
    expect(baseTokens["--flash-hint"]).toBeTruthy();
  });

  it("样式里引用的每个令牌都能在基线里解析到", () => {
    const referenced = new Set(
      [...block.matchAll(/var\((--flash-[a-z-]+)\)/g)].map((m) => m[1])
    );
    expect(referenced.size).toBeGreaterThan(0);
    const undefinedTokens = [...referenced].filter((t) => !(t in baseTokens));
    expect(undefinedTokens, `这些令牌被引用但基线没定义: ${undefinedTokens.join(", ")}`).toEqual([]);
  });

  it("浅色与 eink 都覆盖了全部令牌（不依赖继承）", () => {
    for (const [name, tokens] of [["light", lightTokens], ["eink", einkTokens]] as const) {
      const missing = Object.keys(baseTokens).filter((t) => !(t in tokens));
      expect(missing, `${name} 主题缺: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("区块内不再残留会落在浅色底上的硬编码琥珀前景色", () => {
    // 只有"作为前景色"的硬编码才算漏。琥珀作背景（保存按钮、淡色底）是刻意的，
    // 它在任何主题下都是深色文字配琥珀，不受影响。
    const offenders = [...block.matchAll(/^\s*color:\s*(#f59e0b|#fbbf24)\s*(!important)?;/gm)].map(
      (m) => m[0].trim()
    );
    expect(offenders, `这些前景色应改用 var(--flash-*): ${offenders.join(" | ")}`).toEqual([]);
  });

  for (const theme of THEMES) {
    describe(theme.name, () => {
      it("纯底上的强调色达到 4.5:1", () => {
        const c = contrast(parseHex(theme.tokens["--flash-accent"]), theme.surface);
        expect(c, `--flash-accent 对比度 ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });

      it("淡琥珀底上的强调色达到 4.5:1（取区块里最深的那档）", () => {
        const onTint = contrast(
          parseHex(theme.tokens["--flash-accent-on-tint"]),
          composite(AMBER, amberTint, theme.surface)
        );
        expect(onTint, `--flash-accent-on-tint 对比度 ${onTint.toFixed(2)}:1 (tint=${amberTint})`)
          .toBeGreaterThanOrEqual(4.5);
      });

      it("语义色在各自的淡色底上达到 4.5:1", () => {
        const success = contrast(
          parseHex(theme.tokens["--flash-success"]),
          composite(GREEN, greenTint, theme.surface)
        );
        expect(success, `--flash-success 对比度 ${success.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

        const danger = contrast(
          parseHex(theme.tokens["--flash-danger"]),
          composite(RED, redTint, theme.surface)
        );
        expect(danger, `--flash-danger 对比度 ${danger.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

        const info = contrast(parseHex(theme.tokens["--flash-info"]), theme.surface);
        expect(info, `--flash-info 对比度 ${info.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });

      it("次要文字达到 4.5:1", () => {
        const hint = contrast(parseHex(theme.tokens["--flash-hint"]), theme.surface);
        expect(hint, `--flash-hint 对比度 ${hint.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

describe("对比度度量本身是有效的", () => {
  // 反向断言：如果上面的阈值被改成永远通过，或者度量算错了，这几条会先失败。
  // 工程指南规则 5：任何"达标"的断言，都要配一条"不达标时确实会报"的断言。
  const lightSurface = SURFACE_LIGHT;

  it("改动前的琥珀前景色在白底上确实不达标", () => {
    expect(contrast(parseHex("#f59e0b"), lightSurface)).toBeLessThan(4.5);
  });

  it("改动前的 #cbd5e1 在白底上确实不达标", () => {
    expect(contrast(parseHex("#cbd5e1"), lightSurface)).toBeLessThan(4.5);
  });

  it("改动后选用的浅色强调色确实达标", () => {
    expect(contrast(parseHex("#b45309"), lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex("#92400e"), composite(AMBER, amberTint, lightSurface))).toBeGreaterThanOrEqual(4.5);
  });
});
