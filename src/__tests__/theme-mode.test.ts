import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { resolveThemeMode } from "../services/themeMode";
import { loadPreferences } from "../services/storage";
import { loadAppCss } from "./helpers/loadAppCss";
import type { ThemeMode } from "../core/types";

/**
 * 注释先剥掉：注释里会以散文形式提到 `var(--flash-accent)` 之类，会被误当成引用。
 *
 * 读整个应用样式表（`loadAppCss()`）而不是 styles.css 一个文件：本守卫判断的是
 * 「主窗口的 `[data-theme]` 规则会不会渗进胶囊窗口」，而主题规则现在分布在
 * `src/styles/*.css` 切片里——只看一个物理文件＝守卫范围静默缩小。
 */
const RAW_CSS = loadAppCss();
const CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * `resolveThemeMode` 的守卫。
 *
 * 为什么这条值得单独测：它决定了浅色覆盖**能不能到达用户**。改前系统主题直接把
 * `"system"` 当类名用，CSS 里所有 `.theme-light` / `[data-theme="light"]` 规则都匹配
 * 不到，于是"跟随系统 + 浅色系统"这条默认路径拿到的是白底胶囊配深色主题的文字色。
 * 一个函数名写错、或者有人把它改回直接透传，都会让整套浅色配色静默失效——而
 * 静默失效正是这个 bug 拖了这么久才被发现的原因。
 */
describe("resolveThemeMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("具体主题原样返回", () => {
    for (const t of ["light", "twitter", "eink"] as const) {
      expect(resolveThemeMode(t, true)).toBe(t);
      expect(resolveThemeMode(t, false)).toBe(t);
    }
  });

  it("system + 浅色系统 → light", () => {
    expect(resolveThemeMode("system", true)).toBe("light");
  });

  it("system + 深色系统 → twitter（主题表里的深色项）", () => {
    expect(resolveThemeMode("system", false)).toBe("twitter");
  });

  it("永远不返回 system", () => {
    // 返回 "system" 就等于渲染出 `theme-system` 类名，而 CSS 里没有任何
    // 针对它的规则——会静默退回基线（深色）取值。
    const all: ThemeMode[] = ["system", "light", "twitter", "eink"];
    for (const t of all) {
      for (const prefersLight of [true, false]) {
        expect(resolveThemeMode(t, prefersLight)).not.toBe("system");
      }
    }
  });

  it("system 是默认设置——所以这条路径就是默认路径，不是边缘情况", () => {
    expect(loadPreferences().theme).toBe("system");
  });
});

/**
 * 解析前移的**前提**：胶囊窗口把 `data-theme` 从原始的 `"system"` 换成解析后的具体值
 * （见 `FlashCapsule.applyTheme`），这件事之所以不改变任何外观，靠的是两条结构事实。
 * 两条都不是"显然成立"的——任何人往胶囊里加一个全局类、或让胶囊读一个全局变量，
 * 都会静默破坏它，而症状（某个主题下颜色变了）与这两行代码相隔很远。
 */
