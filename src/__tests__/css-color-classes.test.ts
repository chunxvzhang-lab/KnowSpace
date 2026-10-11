import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadAppCssBundle } from "./helpers/loadAppCss";

/**
 * 着色类名守卫：**用到的类名必须真的有规则**。
 *
 * 起因（2026-10-11 收口）：`.text-orange` / `.text-cyan` 在 **23 个元素**上是裸用的
 * （`className="text-cyan"`，没有伴随类），而全仓**只有复合规则**——
 * `.about-icon.text-orange`（about.css:307）、`.dual-pane-icon.text-orange/.text-cyan`
 * （dual-split.css:135/139）。复合规则要求同一元素上还有那个父类，裸用因此**从来
 * 匹配不上**，那些图标一直拿的是**继承色**：写代码的人以为它是橙/青，实际它跟正文
 * 一个颜色。
 *
 * 这类失效三个常规信号全沉默：没有报错（类名不是语法）、没有视觉异常（"没颜色"
 * 看起来就是"设计如此"）、没有测试看得见（CSS 类名不被任何断言读取）。与
 * `--surface-1` 那批幽灵令牌同属「名字不存在但不报错」——所以必须机器化。
 *
 * 判据（**只查"裸用"，不查复合用法**）：
 *   一个元素上如果同时写了 `.text-orange` 与某个已知的宿主类（`.about-icon` /
 *   `.dual-pane-icon`），复合规则会生效，不算空转；
 *   若 `.text-orange` 是那个元素上**唯一**的着色类，则必须有单条 `.text-orange`
 *   规则兜住，否则它拿继承色。
 *
 * 盲区（写出来叫纪律）：只认识 `className="…"` 字面量与模板串里的字面片段；
 * 完全由变量拼出来的类名看不见。真要覆盖那种写法得走 AST，是另一个决定。
 */

const SRC = resolve(__dirname, "..");

/** 被本守卫视为"着色类名"的名单：语义就是「给这个元素上颜色」。 */
const COLOR_CLASSES = ["text-orange", "text-cyan"];

