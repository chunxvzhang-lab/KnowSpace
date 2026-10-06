import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

/**
 * TSX 装载清单守卫（契约 V5，子任务 A 的前置护栏）。
 *
 * 为什么必须存在：R1 的做法是把 `src/App.tsx` 的状态读取与浮层装配**下沉**到
 * `src/hooks/*` 与 `src/store/*`。CSS 那边早就吃过这个坑（`css-entry-manifest.test.ts`
 * 的头注释写着原因）：切片切出来了、入口忘了 import，不会报错、不会变红、也不会有视觉
 * 异常——那一块界面只是安静地不存在。TSX 同理：hook 文件写完了却没有任何组件调用它，那
 * 块行为就不存在，而 tsc 与测试都不会告诉我们（tsc 只看类型，测试只看被 import 的模块）。
 *
 * 全局不变式必须读"装配后的整体"而不是单个物理文件（阶段 B 那课：守卫按物理文件读，拆完
 * 仍然全绿，但扫描集已经变小）。所以这里从真实入口 `src/main.tsx` 做**传递闭包**，而不是
 * 逐文件数 import——只被下游引用的模块同样算装载。
 *
 * 五要素落点：
 *  ① 单一事实来源：可达集合由入口的模块图算出，不复制文件清单；
 *  ② 集合断言：`src` 下全部非测试模块 ⊆ 可达集合；
 *  ③ 负向对照：拿真实的三层装配链（App → SidebarPanel → BookmarkPanel）验证闭包确实
 *    **传递**地走通——只查 App 不够，解析器若只走一层，App 照样在集合里，而所有孙子
 *    节点会集体"消失"，守卫反而全绿；
 *  ④ 解析器自检：扫到的文件数与可达数都必须超过阈值，否则宁可报错也不空转；
 *  ⑤ 允许清单带腐坏自检：名单里的文件一旦变得可达，本守卫变红，逼人来删这条豁免。
 */

const SRC = resolve(__dirname, "..");
const ROOT = resolve(__dirname, "..", "..");
const ENTRY = join(SRC, "main.tsx");

/** 说明符：静态 `from "…"`（含 `import type`）与动态 `import("…")` 都算装载。 */
function specifiersOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

/** 说明符 → 真实模块路径；裸包名与 CSS 返回 null（不参与本守卫）。 */
function resolveModule(spec: string, fromFile: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  if (extname(base) === ".css") return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const cand of candidates) {
    if (existsSync(cand) && statSync(cand).isFile()) return resolve(cand);
  }
  return null;
}

/** src 下全部 .ts/.tsx，排除 `__tests__`（测试自己不算产品装配）与 `.d.ts`（不是模块）。 */
function modulesUnder(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      modulesUnder(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

const ALL = modulesUnder(SRC)
  .map((p) => resolve(p))
  .sort();
const TEXT = new Map<string, string>();
function textOf(p: string): string {
  let t = TEXT.get(p);
  if (t === undefined) {
    t = readFileSync(p, "utf8");
    TEXT.set(p, t);
  }
  return t;
}

// 从入口出发的传递闭包。
const REACHABLE = new Set<string>();
const queue: string[] = [ENTRY];
while (queue.length > 0) {
  const file = queue.shift() as string;
  if (REACHABLE.has(file)) continue;
  REACHABLE.add(file);
  for (const spec of specifiersOf(textOf(file))) {
    const dep = resolveModule(spec, file);
    if (dep && !REACHABLE.has(dep)) queue.push(dep);
  }
}

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

/**
 * 已知孤儿：**没有任何模块装载**它们，行为因此静默不存在。
 * 每条都必须带理由与规则号（踩坑实录 `844c0337`：无断言的清单约等于没有），
 * 并且下面有腐坏自检，防止它变成永久的遮羞布。
 */
const ALLOW_UNREACHABLE = new Map<string, string>([
  [
    "src/components/GlobalGraphDialog.tsx",
    "规则 9/10：2026-10-06 由本守卫一手测出的**既存**孤儿（全仓 0 处装载），是关系图浮层" +
      "改走 `GraphViewPane` + `isGraphPaneOpen` 之后遗留的旧入口，与本轮下沉无关。" +
      "删掉还是接回去是产品决定（要回答「全局关系图还该不该是独立对话框」），" +
      "已登记为独立债务行，因此在此点名豁免。",
  ],
]);

describe("TSX 装载清单（下沉后不许出现孤儿模块）", () => {
  it("扫描器自身有效（否则本守卫会空转全绿）", () => {
    expect(ALL.length, "src 下一个 .ts/.tsx 都没扫到——扫描器坏了").toBeGreaterThanOrEqual(80);
    expect(REACHABLE.size, "从 main.tsx 走不出任何模块——解析器坏了").toBeGreaterThanOrEqual(60);
    expect(REACHABLE.has(join(SRC, "App.tsx")), "App.tsx 不在可达集合里").toBe(true);
    expect(REACHABLE.has(join(SRC, "components", "SidebarPanel.tsx")), "SidebarPanel 不可达").toBe(
      true,
    );
    expect(REACHABLE.has(join(SRC, "components", "BookmarkPanel.tsx")), "传递装载断了").toBe(true);
  });

  it("src 下每个非测试模块都从入口可达（孤儿=那块行为静默不存在）", () => {
    const orphans = ALL.filter((p) => !REACHABLE.has(p) && !ALLOW_UNREACHABLE.has(rel(p)));
    expect(
      orphans.map(rel),
      "这些模块没有任何从入口可达的路径（要么接进装配，要么删掉——留着就是下一份真相源）：" +
        orphans.map(rel).join(", "),
    ).toEqual([]);
  });

  it("允许清单不腐坏：被豁免的文件现在必须真的不可达", () => {
    // 有人把孤儿接回去了，就必须来删这条豁免——否则名单会在"已经装载"的文件上继续放行，
    // 进而替下一个孤儿背书（同 css-custom-properties 里 ALLOW_UNDEFINED 的规矩）。
    const stale: string[] = [];
    for (const file of ALLOW_UNREACHABLE.keys()) {
      const abs = resolve(ROOT, file);
      if (existsSync(abs) && REACHABLE.has(resolve(abs))) stale.push(file);
    }
    expect(
      stale,
      "这些豁免已经可达，允许清单该删掉这一条（每条豁免都要写规则号与理由）：" + stale.join(", "),
    ).toEqual([]);
  });

  it("每条豁免都有理由，且理由长到能说清是谁、为什么、按哪条规则", () => {
    const thin = [...ALLOW_UNREACHABLE.entries()].filter(([, why]) => why.length < 40);
    expect(
      thin.map(([f]) => f),
      "这些豁免没写理由（规则 9：禁止无断言的清单）：" + thin.map(([f]) => f).join(", "),
    ).toEqual([]);
  });
});
