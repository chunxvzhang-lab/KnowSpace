import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/**
 * The app's stylesheet, exactly as the browser sees it.
 *
 * styles.css was split into src/styles/*.css (phase B), and the split order IS
 * the cascade: main.tsx imports the slices before importing the rest of
 * styles.css. Tests that assert global CSS invariants (every theme defines a
 * token, contrast across themes, literal-allowlists) must therefore read the
 * concatenation in import order - reading one physical file silently narrows
 * the guard, which is how two token tests went red the moment `:root` moved
 * into tokens.css.
 *
 * Parsing main.tsx (rather than hard-coding the file list) keeps this honest:
 * an import that is missing from main.tsx stops being guarded, which is exactly
 * true, and the slice order can never drift from what ships.
 */

const ENTRY = resolve(__dirname, "../../main.tsx");
const REPO_ROOT = resolve(__dirname, "../../..");

/** 拆分脚本给每个切片写的来源标记；有它 = 这个文件是从 styles.css 里切出来的。 */
const SLICE_BANNER = /从\s*src\/styles\.css\s*按域拆分/;

export interface CssSource {
  /** 仓库相对路径、正斜杠，例如 `src/styles/shell.css`。 */
  file: string;
  /** 该文件在拼接文本中的起始行（1 起）。 */
  startLine: number;
  lineCount: number;
  /** 由阶段 B 从 styles.css 切出的域切片（靠文件头注释判定）。 */
  sliceOfStylesCss: boolean;
}

export interface AppCssBundle {
  /** 按 main.tsx 的 import 顺序拼接后的样式表——级联即此顺序。 */
  css: string;
  /** 参与拼接的文件与其在 `css` 中的位置，顺序与 import 一致。 */
  sources: CssSource[];
  /** 把拼接文本的行号翻译回真实位置，例如 `src/styles/shell.css:41`。 */
  locate(line: number): string;
}

export function loadAppCssBundle(): AppCssBundle {
  const entryText = readFileSync(ENTRY, "utf8");
  const paths: string[] = [];
  for (const m of entryText.matchAll(/^[ \t]*import[ \t]+["'](\.\/[^"']+\.css)["']/gm)) {
    paths.push(resolve(dirname(ENTRY), m[1]));
  }
  if (paths.length === 0) throw new Error("main.tsx imports no CSS - did the entry change shape?");

  const sources: CssSource[] = [];
  const chunks: string[] = [];
  let startLine = 1;
  for (const p of paths) {
    // 读失败就让 readFileSync 的 ENOENT 直接抛出：切片被改名而 main.tsx 没跟上，
    // 是产品级故障（样式静默丢失），守卫必须在这里炸，不能"跳过缺失文件"继续全绿。
    const text = readFileSync(p, "utf8");
    const lineCount = text.split(/\r?\n/).length;
    sources.push({
      file: relative(REPO_ROOT, p).replace(/\\/g, "/"),
      startLine,
      lineCount,
      sliceOfStylesCss: SLICE_BANNER.test(text.slice(0, 2000)),
    });
    chunks.push(text);
    // 与下面的 join("\n") 保持一致：分隔符自身占一行。
    startLine += lineCount;
  }
  const css = chunks.join("\n");
  if (css.trim() === "") throw new Error("main.tsx's CSS imports resolved to empty content");

  const locate = (line: number): string => {
    let hit = sources[sources.length - 1];
    for (const s of sources) {
      if (s.startLine <= line) hit = s;
      else break;
    }
    return hit ? `${hit.file}:${Math.max(1, line - hit.startLine + 1)}` : "unknown";
  };

  return { css, sources, locate };
}

/** 只要文本、不关心行号的守卫用这个；需要定位的守卫用 loadAppCssBundle()。 */
export function loadAppCss(): string {
  return loadAppCssBundle().css;
}
