import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { loadAppCssBundle } from "./helpers/loadAppCss";

/**
 * CSS 装载清单守卫（阶段 B 的前置护栏）。
 *
 * 为什么需要它：`scripts/split-styles-css.cjs` 把 CSS 切成 `src/styles/*.css`，
 * 而**切片是否生效，完全取决于有没有人记得在入口 import 它**。一个没被 import 的
 * 切片不会报错、不会变红、也不会有任何视觉异常——样式只是安静地不存在，
 * 和 `ENGINEERING_GUIDE.md` 规则 10 里"引用悬空的动画名/令牌"是同一类失效形状：
 * 定义端与引用端分离，编译期不做跨文件检查。
 *
 * 反过来也成立：守卫测试自己按域读 CSS，一旦某个 CSS 文件不在装载清单里，
 * 它扫到的就不是浏览器看到的那份样式表——守卫会"静默变窄"。
 *
 * 五要素落点：
 *  ① 单一事实来源：装载顺序读 `src/main.tsx`（经 `loadAppCssBundle()`），不复制文件清单；
 *  ② 集合断言：`src` 下全部 .css ⊆ 被 import 的 .css；
 *  ③ 负向对照：行号映射用**真实文件内容**核对，不是只核算术——算术错了这里就红；
 *  ④ 解析器自检：扫到的 CSS 文件数与装载数必须超过阈值，否则宁可报错也不空转全绿。
 */

const SRC = resolve(__dirname, "..");
const ROOT = resolve(__dirname, "..", "..");

/** src 下所有 .css（`__tests__` 不参与构建）。 */
function cssFilesUnderSrc(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFilesUnderSrc(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out.sort();
}

/** 一个源文件里 import 进来的 CSS 说明符（含 `@import`，含裸包名）。 */
function cssSpecifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  // 语句形态：`import "./styles.css"` / `import x from "./styles.css"` / `@import "…"`。
  for (const m of text.matchAll(/(?:^|[\s;])import\b[^\n;]*?["']([^"']+\.css)["']/gm))
    out.push(m[1]);
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+\.css)["']/g)) out.push(m[1]);
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx|css)$/.test(name)) acc.push(full);
  }
  return acc;
}

/** 说明符 → 绝对路径（裸包名如 `katex/dist/katex.min.css` 不在 src 下，跳过）。 */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  return spec.startsWith("/") ? resolve(spec) : resolve(dirname(fromFile), spec);
}

const ALL_CSS = cssFilesUnderSrc(SRC);
const LOADED = new Set<string>();
for (const f of sourceFiles(SRC)) {
  for (const spec of cssSpecifiers(f)) {
    const abs = resolveSpecifier(spec, f);
    if (abs) LOADED.add(resolve(abs));
  }
}

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const BUNDLE = loadAppCssBundle();

describe("CSS 装载清单", () => {
  it("扫描器自身有效（否则本守卫会静默全绿）", () => {
    expect(ALL_CSS.length, "src 下一个 .css 都没扫到").toBeGreaterThanOrEqual(4);
    expect(LOADED.size, "一个 CSS import 都没扫到——解析器坏了").toBeGreaterThanOrEqual(4);
    expect(BUNDLE.sources.length, "loadAppCssBundle 没解析到入口 CSS").toBeGreaterThanOrEqual(4);
  });

  it("src 下每个 .css 都被某个模块装载（孤儿文件=样式静默不存在）", () => {
    // 阶段 B 每切出一个新文件，都要在 src/main.tsx 里加一行 import。漏掉那行，
    // 这个域的全部样式就不存在——而构建、测试、肉眼都不会告诉我们。
    const orphans = ALL_CSS.filter((p) => !LOADED.has(resolve(p)));
    expect(
      orphans.map(rel),
      "这些 CSS 没有被任何模块 import（要么接进 src/main.tsx，要么删掉——留着就是下一份真相源）：" +
        orphans.map(rel).join(", "),
    ).toEqual([]);
  });

  it("被 import 的 CSS 文件都真实存在", () => {
    // 改名/删除一个切片而忘了改 import，Vite 会在构建时炸；这里提前在测试阶段炸，
    // 并且顺带覆盖"测试读的那份 CSS"与"浏览器读的那份"是同一批文件。
    const missing = [...LOADED].filter((p) => !existsSync(p));
    expect(
      missing.map(rel),
      "这些 CSS 被 import 了但文件不存在：" + missing.map(rel).join(", "),
    ).toEqual([]);
  });

  it("从 styles.css 切出的域切片必须在 styles.css 之前装载", () => {
    // 级联红线：切片是 styles.css 的**连续前缀**（外迁规则），所以它们必须排在剩余
    // 巨石之前。反过来装载，浅色/墨水屏覆盖就会跑到它们本应覆盖的规则前面——
    // "同特异度后来者胜"正是这套主题覆盖的机制，装载顺序不是风格问题，是行为问题。
    const order = BUNDLE.sources.map((s) => s.file);
    const monolith = order.indexOf("src/styles.css");
    if (monolith === -1) return; // 拆分收官后 styles.css 不存在，本条自动完成使命
    const slices = BUNDLE.sources
      .map((s, i) => ({ ...s, i }))
      .filter((s) => s.sliceOfStylesCss && s.i > monolith);
    expect(
      slices.map((s) => `${s.file}@${s.i}`),
      "这些切片排在 styles.css 之后，装载顺序与拆分前的物理顺序不一致（改顺序=改级联）：" +
        slices.map((s) => s.file).join(", "),
    ).toEqual([]);
  });

  it("行号映射自洽：拼接文本的起始行确实对上真实文件内容（负向对照）", () => {
    // 守卫报出的行号是唯一的定位手段（规则 10 实测过"差 25 行"的坑）。这里不用算术
    // 校验算术：拿每个文件**真实的第一行**去比对拼接文本对应偏移的那一行——
    // 偏移量算错（比如多算/少算一个分隔空行）会立刻指到别的文件上。
    const joined = BUNDLE.css.split(/\r?\n/);
    const mismatches: string[] = [];
    for (const s of BUNDLE.sources) {
      const real = readFileSync(resolve(ROOT, s.file), "utf8").split(/\r?\n/)[0];
      const at = joined[s.startLine - 1];
      if (at !== real)
        mismatches.push(`${s.file}:1 → 拼接行 ${s.startLine} 的内容是 ${JSON.stringify(at)}`);
      if (!BUNDLE.locate(s.startLine).startsWith(`${s.file}:`))
        mismatches.push(`${s.file}: locate(startLine) 指向了 ${BUNDLE.locate(s.startLine)}`);
    }
    expect(mismatches, "loadAppCss 的行号映射坏了：\n" + mismatches.join("\n")).toEqual([]);
  });
});
