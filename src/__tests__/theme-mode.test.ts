import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveThemeMode } from "../services/themeMode";
import { loadPreferences } from "../services/storage";
import type { ThemeMode } from "../core/types";

/** 注释先剥掉：注释里会以散文形式提到 `var(--flash-accent)` 之类，会被误当成引用。 */
const RAW_CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
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
  /** 闪念胶囊那一段 CSS（切片起点必须是标记所在注释的开头，理由见对比度测试）。 */
  function capsuleSection(): string {
    const marker = RAW_CSS.indexOf("KnowSpace Flash Capsule (闪念胶囊) Floating");
    const end = RAW_CSS.indexOf("Space Timeline & Flash Notes Hub Panel Styles");
    expect(marker, "找不到闪念胶囊区块的起始注释").toBeGreaterThan(-1);
    expect(end, "找不到区块结束标记").toBeGreaterThan(marker);
    // 用未剥注释的原文切片（标记本身就在注释里），切完再剥——否则注释里的散文
    // `var(--flash-accent)` 会被当成真实引用。
    return RAW_CSS.slice(RAW_CSS.lastIndexOf("/*", marker), end).replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
  }

  /**
   * 组件实际会挂上去的类名。
   *
   * 模板字符串里的三元分支（`` `flash-tab-btn ${x ? "active" : ""}` ``）里的字面量也是
   * 真实类名，所以先把 `${…}` 换成它内部的字符串字面量，再按空白切。
   */
  function capsuleClassNames(): Set<string> {
    const src = readFileSync(resolve(__dirname, "../components/FlashCapsule.tsx"), "utf8");
    const out = new Set<string>();
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
      const chunk = (m[1] ?? m[2] ?? m[3] ?? "").replace(
        /\$\{([^}]*)\}/g,
        (_all, expr: string) => (expr.match(/"([^"]*)"/g) ?? []).join(" ")
      );
      for (const token of chunk.replace(/["'`]/g, " ").split(/\s+/)) {
        if (/^[a-z][\w-]*$/.test(token)) out.add(token);
      }
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
    const capsuleClasses = capsuleClassNames();
    expect(
      [...capsuleClasses].filter((c) => c.startsWith("flash-")).length,
      "没扫到 flash- 类名，说明类名提取坏了"
    ).toBeGreaterThan(40);

    // 带 `flash-` 的选择器是**期望内**的——`[data-theme="light"] .flash-title` 这类规则
    // 正是这次修复的产物（`data-theme` 被解析成具体值之后才第一次生效）。
    // 要拦的是「主窗口的规则渗进胶囊」。
    //
    // 「可能命中」= 选择器里出现的**每一个**类都在胶囊的类名集合里。只要求「有交集」
    // 是错的：`.space-tab-btn.active` 与胶囊的 `.flash-tab-btn.active` 共享 `active`，
    // 但胶囊元素没有 `space-tab-btn`，实际匹配不到。
    const offenders = themeSelectors().filter((sel) => {
      if (sel.includes("flash-")) return false;
      const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      return classes.length > 0 && classes.every((c) => capsuleClasses.has(c));
    });

    expect(
      [...new Set(offenders)],
      `这些非 flash 的 [data-theme] 规则能命中胶囊元素，解析 data-theme 会改变它的外观：\n${[...new Set(offenders)].join("\n")}`
    ).toEqual([]);
  });

  it("无类名的 [data-theme] 规则只定义 :root 变量——而胶囊不消费任何全局变量", () => {
    // 带类名的规则已被上一条排除；剩下能命中胶囊窗口的只有 :root / html / body 这类
    // 全局元素。它们唯一的用途是定义 CSS 变量，所以只要胶囊不读全局变量，就影响不到它。
    const classless = themeSelectors().filter((sel) => !/\.\w/.test(sel));
    const targets = [...new Set(classless.map((s) => s.split(" ").pop() ?? s))];
    expect(
      targets.filter((t) => !/^(:root|html|body)\b/.test(t)),
      `出现了非 :root/html/body 的无类名主题规则，需要单独判断它会不会命中胶囊：${targets.join(", ")}`
    ).toEqual([]);

    const refs = [...capsuleSection().matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    expect(refs.length, "一个 var() 都没扫到，说明区块切片坏了").toBeGreaterThan(20);
    const globalRefs = [...new Set(refs.filter((r) => !r.startsWith("--flash-")))];
    expect(
      globalRefs,
      `胶囊引用了全局变量，解析 data-theme 会连带改变它的外观：${globalRefs.join(", ")}`
    ).toEqual([]);
  });
});
