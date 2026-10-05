import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadAppCss } from "./helpers/loadAppCss";
import { getAccentInfo } from "../services/themeTokens";

/**
 * TSX/TS 侧青色强调色守卫（阶段 C1）。
 *
 * `--accent-info` 在 CSS 里已经按主题定值并由 `css-accent-info.test.ts` 守住，
 * 但渲染器之外还有一路消费者拿不到级联：Cytoscape 样式表、SVG/PNG 导出、画布调色板。
 * 它们原先手写 `isDark ? "#38bdf8" : "#0284c7"` 三元组——`#0284c7` 白底只有 4.10:1，
 * 正是令牌修掉的那半个 bug 在 TS 里的残留形状。本守卫把同一口径延伸到源码：
 *
 * 1. **字面量清零**：`src` 生产代码里不许再出现青色族的十六进制或通道三元组，
 *    除非在允许清单上。清单成员必须写明「为什么是合法的青色」而不是漏网。
 * 2. **镜像表与 CSS 同源**：`themeTokens.ts` 的取值必须逐主题等于应用样式表里
 *    `--accent-info` 的定义。两边漂移（改了令牌没改表，或反之）在这里变红——
 *    JS 拿的是复制品，复制品必须有成对断言（规则 5），否则它比没有更危险。
 */

const SRC_ROOT = resolve(__dirname, "..");

/** 收集 src 下的生产 .ts/.tsx（排除测试与本守卫自己）。 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- ① 字面量清零

/**
 * 允许清单：路径 → 该文件里允许出现的青色字面量个数。
 * - `services/themeTokens.ts`：镜像表的定义处，就是单一事实来源本身。
 * - `core/mindmapPalette.ts` / `core/mindmapThemes.ts` / `services/graphService.ts` /
 *   `services/mindmapMeasure.ts` / `components/MindmapNodeStyleMenu.tsx`：
 *   「天蓝」是用户可选手动标记色（写进文档注释、跨主题不随 UI 变），不是主题强调色。
 *   它们的正确性由各自的语义测试钉住（如 mindmap-palette.test.ts）。
 */
const ALLOWED_LITERAL_FILES = new Set([
  "services/themeTokens.ts",
  "core/mindmapPalette.ts",
  "core/mindmapThemes.ts",
  "services/graphService.ts",
  "services/mindmapMeasure.ts",
  "components/MindmapNodeStyleMenu.tsx",
]);

// #0284c7 也在清单内：它是被替换掉的旧浅色，回流即回归。
const CYAN_FAMILY =
  /#38bdf8\b|#0284c7\b|rgba\(\s*56\s*,\s*189\s*,\s*248|rgba\(\s*2\s*,\s*132\s*,\s*199/i;

describe("TSX 青色强调色（阶段 C1）", () => {
  it("生产代码不再手写青色族字面量（除允许清单）", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
      if (ALLOWED_LITERAL_FILES.has(rel)) continue;
      // 剥注释：说明文字里会引用旧值做对照（「原来的 #0284c7 不达阈值」），
      // 那是文档不是渲染；补回等长空格以保持行号可读。
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, (m) =>
        m.replace(/[^\n]/g, " "),
      );
      for (const [i, line] of code.split(/\r?\n/).entries()) {
        if (CYAN_FAMILY.test(line)) offenders.push(`${rel}:${i + 1}`);
      }
    }
    expect(
      offenders,
      `这些行应改用 var(--accent-info) 或 themeTokens：${offenders.join(" | ")}`,
    ).toEqual([]);
  });

  it("允许清单没有腐坏：清单外文件若已无字面量就该出列", () => {
    // 白名单是债务台账不是许可证：某文件的青色都搬走了，清单就得多一行删除。
    const stillNeeded = new Set<string>();
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
      if (!ALLOWED_LITERAL_FILES.has(rel)) continue;
      const raw = readFileSync(file, "utf8");
      if (CYAN_FAMILY.test(raw)) stillNeeded.add(rel);
    }
    const stale = [...ALLOWED_LITERAL_FILES].filter((f) => !stillNeeded.has(f));
    expect(stale, `清单里这些文件已经没有青色字面量了，移除它们：${stale.join(" | ")}`).toEqual([]);
  });

  // ------------------------------------------------------------ ② 镜像表同源核对

  it("themeTokens 的镜像表与各主题 --accent-info 定义同值", () => {
    const css = loadAppCss();
    /** 取 `--accent-info` 在某主题下的生效值（与 CSS 级联同语义：后出现的块覆盖先出现的）。 */
    function tokenOf(theme: "light" | "eink" | "twitter"): string {
      // :root 是默认主题＝浅色基线；各主题块在其后覆写。system 的深色分支写在
      // :root[data-theme="system"] 里，与 twitter 同值（tokens.css 的成对维护）。
      const selectors = theme === "light" ? [":root"] : [":root", `:root[data-theme="${theme}"]`];
      let value: string | null = null;
      for (const sel of selectors) {
        const re = new RegExp(escapeRe(sel) + "\\s*\\{([\\s\\S]*?)\\n\\}", "m");
        const m = re.exec(css);
        expect(m, `应用样式表里找不到 ${sel} 块`).toBeTruthy();
        const decl = /--accent-info\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(m![1]);
        if (decl) value = decl[1].toLowerCase();
      }
      expect(value, `${theme} 主题没有生效的 --accent-info 定义`).toBeTruthy();
      return value!;
    }
    expect(getAccentInfo("light").accent.toLowerCase()).toBe(tokenOf("light"));
    expect(getAccentInfo("eink").accent.toLowerCase()).toBe(tokenOf("eink"));
    expect(getAccentInfo("twitter").accent.toLowerCase()).toBe(tokenOf("twitter"));

    // -rgb 三元组必须与十六进制指向同一颜色（与 CSS 侧守卫同一口径，防两边分开维护漂移）。
    for (const theme of ["light", "eink", "twitter"] as const) {
      const t = getAccentInfo(theme);
      const hex = t.accent.replace("#", "");
      const full =
        hex.length === 3
          ? hex
              .split("")
              .map((c) => c + c)
              .join("")
          : hex;
      const nums = t.accentRgb.split(",").map((s) => Number(s.trim()));
      expect(nums.length).toBe(3);
      expect(nums).toEqual([0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)));
    }
  });

  it("system 主题解析到具体主题（跟随系统 = light/twitter）", () => {
    // jsdom 默认 prefers-color-scheme: dark 不匹配 → system 解析为 light。
    expect(getAccentInfo("system")).toEqual(getAccentInfo("light"));
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