/** 已知的宿主类：它们与着色类名组成复合规则时算生效。 */
const HOST_CLASSES = ["about-icon", "dual-pane-icon", "graph-pane-icon"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const TSX = sourceFiles(SRC);

/**
 * 单个类名在样式表里有没有**可用的规则**。
 *
 * "可用"的判据（这条守卫的适用范围，写清楚免得它自己被放宽）：
 *   - 选择器的**主体**（最后一段复合选择器）里只有一个类，且那个类就是它；
 *   - 允许带祖先限定（`.app-shell .text-orange`）——那是**作用域**，不是身份。
 *     这不是随手放宽：工具类必须限定在 `.app-shell` 之下，否则闪念胶囊窗口
 *     （也用这两个类名，且**不消费任何全局变量**，规则 9）会被 `theme-mode`
 *     守卫正确地判为"胶囊引用了全局变量"。限定作用域是那个约束的正确解法。
 *   - 不允许「选择器主体里还有别的类」：`.about-icon.text-orange` 是复合身份，
 *     而裸用的元素上根本没有 `.about-icon`；
 *   - 不允许标签限定（`div.text-orange`），那对裸用的 `<svg>` 不成立。
 */
function hasStandaloneRule(css: string, cls: string): boolean {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const m of clean.matchAll(/([^{}]+)\{/g)) {
    for (const part of m[1].split(",")) {
      const sel = part.trim();
      if (!sel) continue;
      // 主体 = 最后一段复合选择器（按后代/子组合符切开）
      const compounds = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
      const subject = compounds[compounds.length - 1];
      if (!subject) continue;
      const classes = [...subject.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((x) => x[1]);
      if (classes.length !== 1 || classes[0] !== cls) continue;
      // 主体里剩下的只能是伪类（:hover 等），不能是标签名
      const rest = subject
        .replace(/\.-?[A-Za-z_][\w-]*/g, "")
        .replace(/:[a-zA-Z-]+(\([^)]*\))?/g, "")
        .trim();
      if (rest === "") return true;
    }
  }
  return false;
}

const BUNDLE = loadAppCssBundle();

interface Site {
  file: string;
  line: number;
  cls: string;
  siblings: string[];
}

/** 扫描 `className="…"` 与模板串里 `className={`…`}` 的字面片段。 */
function sitesIn(text: string, file: string): Site[] {
  const out: Site[] = [];
  const lineAt = (at: number) => text.slice(0, at).split("\n").length;

  const collect = (raw: string, at: number) => {
    const tokens = raw.split(/\s+/).filter((t) => /^[A-Za-z][\w-]*$/.test(t));
    for (const cls of COLOR_CLASSES) {
      if (!tokens.includes(cls)) continue;
      out.push({
        file,
        line: lineAt(at),
        cls,
        siblings: tokens.filter((t) => t !== cls),
      });
    }
  };

  for (const m of text.matchAll(/className="([^"]*)"/g)) collect(m[1], m.index!);
  for (const m of text.matchAll(/className=\{`([^`]*)`\}/g)) collect(m[1], m.index!);
  // 模板串里可能嵌表达式：`view-mode-btn ${x ? "active text-cyan" : ""}`
  for (const m of text.matchAll(/className=\{`([\s\S]*?)`\}/g)) {
    for (const inner of m[1].matchAll(/"([^"]*)"/g)) collect(inner[1], m.index! + inner.index!);
  }
  return out;
}

/**
 * 已知的**刻意不覆盖**站点：闪念胶囊窗口。
 *
 * 胶囊也用这两个类名（图钉 / 模板 / 链接 / 文件夹，共 4 处），但胶囊
 * **不消费任何全局变量**（规则 9：它把 data-theme 写到 documentElement，
 * 读全局令牌会让解析前后外观不一致——`theme-mode.test.ts` 会拦）。所以工具类
 * 限定在 `.app-shell` 之下，胶囊这 4 处保持继承色。
 *
 * 列出来而不是"反正扫不到"：这份名单是**账**，胶囊哪天要着色就得在这里加令牌、
 * 而不是悄悄放宽判据。
 */
const CAPSULE_FILES = [
  "components/FlashHeader.tsx",
  "components/flash/",
  "components/FlashCapsule.tsx",
];
const isCapsuleSite = (file: string) =>
  CAPSULE_FILES.some((p) => file.replace(/\\/g, "/").includes(p));

const ALL_SITES = TSX.flatMap((f) => sitesIn(readFileSync(f, "utf8"), f.slice(SRC.length + 1)));

describe("着色类名守卫（用到的类名必须有规则）", () => {
  it("扫描器本身有效（否则会静默全绿）", () => {
    expect(TSX.length, "没扫到任何 tsx 文件").toBeGreaterThan(50);
    expect(ALL_SITES.length, `没扫到任何着色类名用法（${ALL_SITES.length}）`).toBeGreaterThan(10);
    // 反向对照：这条守卫必须能看见"有伴随类"的用法，否则它只是在数空集。
    expect(
      ALL_SITES.some((s) => s.siblings.length > 0),
      "扫到的用法全都没有伴随类——扫描器可能只匹配了一种形状",
    ).toBe(true);
    // 两条边界的反向对照：主窗口站点与胶囊站点都必须被扫到，否则下面的
    // "胶囊被排除"只是碰巧——范围静默缩小照样全绿。
    expect(
      ALL_SITES.some((s) => !isCapsuleSite(s.file)),
      "没扫到任何主窗口站点——排除胶囊后判据会变成空集",
    ).toBe(true);
    expect(
      ALL_SITES.some((s) => isCapsuleSite(s.file)),
      "没扫到任何胶囊站点——那这条边界就不存在，判据在测空气",
    ).toBe(true);
  });

  it("每一条着色类名规则都是真实存在的单条规则（不是只有复合规则）", () => {
    for (const cls of COLOR_CLASSES) {
      expect(
        hasStandaloneRule(BUNDLE.css, cls),
        `样式表里没有可用的 .${cls} 规则——裸用它的元素会拿到继承色，` +
          `而写代码的人以为它上了颜色。要么补一条工具类，要么把裸用改成语义类名`,
      ).toBe(true);
    }
  });

  it("主窗口的每条裸用都能被规则兜住（这是 23 个元素当初踩的坑）", () => {
    const offenders = ALL_SITES.filter(
      (s) =>
        !isCapsuleSite(s.file) &&
        !s.siblings.some((x) => HOST_CLASSES.includes(x)) &&
        !hasStandaloneRule(BUNDLE.css, s.cls),
    ).map((s) => `${s.file}:${s.line}  className="${s.cls}" 是唯一着色类，且没有可用规则`);
    expect(offenders, `这些元素以为自己在着色，实际拿的是继承色：${offenders.join(" | ")}`).toEqual(
      [],
    );
  });

  it("胶囊站点确实被排除，且数量对得上（4 处，是账不是漏网）", () => {
    const capsuleSites = ALL_SITES.filter((s) => isCapsuleSite(s.file));
    expect(
      capsuleSites.length,
      `胶囊站点数变了（现在 ${capsuleSites.length} 处）。它刻意不覆盖（规则 9：胶囊不消费全局变量）；` +
        `若新增了用法，要么同样列进这份账，要么为胶囊自己的 --flash-* 体系补对应令牌`,
    ).toBe(4);
  });

  it("宿主类 + 着色类名的复合用法仍然算生效（不误报）", () => {
    // 反向对照：造一个带宿主类的站点，它必须不被报出来。
    const synthetic = sitesIn('<i className="about-icon text-orange" />', "x.tsx");
    expect(synthetic.length, "带宿主类的用法没被扫到").toBe(1);
    expect(synthetic[0].siblings).toContain("about-icon");
    expect(
      synthetic[0].siblings.some((x) => HOST_CLASSES.includes(x)),
      "带宿主类的用法被误判为空转",
    ).toBe(true);
  });

  it("hasStandaloneRule 的边界：祖先限定算通过，复合身份与标签限定必须说不", () => {
    // 复合身份：裸用的元素上没有 `.about-icon`，所以它不算兜住裸用。
    expect(hasStandaloneRule(".about-icon.text-orange{color:red}", "text-orange")).toBe(false);
    // 纯工具类。
    expect(hasStandaloneRule(".text-orange{color:red}", "text-orange")).toBe(true);
    expect(hasStandaloneRule(".text-orange:hover{color:red}", "text-orange")).toBe(true);
    // 祖先限定是**作用域**，算通过——工具类限定在 .app-shell 之下是必需的
    // （否则胶囊会被 theme-mode 守卫判为引用全局变量）。
    expect(hasStandaloneRule(".app-shell .text-orange{color:red}", "text-orange")).toBe(true);
    expect(hasStandaloneRule('[data-theme="light"] .text-orange{color:red}', "text-orange")).toBe(
      true,
    );
    // 标签限定对裸用的 `<svg>` 不成立。
    expect(hasStandaloneRule("div.text-orange{color:red}", "text-orange")).toBe(false);
  });

  it("着色令牌在每个主题块都能解析（否则声明被丢弃，图标退回继承色）", () => {
    // `.app-shell .text-orange { color: var(--icon-orange) }` 里令牌若未定义，
    // 整条 color 声明会被浏览器丢弃——那正是这次修的那个坑的另一种形态。
    for (const token of ["--icon-orange", "--icon-cyan"]) {
      expect(
        new RegExp(`${token}\\s*:`).test(BUNDLE.css),
        `${token} 没有定义：引用它的声明会被整条丢弃`,
      ).toBe(true);
    }
  });
});
