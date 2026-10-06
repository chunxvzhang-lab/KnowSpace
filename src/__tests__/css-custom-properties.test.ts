import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { matchesElement, themeQualifiers } from "./helpers/cssCascade";

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
 * 阶段 C 已把第一批幽灵名字的引用改成既有令牌并删掉桥接块（一个概念一处定义，规则 1）；
 * 剩下的收口状态由 `css-token-vocabulary.test.ts` 长期守着（别名禁令 / 退役名单 / 目标可达性），
 * 本文件负责的是「引用 ⊆ 定义」这个更一般的集合断言。
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
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) || []).length))
      // TS/TSX 的行注释：只处理**行首**（避免误伤 `http://`）
      .replace(/^[ \t]*\/\/.*$/gm, "")
  );
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
  for (const m of src.matchAll(/["'`](--[A-Za-z][\w-]*)["'`]\s*:/g))
    define(m[1], rel(f) + " (inline)");
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

// ------------------------------------------------------- 深色底的主题覆盖判据
/** 每个 CSS 文件的（相对路径, 剥注释正文）；覆盖判据要按规则解析。 */
const CSS_TEXTS = CSS_FILES.map((f) => ({
  file: rel(f),
  text: stripComments(readFileSync(f, "utf8")),
}));

type Rule = { sel: string; body: string; file: string };

/**
 * 拆出「选择器 + 声明体」的扁平规则表。
 *
 * `[^{}]+{[^{}]*}` 只收内层规则：`@media` / `@keyframes` 这类带嵌套的会被跳过，
 * 里层的 `0% {}` 反过来会被收到——对本判据无害（它们不是 background 声明的来源）。
 * 注释已剥，所以选择器文本里不会再混进注释正文。
 */
function rulesOf(text: string, file: string): Rule[] {
  const out: Rule[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1].replace(/\s+/g, " ").trim(), body: m[2], file });
  }
  return out;
}

/**
 * 找出「背景色来自**未定义**令牌的色值兜底，却没有浅色 / eink 覆盖」的规则。
 *
 * 为什么这一类必须单独判：有兜底的悬空引用不会坏，只会**永远是那个写死的值**。当它写的是
 * `background` 而里面的文字读的是主题令牌时，就得到一个「不跟主题走的深色面板」——
 * 分栏快捷条就是这么坏的：浅色有覆盖、eink 漏了，于是透明底的 `.splitter-ratio-chip`
 * 把 eink 深字（`--text-muted` #57544e）压在恒定深底 #1e293b 上实测 **1.94:1**；同栏的
 * `.splitter-btn-orientation` 自带 `--surface-2` 浅底，所以它没事。
 *
 * 判据是**结构性**的（同一次核查学到的：覆盖判定别自造，用 `helpers/cssCascade` 里
 * 已被闪念胶囊守卫验证过的 matchesElement / themeQualifiers）：
 * - 只认色值兜底（`#hex` / `rgb(a)`）；`transparent` 是「就是要融进面板」，不算；
 * - 令牌必须有定义就跳过（那是另一类问题，交给上面的「引用 ⊆ 定义」）；
 * - 带主题限定的规则本身不参与（它是覆盖，不是被覆盖者）；
 * - 缺哪个主题就报哪个，逐个点名。
 */
