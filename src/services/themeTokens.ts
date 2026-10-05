import type { ThemeMode } from "../core/types";

/**
 * TS 侧读取主题令牌的单一入口（阶段 C1）。
 *
 * 为什么需要它：`--accent-info` 在 CSS 里已经按主题定义好（tokens.css），DOM 内联样式
 * 写 `var(--accent-info)` 就自动跟随。但有一类消费者拿不到级联——Cytoscape 的样式表、
 * SVG/PNG 导出器、canvas 调色板——它们要的是**解析后的字面色值**。这些调用点原先各自
 * 手写 `isDark ? "#38bdf8" : "#0284c7"` 三元组（全仓 45 处），而 `#0284c7` 在白底只有
 * 4.10:1，低于正文阈值；这正是 tokens.css 修过的那半个 bug 在 TS 里的残留形状。
 *
 * 取值策略与 `resolveThemeMode()` 一致：`"system"` 先按操作系统偏好落到具体主题，
 * 然后查下表。**下表必须与 tokens.css 的各主题 `--accent-info` 定义同值**——守卫测试
 * （`tsx-accent-info.test.ts`）直接比对两边，漂移即红。不改成 getComputedStyle 实时
 * 读取是有意的：jsdom 对自定义属性的支持不完整，守卫会测不到东西；而这里是一份
 * 有守卫钉住的镜像表，改令牌忘了同步这边会被立刻点名。
 */

export type AccentInfoTokens = {
  /** 十六进制实色，可直接交给 Cytoscape / SVG attribute / React style。 */
  accent: string;
  /** 通道三元组字符串（"r, g, b"），供 `rgba(${…}, α)` 合成淡底与光晕。 */
  accentRgb: string;
};

/**
 * 主题 → 青色强调色。键是解析后的具体主题（不含 "system"）。
 * 与 tokens.css 的对应块：light/eink → `#0369a1`（白底 5.93:1），
 * twitter/system-dark → `#38bdf8`（黑底 9.80:1）。
 */
const ACCENT_BY_THEME: Record<"light" | "eink" | "twitter", AccentInfoTokens> = {
  light: { accent: "#0369a1", accentRgb: "3, 105, 161" },
  eink: { accent: "#0369a1", accentRgb: "3, 105, 161" },
  twitter: { accent: "#38bdf8", accentRgb: "56, 189, 248" },
};

/** 把可能为 "system" 的用户主题解析成镜像表的键。 */
function themeKey(theme: ThemeMode, prefersDark?: boolean): "light" | "eink" | "twitter" {
  if (theme === "light") return "light";
  if (theme === "eink") return "eink";
  if (theme === "twitter") return "twitter";
  // system：跟随操作系统，深色走 twitter 项——与 resolveThemeMode() 同一语义。
  // L2 不许直接摸 window（eslint 分层规则，新文件不豁免）：调用方在 L4 时传入
  // 自己的 matchMedia 结果；缺省按 light——`getAccentInfo("system")` 的两种解析
  // 值里 light 是安全侧（浅色令牌在深浅底上都不低于阈值）。
  return prefersDark ? "twitter" : "light";
}

/**
 * 青色强调色令牌（十六进制 + 通道三元组）。
 *
 * @param theme 用户设置的主题，可能是 `"system"`
 * @param prefersDark 仅当 `theme === "system"` 时被读取：调用方解析出的
 *   `prefers-color-scheme: dark`。省略时按浅色处理。
 */
export function getAccentInfo(theme: ThemeMode, prefersDark?: boolean): AccentInfoTokens {
  return ACCENT_BY_THEME[themeKey(theme, prefersDark)];
}

/** 只要十六进制实色的便捷出口（多数调用点不需要 alpha 合成）。 */
export function getAccentInfoHex(theme: ThemeMode): string {
  return getAccentInfo(theme).accent;
}
