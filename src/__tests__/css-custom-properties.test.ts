import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * CSS 自定义属性（令牌）守卫。
 *
 * 起因：`var(--surface-3)` / `var(--text-secondary)` 这一类引用在仓库里共 **63 处**，
 * 而它们**从来没有被定义过**（`git log -S "--surface-3:" -- src/styles.css` 连初始提交
 * 都查不到）。它们看起来是照着一套外部设计系统的词汇写的（`--surface-3` /
 * `--text-secondary` / `--border-strong`），而本项目用的是
 * `--surface-2` / `--text-muted` / `--border-hover`。
 *
 * 后果**不是报错，而是静默失效**，而且有两种不同的失效形态——这一点很容易误判：
 *
 * | 写法 | 结果 |
 * | :--- | :--- |
 * | `color: var(--nope)` | var 解析不出 → 整条声明**被丢弃**（不是回退到默认值，是这条属性完全没应用） |
 * | `color: var(--nope, #fff)` | 用兜底值 → **看起来正常**，但永远拿不到主题值 |
 *
 * 第二种更阴：它不会坏，只会「一直是那个写死的值」。命令面板的 `var(--surface-1, #1e293b)`
 * 就是这一类——它是**自洽的深色面板**（深底 + `var(--text-normal, #f8fafc)` 浅字），
 * 所以任何主题下都读得清，只是浅色主题下会出现一块深色面板。**这类是设计问题，不是可读性问题**，
 * 所以本测试对「有兜底」的引用只做**允许清单**检查，不一律判失败。
 *
 * 真被这个守卫抓到的 bug（都是第一种形态）：
 * - `.tab-context-menu`：`border` 与 `box-shadow` 双双被丢弃 → 标签页右键菜单既没边框也没阴影；
 * - `.local-graph-header`：没有底色；
 * - `.item-snippet` / `.backlinks-empty-title`：`--text-secondary` 未定义 → 次要文字不显次要；
 * - `.mindmap-ctx-item` / `.mindmap-note-input` 等 **19 处**（9 处 `--text-primary` +
 *   10 处 `--text-tertiary`）：`--text-primary` 的兜底是近白色 `#e2e8f0`，而底色是
 *   **随主题**的 `var(--surface)` / `var(--surface-2)` → **浅色下 1.23:1、eink 1.17:1**。
 *   影响面是整个思维导图节点编辑 UI（右键菜单、笔记/链接/标签输入框、节点编号、
 *   浮动文字、图标按钮 hover、布局下拉），不是某一处；
 * - `AboutDialog` 的两处说明文字：`--text-subtle` 未定义且无兜底 → 颜色整条丢弃、改为继承。
 */

const SRC = resolve(__dirname, "..");

/** 递归收集 src 下的 .css / .ts / .tsx（排除测试目录本身）。 */
function sourceFiles(dir: string): { css: string[]; ts: string[] } {
  const css: string[] = [];
  const ts: string[] = [];
  (function walk(d: string) {
    for (const name of readdirSync(d)) {
      if (name === "node_modules" || name === "__tests__") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".css")) css.push(full);
      else if (name.endsWith(".ts") || name.endsWith(".tsx")) ts.push(full);
    }
  })(dir);
  return { css, ts };
}

/**
 * 去掉注释，**按注释里的换行数补回等量换行**。
 *
 * 直接删掉整段注释会连带吃掉它的换行，之后所有偏移相对真实文件前移，报出来的行号全是错的
 * （在同类守卫上实测差了 25 行）。行号是这个测试唯一的定位手段，错了等于没有。
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length))
    // TS/TSX 的行注释：只处理**行首**（避免误伤 `http://`）
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** 行号换算（stripComments 保持了行数，所以偏移可直接换算）。 */
function lineAt(text: string, at: number): number {
  let line = 1;
  for (let i = 0; i < at; i++) if (text[i] === "\n") line++;
  return line;
}

const { css: CSS_FILES, ts: TS_FILES } = sourceFiles(SRC);

// ---------------------------------------------------------------- 定义
const DEFINED = new Map<string, string[]>();
const define = (name: string, where: string) => {
  if (!DEFINED.has(name)) DEFINED.set(name, []);
  DEFINED.get(name)!.push(where);
};

const rel = (f: string) => f.replace(/\\/g, "/").replace(SRC.replace(/\\/g, "/") + "/", "");

for (const f of CSS_FILES) {
  const css = stripComments(readFileSync(f, "utf8"));
  // 自定义属性定义：`--name: value`（值里可以再含 var()，这里只取名字）
  for (const m of css.matchAll(/(?:^|[\s;{])--([A-Za-z][\w-]*)\s*:/g)) define("--" + m[1], rel(f));
}
for (const f of TS_FILES) {
  const src = stripComments(readFileSync(f, "utf8"));
  // 内联 style 对象里的键：`"--name": value` —— 这是本项目**唯一**的 JS 侧注入方式
  // （`setProperty` 只有两处，且都是 `cursor`，不涉及自定义属性）
  for (const m of src.matchAll(/["'`](--[A-Za-z][\w-]*)["'`]\s*:/g)) define(m[1], rel(f) + " (inline)");
}

// ---------------------------------------------------------------- 引用
interface Ref {
  name: string;
  file: string;
  line: number;
  hasFallback: boolean;
}
const REFS: Ref[] = [];
const scan = (text: string, file: string) => {
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z][\w-]*)\s*(,?)/g)) {
    REFS.push({
      name: m[1],
      file,
      line: lineAt(text, m.index!),
      hasFallback: m[2] === ",",
    });
  }
};
for (const f of CSS_FILES) scan(stripComments(readFileSync(f, "utf8")), rel(f));
for (const f of TS_FILES) scan(stripComments(readFileSync(f, "utf8")), rel(f));