function ghostDarkBackgrounds(
  texts: { file: string; text: string }[],
  defined: { has(name: string): boolean },
): string[] {
  const rules = texts.flatMap((t) => rulesOf(t.text, t.file));
  const offenders: string[] = [];
  for (const r of rules) {
    const m =
      /(?:^|[;{])\s*background(?:-color)?\s*:\s*var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/.exec(
        r.body,
      );
    if (!m || defined.has(m[1])) continue;
    for (const part of r.sel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (themeQualifiers(part).length) continue;
      for (const theme of ["light", "eink"]) {
        const covered = rules.some(
          (o) =>
            o !== r &&
            themeQualifiers(o.sel).includes(theme) &&
            matchesElement(o.sel, part) &&
            /(?:^|[;{])\s*background(?:-color)?\s*:/.test(o.body),
        );
        if (!covered) offenders.push(`${r.file} ${part} 缺 ${theme} 覆盖（兜底 ${m[2]} 恒定生效）`);
      }
    }
  }
  return offenders;
}

/**
 * 允许「引用了但未定义」的令牌 —— 每一条都要写明**为什么安全**，并**点名它出现在哪些文件**。
 *
 * 这个清单的**唯一**用途是承认「兜底值恒定生效、但结果正确」。往里加东西之前先问：
 * 是真的有主题覆盖兜住，还是只是把问题藏起来了？答案若是后者，就该修而不是加白名单。
 *
 * `sites` 不是装饰。2026-10-05 实测到清单会**说谎**：`--surface-1` 的理由写着
 * 「命令面板 / 快速工具条，有显式覆盖兜住」，而 9 处引用里有 **7 处在思维导图**——
 * 那些站点有没有覆盖没人核过；同一次核查还发现分栏快捷条**只有浅色覆盖、漏了 eink**，
 * 于是透明底芯片的 eink 深字压在恒定深底上实测 1.94:1（已补覆盖，见 `graph-workspace.css`）。
 * 所以「安全」必须落到**可核对的站点**：下面有双向对齐断言 + 「深色底必须有浅色与 eink 覆盖」
 * 的结构判据，两条各配变异断言。
 */
type AllowEntry = { why: string; sites: string[] };
const ALLOW_UNDEFINED = new Map<string, AllowEntry>([
  [
    "--surface-1",
    {
      why:
        "兜底 #1e293b 是自洽深色面板/深色徽章的一部分。命令面板与分栏快捷条由 " +
        '`[data-theme="light"|"eink"]` 同名规则显式覆盖（快捷条的 eink 覆盖是 2026-10-05 补的）；' +
        "styles.css 那 7 处是 `fill:` 的**图内固定观感**——同族描边与文字也写死（#f59e0b / #c084fc /" +
        " #fcd34d），本来就不跟应用主题走，不适用「底色须有主题覆盖」那条判据。",
      sites: ["styles/command-palette.css", "styles/graph-workspace.css", "styles.css"],
    },
  ],
  [
    "--text-normal",
    {
      why: "与 --surface-1 的深底配对（浅字压深底），命令面板的浅色/eink 由显式覆盖给出深色文字",
      sites: ["styles/command-palette.css"],
    },
  ],
  [
    "--border-color",
    {
      why:
        "命令面板边框色：浅色/eink 由显式覆盖给出；graph-filters 那 1 处是 rgba(148,163,184,.2)" +
        " 的半透明分隔线，压深压浅都读得清，不依赖具体主题",
      sites: ["styles/command-palette.css", "styles/graph-filters.css"],
    },
  ],
  [
    "--bg-sidebar",
    {
      why: "`.backlinks-panel`：兜底是 `transparent`，就是要融进所在面板，不是遗漏",
      sites: ["styles/backlinks-panel.css"],
    },
  ],
]);

describe("CSS 自定义属性（令牌）守卫", () => {
  it("扫描器本身有效（否则会静默全绿）", () => {
    expect(CSS_FILES.length, "没扫到任何 css 文件").toBeGreaterThan(0);
    expect(TS_FILES.length, "没扫到任何 ts/tsx 文件").toBeGreaterThan(10);
    expect(DEFINED.size, `扫到的令牌定义太少（${DEFINED.size}），解析器可能坏了`).toBeGreaterThan(
      40,
    );
    expect(REFS.length, `扫到的 var() 引用太少（${REFS.length}），解析器可能坏了`).toBeGreaterThan(
      600,
    );
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
      "var() 解析不出时整条声明会被丢弃（不是回退到默认值）——这条属性等于没写",
    ).toEqual([]);
  });

  it("有兜底值的引用也必须已定义，除非在允许清单里", () => {
    const bad = REFS.filter(
      (r) => r.hasFallback && !DEFINED.has(r.name) && !ALLOW_UNDEFINED.has(r.name),
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
        "若确实安全（有主题覆盖兜住），把它连同理由加进 ALLOW_UNDEFINED",
    ).toEqual([]);
  });

  it("允许清单不会腐坏：清单里的令牌确实仍未定义", () => {
    // 成对断言（规则 5）。没有这一条，清单会慢慢变成「一堆早就修好了的名字」，
    // 而它掩盖的范围就没人知道了。
    const stale = [...ALLOW_UNDEFINED.keys()].filter((n) => DEFINED.has(n));
    expect(stale, `这些令牌已经有定义了，请从 ALLOW_UNDEFINED 里删掉：${stale.join(", ")}`).toEqual(
      [],
    );
  });

  it("允许清单里的每一条都写了理由，并列出了站点", () => {
    for (const [name, entry] of ALLOW_UNDEFINED) {
      expect(entry.why.length, `${name} 的理由太短，说不清为什么安全`).toBeGreaterThan(20);
      expect(entry.sites.length, `${name} 没列出站点，等于没写理由`).toBeGreaterThan(0);
    }
  });

  it("允许清单说到的站点 = 实际引用的文件（双向对齐，清单不许说谎）", () => {
    // 理由是「命令面板安全」，实际 9 处里 7 处在导图——这种脱节以前没人看得见。
    const actual = new Map<string, Set<string>>();
    for (const r of REFS) {
      if (DEFINED.has(r.name)) continue;
      if (!actual.has(r.name)) actual.set(r.name, new Set());
      actual.get(r.name)!.add(r.file);
    }
    const problems: string[] = [];
    for (const [name, entry] of ALLOW_UNDEFINED) {
      const used = actual.get(name) ?? new Set<string>();
      for (const f of entry.sites) if (!used.has(f)) problems.push(`${name} 声称 ${f}，实际没引用`);
      for (const f of used)
        if (!entry.sites.includes(f)) problems.push(`${name} 实际被 ${f} 引用，清单没写`);
    }
    expect(problems, `白名单与站点不一致：${problems.join(" | ")}`).toEqual([]);
  });

  it("未定义令牌的背景色兜底必须有浅色与 eink 覆盖（结构判据）", () => {
    const offenders = ghostDarkBackgrounds(CSS_TEXTS, DEFINED);
    expect(
      offenders,
      `这些规则的背景是一个不跟主题走的写死色（兜底恒定生效），却没有对应主题覆盖：` +
        `${offenders.join(" | ")}`,
    ).toEqual([]);
  });

  it("三条清单判据都不是空转（变异断言）", () => {
    // ① 站点：谎报一个没引用的文件，必须被双向对齐逻辑点出来
    const lying = new Map<string, { why: string; sites: string[] }>([
      ["--surface-1", { why: "x".repeat(30), sites: ["styles/does-not-use-it.css"] }],
    ]);
    const flagged: string[] = [];
    for (const [name, entry] of lying) {
      const used = new Set(["styles.css"]); // 真实引用集合
      for (const f of entry.sites) if (!used.has(f)) flagged.push(`${name} 声称 ${f}，实际没引用`);
      for (const f of used) if (!entry.sites.includes(f)) flagged.push(`${name} 实际被 ${f} 引用`);
    }
    expect(flagged.length, "谎报站点没被抓到——对齐逻辑是空转").toBe(2);

    // ② 覆盖判据：造一条只有浅色覆盖的深色底规则，必须报出 eink 缺失
    const synthetic = [
      {
        file: "a.css",
        text: ".ghost-panel { background: var(--nope-x, #1e293b); color: var(--text); }",
      },
      { file: "a.css", text: '[data-theme="light"] .ghost-panel { background: #ffffff; }' },
    ];
    const found = ghostDarkBackgrounds(synthetic, new Set(["--text", "--nope-y"]));
    expect(
      found.some((o) => /ghost-panel/.test(o) && /eink/.test(o)),
      `植入的「缺 eink 覆盖」没被抓到：${found.join(" | ")}`,
    ).toBe(true);

    // ③ 反向：补齐 eink 覆盖后必须转好（否则判据会误报）
    const fixed = synthetic.concat([
      { file: "a.css", text: '[data-theme="eink"] .ghost-panel { background: #fbf9f4; }' },
    ]);
    expect(
      ghostDarkBackgrounds(fixed, new Set(["--text", "--nope-y"])),
      "补齐覆盖后仍报，判据误报",
    ).toEqual([]);
  });

  it("幽灵令牌已收口：桥接块必须不在，`--font-mono` 必须还在（回归锚点）", () => {
    // 这 8 个名字照着外部设计系统写下、被引用却从未定义；先前桥接到同角色的既有令牌，
    // 阶段 C 把逐处引用改成既有令牌并**删掉整个桥接块**（一个概念一处定义，规则 1）。
    // 锚点因此从「桥接块必须存在」翻成「桥接块必须不再存在」：前者防「删块忘改引用」，
    // 后者防「收口时把真令牌一起剪掉」以及「桥接块被人以别名形式恢复」。
    // 持久版本的禁令（别名形式 / 退役名单 / 目标可达性）在 css-token-vocabulary.test.ts。
    for (const n of [
      "--surface-3",
      "--surface-hover",
      "--surface-bg",
      "--border-strong",
      "--shadow-floating",
      "--text-secondary",
      "--text-primary",
      "--text-tertiary",
    ]) {
      expect(DEFINED.has(n), `${n} 又变成定义了——桥接块被恢复了？`).toBe(false);
      expect(
        REFS.some((r) => r.name === n),
        `${n} 又被引用了：它没有定义，那条声明会被浏览器整条丢弃`,
      ).toBe(false);
    }
    expect(DEFINED.has("--font-mono"), "--font-mono 是真实定义（等宽字体栈），不该被顺手剪掉").toBe(
      true,
    );
  });
});
