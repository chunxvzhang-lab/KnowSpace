import { describe, it, expect, beforeEach } from "vitest";
import { resolveThemeMode } from "../services/themeMode";
import { loadPreferences } from "../services/storage";
import type { ThemeMode } from "../core/types";

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
