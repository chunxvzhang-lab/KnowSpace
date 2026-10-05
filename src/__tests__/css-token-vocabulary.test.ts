import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadAppCssBundle } from "./helpers/loadAppCss";

/**
 * 令牌词汇表守卫（阶段 C：幽灵令牌的桥接块收口之后）。
 *
 * 历史：一批照着**外部设计系统**写下的名字（`--surface-3` / `--text-secondary` /
 * `--border-strong` / `--text-primary` …）在本仓库从未定义过却被大量引用。后果不是报错，
 * 而是静默失效——`background: var(--surface-3)` 里 var 解析不出来，整条声明被浏览器**丢弃**
 * （不是回退默认值）。先桥接（`--surface-3: var(--surface-sunken)`）保住正确性，阶段 C 再把
 * 逐处引用改成既有令牌、删掉桥接块：**一个概念只留一处定义**（规则 1）。
 *
 * 这条守卫守的是「收口之后别再退回去」，管三种静默失效：
 *
 * 1. **别名禁令**——`--x: var(--y);` 这种「裸间接」令牌就是桥接块的重启形式。留着它，
 *    `--x` 与 `--y` 就成了一个概念的两位定义者，改一处不动另一处；更糟的是下一个人会以为
 *    `--x` 是个真令牌，继续往新规则里写它。
 * 2. **退役名单**——收口过的名字不许再被引用（引用未定义令牌 = 整条声明静默丢弃）。
 * 3. **可达性**——改写用到的目标令牌必须在 `:root` 有定义；否则 `var(--target)` 同样静默丢，
 *    收口就从「修 bug」变成「换个姿势复现 bug」。
 *
 * 解析器坏掉时这类断言会**静默全绿**，所以除了自检（扫到的文件数/字节数下限），
 * 每条禁令都配一条变异断言：植进去必须报出来（规则 5）。
 */

const SRC = resolve(__dirname, "..");
const BUNDLE = loadAppCssBundle();
/** 剥注释但补回等量空格：注释里会以散文提到 `--surface-3` 与 `--x: var(--y)`，不剥会误报。 */
const CODE = BUNDLE.css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 阶段 C 收口掉的别名（名字 → 当时桥接到的真令牌）。 */
const RETIRED = {
  "--surface-3": "--surface-sunken",
  "--surface-hover": "--surface-2",
  "--surface-bg": "--surface-2",
  "--border-strong": "--border-hover",
  "--shadow-floating": "--shadow-modal",
  "--text-secondary": "--text-muted",
  "--text-primary": "--text",
  "--text-tertiary": "--text-muted",
} as const;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(css|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const ALL_FILES = sourceFiles(SRC);

/** 裸间接别名：值恰好是 `var(--另一个令牌)`，没有别的成分。 */
function findBareAliases(css: string): string[] {
  return [...css.matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)\s*;/g)].map(
    (m) => `${m[1]}: var(${m[2]})`,
  );
}

/** 引用了某个名字（`var(--name`），以及它出现在哪个字符偏移。 */
function refsOf(css: string, name: string): number[] {
  const at: number[] = [];
  for (const m of css.matchAll(new RegExp(`var\\(\\s*${name}(?=[\\s,)])`, "g"))) at.push(m.index!);
  return at;
}

describe("令牌词汇表（阶段 C 收口后）", () => {
  it("扫描器有效：应用样式表与源码文件都确实被读到", () => {
    expect(
      BUNDLE.sources.length,
      "CSS 链太短，loadAppCssBundle 可能没解析到入口",
    ).toBeGreaterThanOrEqual(30);
    expect(CODE.length, "剥注释后的样式表太短").toBeGreaterThan(150000);
    expect(ALL_FILES.length, "src 下源码文件数异常").toBeGreaterThan(150);
  });

  it("样式表里不存在「裸间接」别名令牌（规则 1：一个概念一处定义）", () => {
    expect(findBareAliases(CODE), "这些令牌只是另一个令牌的另一位定义者").toEqual([]);
  });

  it("收口掉的 8 个名字在样式表与 TS 里都不再出现（既无定义也无引用）", () => {
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, "/");
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) =>
        m.replace(/[^\n]/g, " "),
      );
      for (const name of Object.keys(RETIRED)) {
        if (new RegExp(`(var\\(\\s*${name}|^\\s*${name}\\s*:)`, "gm").test(code)) {
          offenders.push(`${rel} → ${name}`);
        }
      }
    }
    expect(
      offenders,
      `这些名字没有定义，引用它们的声明会被浏览器整条丢弃：${offenders.join(" | ")}`,
    ).toEqual([]);
  });

  it("改写用到的目标令牌都在 :root 有定义（否则收口只是换个姿势静默失效）", () => {
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CODE);
    expect(root, "找不到 :root 基线块").toBeTruthy();
    for (const target of [...new Set(Object.values(RETIRED))]) {
      expect(
        new RegExp(`(^|[\\s;])${target}\\s*:`).test(root![1]),
        `${target} 在 :root 没有定义`,
      ).toBe(true);
    }
  });

  it("`--font-mono` 仍是真定义（它不是别名，收口时该留下）", () => {
    expect(/--font-mono\s*:\s*"/.test(CODE), "--font-mono 被顺手删了？等宽字体栈是真实定义").toBe(
      true,
    );
    expect(/--font-mono\s*:\s*var\(/.test(CODE), "--font-mono 不该变成别名").toBe(false);
  });

  // ---------------------------------------------------------- 变异断言（规则 5）
  it("三条禁令都不是空转：植进去必须报出来", () => {
    // ① 别名禁令
    expect(findBareAliases(":root { --fake-alias: var(--text); }"), "植入的别名没被抓到").toEqual([
      "--fake-alias: var(--text)",
    ]);
    // ② 退役名单
    expect(
      refsOf(".x { color: var(--surface-3); }", "--surface-3").length,
      "植入的退役引用没被抓到",
    ).toBe(1);
    // ③ 可达性：把 :root 里的 --text 抹掉，断言必须转红
    const gutted = CODE.replace(/(--text\s*:\s*[^;]+;)/, "");
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(gutted);
    expect(
      root && new RegExp(`(^|[\\s;])--text\\s*:`).test(root[1]),
      "抹掉 --text 后可达性检查仍然绿——那条断言是空转",
    ).toBe(false);
  });

  it("合法写法不误伤（否则下次整条断言会被注释掉）", () => {
    // 复合 var()、带兜底、多值声明都不是别名。
    expect(
      findBareAliases(
        ":root { --a: var(--x, #fff); --b: 1px solid var(--border); --c: var(--x) var(--y); }",
      ),
    ).toEqual([]);
    expect(refsOf(".x { color: var(--surface-33); }", "--surface-3")).toEqual([]);
  });
});