describe("胶囊窗口解析 data-theme 的前提", () => {
  /**
   * 「选择器可能命中胶囊元素」的唯一判据，两条断言共用。
   *
   * 必须是**每一个**类都在胶囊类名集合里；只要求「有交集」是错的：
   * `.space-tab-btn.active` 与胶囊的 `.flash-tab-btn.active` 共享 `active`，
   * 但胶囊元素没有 `space-tab-btn`，实际匹配不到。（这条口径原本只写在渗漏断言
   * 里，改成按选择器取胶囊规则时如果复制一遍，就会出现两条断言各用一套范围。）
   *
   * 先把 `.theme-<T>` 摘掉再比：主题类挂在容器/overlay 上（`FlashCapsule.tsx:294`
   * 的 `theme-${resolvedTheme}`），它由**主题系统**产生而不是组件的 className 字面量，
   * 类名提取抓不到。不摘的话 `.flash-capsule-overlay.theme-light …` 那一族会被
   * 判成「非胶囊规则」，守卫范围从 191 条静默缩到 121 条——正是本文件要拦的形状。
   * 摘掉 `.theme-*` 是安全的：主题名与 `ThemeMode` 同源（`css-theme-vocabulary`
   * 守卫保证），而它不会替元素身份说话——`.editor-pane.theme-light` 摘完仍是
   * `.editor-pane`，照样不属于胶囊。
   */
  function canMatchCapsule(selector: string): boolean {
    const classes = [...selector.replace(/\.theme-[\w-]+/g, "").matchAll(/\.([\w-]+)/g)].map(
      (m) => m[1],
    );
    return classes.length > 0 && classes.every((c) => CAPSULE_CLASSES.has(c));
  }

  /**
   * 胶囊的规则 = **选择器能命中胶囊元素的那些**，不再按注释标记切连续区块。
   *
   * 原来取「起始注释 → 结束注释」之间的一段。阶段 B 之后那对标记会横跨两个文件
   * （起点在切片里，终点还在 `styles.css` 里），而在拼接文本上「起点到终点」之间
   * 夹着的其实是**别的域**——范围会静默扩大，断言照旧全绿，检查的却不是胶囊。
   * 这和对比度测试当年「按连续区块取范围漏掉 wikilink 下拉」是同一个坑，
   * 结论也一样：范围只能由选择器决定。
   */
  function capsuleRules(): { selector: string; body: string }[] {
    const out: { selector: string; body: string }[] = [];
    for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].replace(/\s+/g, " ").trim();
      if (!canMatchCapsule(selector)) continue;
      out.push({ selector, body: m[2] });
    }
    return out;
  }

  /** 胶囊规则里引用的 CSS 变量。 */
  function capsuleVarRefs(): string[] {
    const refs: string[] = [];
    for (const rule of capsuleRules())
      for (const m of rule.body.matchAll(/var\(\s*(--[\w-]+)/g)) refs.push(m[1]);
    return refs;
  }

  /** 组件实际会挂上去的类名（两条断言共用，见 canMatchCapsule）。 */
  const CAPSULE_CLASSES = capsuleClassNames();

  /**
   * 组件实际会挂上去的类名。
   *
   * 胶囊窗口的 UI 拆在 FlashCapsule.tsx（根）与 `components/flash/` 下的视图
   * 组件里，所以类名集合 = 根 + flash 目录下全部 .tsx（视图是逐字搬过去的，
   * 集合与拆分前一致；新增视图文件会被自动纳入守卫范围）。
   *
   * 模板字符串里的三元分支（`` `flash-tab-btn ${x ? "active" : ""}` ``）里的字面量也是
   * 真实类名，所以先把 `${…}` 换成它内部的字符串字面量，再按空白切。
   *
   * 还要**再把源文件里的字符串字面量整体扫一遍**：状态类常常不是写在 className 里，
   * 而是从状态映射出来（`.flash-status-msg.saving / .saved / .error` 的 `saving` 来自
   * `statusClass` 之类的变量）。只扫 className 会漏掉这三个，而漏掉的后果是**守卫
   * 变窄却全绿**——这条判据宁可宽松（多算几个类只会让断言更严），不可漏算。
   */
  function capsuleClassNames(): Set<string> {
    const flashDir = resolve(__dirname, "../components/flash");
    const sources = [
      resolve(__dirname, "../components/FlashCapsule.tsx"),
      ...readdirSync(flashDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
        .map((e) => resolve(flashDir, e.name)),
    ];
    const out = new Set<string>();
    const keep = (token: string) => {
      if (/^[a-z][\w-]*$/.test(token)) out.add(token);
    };
    for (const file of sources) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
        const chunk = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{([^}]*)\}/g, (_all, expr: string) =>
          (expr.match(/"([^"]*)"/g) ?? []).join(" "),
        );
        for (const token of chunk.replace(/["'`]/g, " ").split(/\s+/)) keep(token);
      }
      // 状态映射出来的类名：任何形如 "saving" 的字面量都算候选。
      for (const m of src.matchAll(/["']([a-z][\w-]*)["']/g)) keep(m[1]);
    }
    return out;
  }

  /** 所有含 `[data-theme]` 的规则的选择器（拆逗号后的单条）。 */
  function themeSelectors(): string[] {
    const out: string[] = [];
    for (const m of CSS.matchAll(/([^{}]*\[data-theme[^{}]*)\{/g)) {
      for (const sel of m[1].split(",")) out.push(sel.trim().replace(/\s+/g, " "));
    }
    return out;
  }

  it("除 flash- 自己的主题覆盖外，没有 [data-theme] 规则能命中胶囊里的元素", () => {
    expect(
      [...CAPSULE_CLASSES].filter((c) => c.startsWith("flash-")).length,
      "没扫到 flash- 类名，说明类名提取坏了",
    ).toBeGreaterThan(40);

    // 带 `flash-` 的选择器是**期望内**的——`[data-theme="light"] .flash-title` 这类规则
    // 正是这次修复的产物（`data-theme` 被解析成具体值之后才第一次生效）。
    // 要拦的是「主窗口的规则渗进胶囊」；「可能命中」的判据与胶囊规则提取共用
    // canMatchCapsule，两条断言不能各拿一套范围口径。
    const offenders = themeSelectors().filter((sel) => {
      if (sel.includes("flash-")) return false;
      return canMatchCapsule(sel);
    });

    expect(
      [...new Set(offenders)],
      `这些非 flash 的 [data-theme] 规则能命中胶囊元素，解析 data-theme 会改变它的外观：\n${[...new Set(offenders)].join("\n")}`,
    ).toEqual([]);
  });

  it("无类名的 [data-theme] 规则只定义 :root 变量——而胶囊不消费任何全局变量", () => {
    // 带类名的规则已被上一条排除；剩下能命中胶囊窗口的只有 :root / html / body 这类
    // 全局元素。它们唯一的用途是定义 CSS 变量，所以只要胶囊不读全局变量，就影响不到它。
    const classless = themeSelectors().filter((sel) => !/\.\w/.test(sel));
    const targets = [...new Set(classless.map((s) => s.split(" ").pop() ?? s))];
    expect(
      targets.filter((t) => !/^(:root|html|body)\b/.test(t)),
      `出现了非 :root/html/body 的无类名主题规则，需要单独判断它会不会命中胶囊：${targets.join(", ")}`,
    ).toEqual([]);

    const rules = capsuleRules();
    // 解析器自检：判据坏掉的典型形状不是报错，而是**范围静默缩小后照常全绿**。
    // 190 条是今天（阶段 B 拆到 16 个文件之后）的实际数量；留 150 的地板，
    // 是因为"少了几条"往往来自提取器漏了某一族类名，而不是胶囊真的缩水。
    expect(rules.length, `只扫到 ${rules.length} 条胶囊规则——判据可能漏了某一族`).toBeGreaterThan(
      150,
    );
    const refs = capsuleVarRefs();
    expect(refs.length, "一个 var() 都没扫到，说明胶囊规则提取坏了").toBeGreaterThan(20);
    const globalRefs = [...new Set(refs.filter((r) => !r.startsWith("--flash-")))];
    expect(
      globalRefs,
      `胶囊引用了全局变量，解析 data-theme 会连带改变它的外观：${globalRefs.join(", ")}`,
    ).toEqual([]);
  });

  it("取范围的判据自身有效：两族动态类名都在范围内，主窗口规则被排除（负向对照）", () => {
    // 这一条不检查胶囊的配色，只检查「范围」这件事本身——它是上面两条断言的底座。
    // 历史上这类判据坏掉两次：一次按连续区块取范围漏掉整族 wikilink 规则，
    // 一次是拆文件后守卫仍全绿但只读一个物理文件。两种都是"静默变窄"。
    const rules = capsuleRules();
    const selectors = rules.map((r) => r.selector);

    // ① 主题类挂在容器上（`FlashCapsule.tsx:294` 的 `theme-${resolvedTheme}`），
    //    不会作为类名字面量出现在 className 里。摘掉 `.theme-*` 的归一化一旦失效，
    //    这一族（今天 66 条）会整片掉出范围而其余断言照旧全绿。
    expect(
      selectors.filter((s) => /\.theme-/.test(s)).length,
      "没有任何主题链规则在范围内——`.theme-*` 归一化失效了",
    ).toBeGreaterThan(10);

    // ② 状态类从变量映射出来（`saving` / `saved` / `error`），同样不是 className 字面量。
    expect(
      selectors.filter((s) => /flash-status-msg\.[a-z]/.test(s)).length,
      "状态类族掉出范围——类名提取退化成只扫 className",
    ).toBeGreaterThan(2);

    // ③ 反向：主窗口的规则绝不能被判成胶囊规则，否则「胶囊不消费全局变量」会被
    //    主窗口里合法使用 `var(--surface)` 的规则稀释，断言变成假绿。
    const leaked = selectors.filter((s) =>
      /\.(activity-bar|sidebar|tab-bar|chapter-list)\b/.test(s),
    );
    expect(leaked, `这些主窗口选择器被算进了胶囊范围：${leaked.slice(0, 3).join(" | ")}`).toEqual(
      [],
    );
  });
});