/**
 * 允许「引用了但未定义」的令牌 —— 每一条都必须写明为什么它是安全的。
 *
 * 这个清单的**唯一**用途是承认「兜底值恒定生效、但结果正确」。往里加东西之前先问：
 * 是真的有主题覆盖兜住，还是只是把问题藏起来了？答案若是后者，就该修而不是加白名单。
 */
const ALLOW_UNDEFINED = new Map<string, string>([
  [
    "--surface-1",
    "命令面板 / 快速工具条：兜底 #1e293b 是自洽深色面板的一部分，浅色与 eink 配色由 " +
      "`[data-theme=\"light\"] .command-palette-*` 等显式覆盖兜住，实测不漏",
  ],
  [
    "--text-normal",
    "同上（命令面板）：与 --surface-1 的深底配对，浅色由显式覆盖改为 #0f172a / #1e293b",
  ],
  ["--border-color", "同上（命令面板）：浅色/eink 由显式覆盖给出边框色"],
  ["--bg-sidebar", "`.backlinks-panel`：兜底是 `transparent`，就是要融进所在面板，不是遗漏"],
  [
    "--bg-primary",
    "`main.tsx` 的 Suspense 加载占位。**这是已知未修问题**：`index.html` 没有「挂载前应用主题」" +
      "的引导脚本，所以此刻 `:root` 只有默认（浅色）值——把兜底从深色改成 `var(--bg)` 只会把" +
      "「浅色主题用户看到深色闪屏」换成「深色主题用户看到白色闪屏」，对谁都不算修。" +
      "正确修法是加引导脚本，已记入技术债",
  ],
]);

describe("CSS 自定义属性（令牌）守卫", () => {
  it("扫描器本身有效（否则会静默全绿）", () => {
    expect(CSS_FILES.length, "没扫到任何 css 文件").toBeGreaterThan(0);
    expect(TS_FILES.length, "没扫到任何 ts/tsx 文件").toBeGreaterThan(10);
    expect(DEFINED.size, `扫到的令牌定义太少（${DEFINED.size}），解析器可能坏了`).toBeGreaterThan(40);
    expect(REFS.length, `扫到的 var() 引用太少（${REFS.length}），解析器可能坏了`).toBeGreaterThan(600);
  });

  it("没有兜底值的 var() 引用，其令牌必须有定义", () => {
    const bad = REFS.filter((r) => !r.hasFallback && !DEFINED.has(r.name));
    const seen = new Set<string>();
    const uniq = bad.filter((b) => {
      const k = `${b.file}:${b.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    expect(
      uniq.map((b) => `${b.file}:${b.line}  var(${b.name}) 无兜底且未定义`),
      "var() 解析不出时整条声明会被丢弃（不是回退到默认值）——这条属性等于没写"
    ).toEqual([]);
  });

  it("有兜底值的引用也必须已定义，除非在允许清单里", () => {
    const bad = REFS.filter(
      (r) => r.hasFallback && !DEFINED.has(r.name) && !ALLOW_UNDEFINED.has(r.name)
    );
    const seen = new Set<string>();
    const uniq = bad.filter((b) => {
      const k = `${b.file}:${b.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    expect(
      uniq.map((b) => `${b.file}:${b.line}  var(${b.name}, …) 未定义且不在允许清单`),
      "有兜底不会报错，只会「永远是那个写死的值」——永远拿不到主题值。" +
        "若确实安全（有主题覆盖兜住），把它连同理由加进 ALLOW_UNDEFINED"
    ).toEqual([]);
  });

  it("允许清单不会腐坏：清单里的令牌确实仍未定义", () => {
    // 成对断言（规则 5）。没有这一条，清单会慢慢变成「一堆早就修好了的名字」，
    // 而它掩盖的范围就没人知道了。
    const stale = [...ALLOW_UNDEFINED.keys()].filter((n) => DEFINED.has(n));
    expect(
      stale,
      `这些令牌已经有定义了，请从 ALLOW_UNDEFINED 里删掉：${stale.join(", ")}`
    ).toEqual([]);
  });

  it("允许清单里的每一条都写了理由", () => {
    for (const [name, why] of ALLOW_UNDEFINED) {
      expect(why.length, `${name} 的理由太短，说不清为什么安全`).toBeGreaterThan(20);
    }
  });

  it("幽灵令牌的桥接块存在（回归锚点）", () => {
    // 这 9 个名字曾被引用 63 处却从未定义。它们现在桥接到既有令牌（`--font-mono`
    // 是唯一一个拿到真实值的——等宽字体栈与主题无关）。
    // 若有人删掉桥接块而没改引用，上面第 2 条会红；这条负责把原因说清楚。
    for (const n of [
      "--surface-3",
      "--surface-hover",
      "--surface-bg",
      "--border-strong",
      "--shadow-floating",
      "--text-secondary",
      "--text-primary",
      "--text-tertiary",
      "--font-mono",
    ]) {
      expect(DEFINED.has(n), `${n} 又变成未定义了`).toBe(true);
    }
  });
});
