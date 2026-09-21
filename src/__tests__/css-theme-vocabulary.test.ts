import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 主题词汇表守卫：CSS 里出现的主题名，必须是代码里真实存在的主题。
 *
 * 起因：`src/styles.css` 里有 **9 处 `[data-theme="dark"]` 选择器**，而
 * `ThemeMode` 只有 `"system" | "light" | "twitter" | "eink"`——**从来没有 `"dark"`**。
 * `"dark"` 是被改名成 `"twitter"` 的**遗留值**，代码里留了两处迁移/别名
 * （`src/services/storage.ts` 的 `raw.theme === "dark" ? "twitter"`、
 * `src/services/canvasTheme.ts` 的 `if (theme === "dark") return "twitter"`），
 * 所以 DOM 上的 `data-theme` 永远是 `light` / `eink` / `twitter`，
 * 那 9 条选择器**一条也匹配不上**。
 *
 * 它们当时**没有造成视觉 bug**——因为每条规则的逗号列表里都另有一个活的
 * `[data-theme="twitter"]` 选择器，规则照样生效。真正的危害是**教错词汇表**：
 * 下一个人想加一条深色覆盖，会照抄 `[data-theme="dark"]`，而那条**真的不会生效**，
 * 且不会报错、不会报视觉异常。这就是「无声失效」最省事的入口。
 *
 * 所以守卫不查「选择器是否生效」（那需要完整级联推导），只查一件更根本的事：
 * **CSS 里的主题名 ⊆ 代码里的主题名**。主题名和 `ThemeMode` 绑成单一事实来源——
 * 类型改了这里会跟着变，CSS 写了不存在的名字会立刻红。
 */

const CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
const TYPES = readFileSync(resolve(__dirname, "../core/types.ts"), "utf8");

/** 从 `export type ThemeMode = "system" | "light" | "twitter" | "eink";` 取出取值集合。 */
function themeModeUnion(): string[] {
  const m = TYPES.match(/export\s+type\s+ThemeMode\s*=\s*([^;]+);/);
  expect(m, "没找到 ThemeMode 类型定义——守卫的单一事实来源断了").not.toBeNull();
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const UNION = themeModeUnion();
const KNOWN = new Set(UNION);

// 剥注释并补回等量空格：注释里会以散文形式提到 `[data-theme="dark"]`（比如本文件旁边
// 的说明），不剥会被当成真的选择器。
const STRIPPED = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** CSS 里用到的 `data-theme="X"` 取值。 */
function dataThemeValues(): string[] {
  return [...STRIPPED.matchAll(/\[data-theme\s*=\s*["']([^"']+)["']\s*\]/g)].map((m) => m[1]);
}

/**
 * CSS 里用到的 `.theme-X` 类名。
 *
 * 只认**独立的**类名：`\.theme-` 前面必须是行首、空白或选择器分隔符，避免把
 * `.mindmap-theme-select` 这类「类名里恰好含 theme-」的误当成主题类。
 */
function themeClassValues(): string[] {
  return [...STRIPPED.matchAll(/(?:^|[\s,>+~(])\.theme-([\w-]+)/gm)].map((m) => m[1]);
}

describe("CSS 主题词汇表", () => {
  it("ThemeMode 类型解析出预期取值（守卫的前提）", () => {
    // 先证明单一事实来源本身是活的：解析失败或类型被清空时，下面的断言会变成空转。
    expect(UNION.length, `ThemeMode 解析结果: ${JSON.stringify(UNION)}`).toBeGreaterThanOrEqual(3);
    expect(UNION).toContain("light");
    expect(UNION).toContain("twitter");
    expect(UNION).toContain("eink");
  });

  it("扫到的主题名不是空集（守卫真的在扫东西）", () => {
    // 正则写坏时最容易出现的失败模式是「扫到 0 个 → 断言通过」。
    expect(dataThemeValues().length, "没扫到任何 data-theme 选择器").toBeGreaterThan(100);
    expect(themeClassValues().length, "没扫到任何 .theme-* 类").toBeGreaterThan(50);
  });

  it("每个 data-theme 取值都是真实主题", () => {
    const bad = [...new Set(dataThemeValues())].filter((v) => !KNOWN.has(v));
    expect(
      bad,
      `这些 data-theme 取值不存在于 ThemeMode（${UNION.join(" | ")}）: ${bad.join(", ")}` +
        `\n提示：深色主题叫 "twitter"，不是 "dark"——"dark" 是被改名前的遗留值，` +
        `写在 CSS 里永远不会匹配。`
    ).toEqual([]);
  });

  it("每个 .theme-* 类都是真实主题", () => {
    const bad = [...new Set(themeClassValues())].filter((v) => !KNOWN.has(v));
    expect(
      bad,
      `这些 .theme-* 类不存在于 ThemeMode（${UNION.join(" | ")}）: ${bad.join(", ")}`
    ).toEqual([]);
  });
});
