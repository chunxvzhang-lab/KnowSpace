import type { ThemeMode } from "../core/types";

/** 解析后的主题：一定是一个具体主题，不会是 `"system"`。 */
export type ResolvedThemeMode = Exclude<ThemeMode, "system">;

/**
 * 把 `ThemeMode` 解析成真正用于渲染的具体主题。
 *
 * 为什么必须有这一步：CSS 里的浅色覆盖全部写在 `.theme-light` / `[data-theme="light"]`
 * 上，`"system"` 没有对应的一套。而 `"system"` 是**默认值**（`loadPreferences()` 的
 * fallback），于是"跟随系统 + 浅色系统"这条最常见的路径拿到的是：白底胶囊配深色主题的
 * 文字色——白水洗底上的 `#cbd5e1` 只有 1.48:1，基本等于看不见。
 *
 * 这个坑原本是靠手工复制补的：CSS 里有一组
 * `@media (prefers-color-scheme: light) { .flash-capsule-overlay.theme-system … }`，
 * 只覆盖了容器和两个 textarea（面积大的控件），预设标签、徽章、小按钮、Tab 一个没补。
 * 复制本身才是病根，所以在渲染层解析一次，让 `.theme-light` 成为浅色的唯一入口。
 *
 * 调用方必须把结果同时用于 overlay 的类名**和** `data-theme`：胶囊区块里的浅色覆盖
 * 一半写成 `.flash-capsule-overlay.theme-light …`、一半写成 `[data-theme="light"] …`，
 * 只解析其中一个，另一族规则就会在"跟随系统 + 浅色系统"下静默失效。
 * 胶囊是独立窗口，改它自己的 `data-theme` 不会影响主窗口（主窗口另有一套
 * `:root[data-theme="system"]` 的媒体查询规则，那里仍然需要原始值）。
 *
 * @param theme 用户设置的主题，可能是 `"system"`
 * @param prefersLight 操作系统当前是否浅色（`prefers-color-scheme: light`）
 */
export function resolveThemeMode(
  theme: ThemeMode,
  prefersLight: boolean
): ResolvedThemeMode {
  if (theme !== "system") return theme;
  // 深色走 "twitter"：它就是主题表里的深色项，胶囊区块没有 `.theme-twitter`
  // 规则，因此落到基线（也就是现在的深色外观），视觉上与改前一致。
  return prefersLight ? "light" : "twitter";
}
