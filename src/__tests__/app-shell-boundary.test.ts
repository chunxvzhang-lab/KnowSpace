import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * 壳层边界守卫（R1 达标之后，防止达标只是临时的）。
 *
 * 为什么必须存在：B19 把 App.tsx 从 557 行降到 188 行，靠的是"编排全在控制器、壳只做装配"
 * 这个约定。约定本身没有牙齿——下一个人在 App.tsx 里加一个 `useState` 不会让任何东西变红：
 * tsc 管不着、测试看不见、视觉也正常，于是壳会悄悄长回 god component，而 `TEST_BASELINE.md`
 * 的 R1 行要过很久才把这件事反映出来。CSS 那边早就吃过同类暗坑（`css-entry-manifest` 与
 * `tsx-entry-manifest` 就是为"安静地不存在"写的），这里补第三类守卫：**结构边界**。
 *
 * 五要素落点：
 *  ① 单一事实来源：行数口径与 `scripts/capture-test-baseline.cjs` 的 `lineCount()` 一致
 *    （UTF-8 + `split(/\r?\n/)` + 弹掉结尾空行）。`helpers/loadAppCss.ts` 用
 *    `split().length` 不弹尾行 ⇒ 同一文件多算 1，别再引入第三种口径；
 *  ② 集合断言：壳内禁止的 hook 类别整表扫描，不是数着几个名字查；
 *  ③ 负向对照：同一套剥离器与正则拿去扫控制器，必须**真的找得到**被禁的模式——否则
 *    "壳里 0 个"可能只是解析器坏了一直返回空集。这条不是装饰：本守卫第一版就是这样抓到
 *    自己的漏洞的——`Name\s*\(` 漏掉了 `useState<RenderedChapter | null>(…)`，控制器被扫成
 *    "没有 useState"，于是"壳里 0 个"当时是假绿。已知盲区：类型参数若跨行书写，正则可能
 *    漏检（本仓库没有这种写法；再收紧就得上 AST，那属于另一个决定）。
 *  ④ 阈值自检：剥完注释仍要能看到已知代码 token、行数仍要 ≥ 100，宁可报错也不空转；
 *  ⑤ 不留豁免名单：需要例外时改结构，别在这里加白名单（加了它就没人守了）。
 */

const SRC = resolve(__dirname, "..");
const APP = join(SRC, "App.tsx");
const CONTROLLER = join(SRC, "hooks", "useWorkspaceController.ts");

/** 官方口径的行数：UTF-8、按换行切分、弹掉结尾空行。 */
function lineCount(filePath: string): number {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/** 只读代码不读散文：块注释、行注释、行尾注释都剥掉。 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/**
 * 壳里禁止的 hook 类别。`useRef` 不在此列——DOM 句柄天生属于渲染现场；
 * 但 B19 之后壳连 `useRef` 都不该有，那条由"只许调用一个 hook"一起管住。
 */
const FORBIDDEN_IN_SHELL = [
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useReducer",
  "useMemo",
  "useCallback",
  "useSyncExternalStore",
  "useUiStore",
  "useTabStore",
  "useVaultStore",
];

/**
 * 匹配"确实调用了这个 hook"。
 *
 * 写成 `Name\s*\(` 会被泛型骗过去——`useState<RenderedChapter | null>(…)` 里名字和括号
 * 隔着类型参数。这不是设想：本守卫的负向对照第一条就因此变红（控制器明明有 useState，
 * 扫描器却报"没找到"），说明"壳里 0 个"当时是假绿。所以这里允许名字与括号之间存在一段
 * 不含 `;` 且不分行的东西（类型参数、`<…>` 里的联合类型都能跨过），代价是**跨行的泛型参数
 * 会漏**——已知盲区，与 `css-frozen` 不是逐字节冻结同一性质，写在明面上。
 */
function callPattern(name: string): RegExp {
  return new RegExp(`\\b${name}(?![\\w$])(?:[^;\\n]{0,80}?)\\s*\\(`);
}

function violationsOf(text: string): string[] {
  return FORBIDDEN_IN_SHELL.filter((name) => callPattern(name).test(text));
}

/**
 * 壳里出现的所有 hook 调用名。
 *
 * 这里也必须跨过泛型参数：`use[A-Z]\w*\s*\(` 会把 `useState<{ a: number } | null>(…)`
 * 看成"不是调用"，于是"壳里只调用一个 hook"这条会假绿——同一个漏洞在两个断言里各演了
 * 一遍，负向对照把它抓得干干净净。匹配范围限制在不换行、不含 `;` 的 80 个字符内，
 * 所以不会把上一行的尾巴接到下一行的括号上。
 */
function hookCallsIn(text: string): string[] {
  return [...text.matchAll(/\b(use[A-Z]\w*)(?![\w$])(?:[^;\n]{0,80}?)\s*\(/g)].map((m) => m[1]);
}

function posix(filePath: string): string {
  return resolve(filePath).replace(/\\/g, "/");
}

/** 全仓（非测试）里**引用**控制器的文件，排除它自己的定义处。 */
function controllerConsumers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__" || name === "node_modules") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
        if (posix(full) === posix(CONTROLLER)) continue;
        if (/\buseWorkspaceController\b/.test(codeOnly(readFileSync(full, "utf8")))) out.push(full);
      }
    }
  };
  walk(SRC);
  return out.map(posix);
}

describe("App 壳层边界 - R1 之后的结构守卫", () => {
  const shell = codeOnly(readFileSync(APP, "utf8"));

  it("解析器不是空转（阈值自检）", () => {
    // 剥离写错把代码也吃了的话，下面每一条都会假绿，所以先证明代码还在。
    expect(shell).toContain("export function App");
    expect(shell).toContain("useWorkspaceController");
    expect(shell).toContain("AppShellChrome");
    expect(shell.length).toBeGreaterThan(2000);
    expect(lineCount(APP)).toBeGreaterThanOrEqual(100);
  });

  it("壳里没有状态、没有 effect、没有 memo，也不直连 store", () => {
    expect(violationsOf(shell)).toEqual([]);
  });

  it("壳只调用一个 hook：那个控制器", () => {
    expect(hookCallsIn(shell)).toEqual(["useWorkspaceController"]);
  });

  it("R1 双阈值：契约 < 500，守卫上限 250（实测 188，测于 2026-10-07）", () => {
    const lines = lineCount(APP);
    expect(lines).toBeLessThan(500); // release plan 的 R1 契约
    expect(lines).toBeLessThanOrEqual(250); // 留余量，但绝不放过"状态回流壳里"
  });

  it("控制器只有一个消费者", () => {
    // 第二次调用 useWorkspaceController() 不是复用，而是**第二个编辑会话实例**：
    // useDocumentSession 的状态挂在调用者身上，两处调用就是两份 session。
    // 这条把"单一装配入口"钉成字节；将来真要共享，先把它改成 context（一次真正的决定）。
    expect(controllerConsumers()).toEqual([posix(APP)]);
  });

  it("负向对照：同一套解析器在控制器里确实找得到被禁模式", () => {
    const controller = codeOnly(readFileSync(CONTROLLER, "utf8"));
    // 控制器**应该**中招：它就是那个持有状态与 store 订阅的地方。找不到就说明正则失效，
    // 那么上面"壳里 0 个"也毫无意义。
    expect(violationsOf(controller)).toEqual(expect.arrayContaining(["useState"]));
    expect(/\buse[A-Z]\w*\s*\(/.test(controller)).toBe(true);
  });
});
