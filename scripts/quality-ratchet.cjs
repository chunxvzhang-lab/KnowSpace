/**
 * Quality ratchet: the code-metrics counterpart of docs/TEST_BASELINE.md.
 *
 * The test baseline answers "how many tests do we have"; this one answers
 * "how much debt do we carry". Both exist for the same reason: a number that
 * lives only in someone's head cannot be defended in review, and a debt list
 * that is maintained by hand goes stale exactly when it is needed (that is how
 * 13 of the 15 oversized files stayed off the tech-debt table for a year).
 *
 * Metrics and their rules:
 *   colon-any / as-any       type escapes           - may only go DOWN
 *   files-over-1000-lines    size debt, file count  - may only go DOWN
 *   max-file-lines           size debt, worst file  - may only go DOWN
 *   styles-css-lines         the styles.css monolith - may only go DOWN (phase B:
 *                            CSS moves out to src/styles/*.css one contiguous
 *                            prefix at a time; growing it back means a slice was
 *                            folded in by hand, which breaks cascade guarantees)
 *   undeclared-imports       phantom dependencies   - must be ZERO (hard gate)
 *   src-lines (non-test)     overall size           - recorded, NOT gated
 *
 * The ratchet only asks "not worse than yesterday" - never a target value.
 * A target like "any = 0" is unreachable against 56k existing lines and gets
 * ignored; "not one more than the baseline" is reachable in every change and
 * therefore actually enforced.
 *
 * Usage:
 *   node scripts/quality-ratchet.cjs           regenerate docs/QUALITY_BASELINE.md
 *   node scripts/quality-ratchet.cjs --check   CI mode: fail if any gated metric regressed
 *
 * Output: docs/QUALITY_BASELINE.md (committed, DO NOT hand-edit, same status
 * as TEST_BASELINE.md). Loosening a baseline is a reviewed decision - edit the
 * generator's methodology, not the generated file.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const docPath = path.join(root, "docs", "QUALITY_BASELINE.md");

const GATED = new Set([
  "colon-any",
  "as-any",
  "files-over-1000-lines",
  "max-file-lines",
  "undeclared-imports",
  "styles-css-lines",
]);

/**
 * Extract import specifiers from source text.
 *
 * Comments are blanked by TypeScript's own scanner - the same one the compiler
 * uses - not a hand-rolled state machine. Two traps earlier versions fell into:
 * prose like `splitting "init" from "the handlers..."` matched a loose `from`
 * pattern, and worse, `\b` treats CJK as word characters - so the Chinese word
 * 从 followed by a quoted string in any comment matched `from` too (865 false
 * positives). A gate with false positives gets switched off; a gate that reads
 * real syntax keeps its credibility. Hence: no \b around keywords, statements
 * anchored to line start, quotes captured by backreference.
 */
let tsLib = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  tsLib = require("typescript");
} catch {
  tsLib = null;
}

/**
 * Comment-free code text, byte-offset-aligned with the original.
 *
 * Uses TypeScript's own scanner - the same one the compiler uses - not a
 * hand-rolled state machine: the handwritten stripper broke on JSX attribute
 * values containing regex-like quotes and then reported every relative import
 * in the file as a phantom package (768 false positives). The scanner knows
 * exactly which spans are comments; blanking them to spaces keeps offsets
 * stable so findings still point at the right line.
 */
function blankComments(text) {
  if (!tsLib) return text; // degrade to raw text + strict anchored patterns
  const out = Array.from(text);
  const ranges = tsLib.getLeadingCommentRanges(text, 0) || [];
  for (const r of ranges) {
    for (let i = r.pos; i < r.end && i < out.length; i++) {
      if (out[i] !== "\n" && out[i] !== "\r") out[i] = " ";
    }
  }
  return out.join("");
}

/** Import specifiers appearing at line start (static imports/exports). */
const STATIC_IMPORT_RE = /^[ \t]*(?:import|export)[^;]*?\bfrom[ \t]+(["'])([^"'\n]+)\1/gms;
const BARE_IMPORT_RE = /^[ \t]*import[ \t]+(["'])([^"'\n]+)\1[ \t]*;?[ \t]*$/gm;
/** Dynamic import(): allowed anywhere, but must be real call syntax. */
const DYNAMIC_IMPORT_RE = /(^|[^.\w$])import\([ \t]*(["'])([^"'\n]+)\2[ \t]*\)/g;

function importSpecifiers(text) {
  const code = blankComments(text);
  const specs = [];
  for (const re of [STATIC_IMPORT_RE, BARE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    const idx = re === DYNAMIC_IMPORT_RE ? 3 : 2;
    for (const m of code.matchAll(re)) {
      // Belt and braces: the statement must still begin with a real `import`/
      // `export` keyword after the comment blanking.
      if (!/^[ \t]*(?:import|export)\b/.test(m[0])) continue;
      specs.push({ spec: m[idx], index: m.index });
    }
  }
  return specs;
}

/**
 * Third-party packages imported by src must be declared in package.json.
 *
 * A "phantom dependency" resolves today only because npm happens to hoist a
 * transitive package to the top of node_modules. When the parent library
 * changes its dependency tree, or hoisting shifts, `npm ci` on a clean machine
 * breaks the build - and nothing in CI catches it until release day. This repo
 * shipped exactly that failure mode: `katex` and `cytoscape` were imported by
 * src/services/markdownMath.ts and graph/* while living only under mermaid.
 *
 * Scope rules (deliberately narrow so the gate never needs an escape hatch):
 *   - relative imports ("./x") are skipped;
 *   - "node:*" builtins are skipped;
 *   - devDependencies count as declared (test tooling is fine);
 *   - @scope/name takes the two-part specifier, everything else the first path
 *     segment.
 */
function findUndeclaredImports(files, pkg) {
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  const undeclared = [];
  for (const filePath of files) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const raw = fs.readFileSync(filePath, "utf8");
    const seen = new Set();
    // Line numbers come from the ORIGINAL text; specifiers come from the
    // comment-stripped text, so a finding never points at prose.
    for (const { spec, index } of importSpecifiers(raw)) {
      if (spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("/")) continue;
      const pkgName = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (declared.has(pkgName)) continue;
      const key = `${rel}|${pkgName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = raw.slice(0, index).split(/\r?\n/).length;
      undeclared.push({ file: rel, line, pkg: pkgName });
    }
  }
  return undeclared;
}

/** Same counting rule as capture-test-baseline.cjs: editor-visible lines. */
function countLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function listSources(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs
      .readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  // Test code is deliberately outside the ratchet: it is guarded by the test
  // baseline, and its escapes do not ship to users.
  return out.filter((p) => !p.includes(`${path.sep}__tests__${path.sep}`));
}

function measure() {
  const colonAny = [];
  const asAny = [];
  const oversized = [];
  let totalLines = 0;
  let maxLines = 0;

  const sources = listSources(srcDir);

  for (const filePath of sources) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const text = fs.readFileSync(filePath, "utf8");

    // ": any" - includes ": any[]" and "?: any". Does NOT include Array<any> /
    // Record<, any> / <any> generics: those are counted by nobody today, and
    // changing the methodology must be a reviewed decision (it re-baselines).
    for (const m of text.matchAll(/:\s*\bany\b/g)) {
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      colonAny.push({
        file: rel,
        line,
        snippet: text.slice(m.index, m.index + 40).split(/\r?\n/)[0],
      });
    }
    for (const m of text.matchAll(/\bas\s+any\b/g)) {
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      asAny.push({ file: rel, line, snippet: text.slice(m.index, m.index + 40).split(/\r?\n/)[0] });
    }

    const lines = countLines(filePath);
    totalLines += lines;
    if (lines > maxLines) maxLines = lines;
    if (lines > 1000) oversized.push({ file: rel, lines });
  }

  oversized.sort((a, b) => b.lines - a.lines);

  // The CSS monolith is measured here and NOT via listSources (that walk is
  // ts/tsx only): styles.css is the single largest file in the repository, yet
  // it sat outside every size metric. Without its own metric nothing could see
  // the phase-B split making progress - and, worse, nothing could see a slice
  // being folded back in by hand, which silently reorders the cascade.
  const stylesPath = path.join(srcDir, "styles.css");
  const stylesCssLines = fs.existsSync(stylesPath) ? countLines(stylesPath) : 0;
  // Slices are listed in LOAD order, not alphabetically: for phase B the order
  // IS the cascade, and a table sorted by name would read as a claim about
  // order that nothing verifies. A file on disk that the entry never imports is
  // called out instead of silently missing from the board.
  const stylesDir = path.join(srcDir, "styles");
  const onDisk = fs.existsSync(stylesDir)
    ? fs
        .readdirSync(stylesDir)
        .filter((n) => n.endsWith(".css"))
        .map((n) => `./styles/${n}`)
    : [];
  const entryPath = path.join(srcDir, "main.tsx");
  const imported = fs.existsSync(entryPath)
    ? importSpecifiers(fs.readFileSync(entryPath, "utf8"))
        .map((s) => s.spec)
        .filter((s) => s.startsWith("./styles/") && s.endsWith(".css"))
    : [];
  const sliceRow = (spec) => ({
    file: `src/${spec.slice(2)}`,
    lines: countLines(path.resolve(root, "src", spec.slice(2))),
  });
  const cssSlices = imported
    .filter((spec, i) => imported.indexOf(spec) === i)
    .map(sliceRow)
    .concat(
      onDisk
        .filter((spec) => !imported.includes(spec))
        .map((spec) => ({ ...sliceRow(spec), unloaded: true })),
    );

  const pkg = require(path.join(root, "package.json"));
  const undeclared = findUndeclaredImports(sources, pkg);

  return {
    "colon-any": colonAny.length,
    "as-any": asAny.length,
    "files-over-1000-lines": oversized.length,
    // The largest file overall, not just among the >1000 list: with the list
    // empty the previous version recorded 0, and `--check` would then reject
    // every non-empty file. The metric's job is a floor the codebase may not
    // grow past, so it must be the real maximum.
    "max-file-lines": maxLines,
    "src-lines": totalLines,
    "undeclared-imports": undeclared.length,
    "styles-css-lines": stylesCssLines,
    _detail: { colonAny, asAny, oversized, undeclared, cssSlices },
  };
}

function parseCommittedBaseline() {
  if (!fs.existsSync(docPath)) {
    console.error(
      "[ratchet] docs/QUALITY_BASELINE.md not found.\n" +
        "Generate it first:  node scripts/quality-ratchet.cjs",
    );
    process.exit(1);
  }
  const text = fs.readFileSync(docPath, "utf8");
  const values = new Map();
  for (const m of text.matchAll(/^\| `([a-z0-9-]+)` \| (\d+|见 [^|]+) \|/gm)) {
    const v = Number(m[2]);
    if (!Number.isNaN(v)) values.set(m[1], v);
  }
  return values;
}

function generate(metrics) {
  const now = new Date().toISOString().slice(0, 10);
  const pkg = require(path.join(root, "package.json"));
  const d = metrics._detail;

  const lines = [
    "# KnowSpace · 质量棘轮基线",
    "",
    "> **文档性质**：代码质量债务的权威口径（与 `TEST_BASELINE.md` 同规格）",
    `> **生成时间**：${now}`,
    `> **应用版本**：\`${pkg.version}\``,
    "> **生成方式**：`node scripts/quality-ratchet.cjs`（自动生成，**禁止手工编辑**）",
    "> **判定规则**：CI 中 `--check` 比对，门控指标只许改善不许恶化；放宽基线必须走评审",
    "> 并留下记录（改生成脚本的方法论，而不是改本文件）。",
    "",
    "---",
    "",
    "## 一、棘轮指标",
    "",
    "| 指标 | 基线值 | 规则 |",
    "| :--- | ---: | :--- |",
    "| `colon-any` | " +
      metrics["colon-any"] +
      " | 只减不增（`: any`，含 `any[]`；不含 `Array<any>` 泛型） |",
    "| `as-any` | " + metrics["as-any"] + " | 只减不增（`as any`） |",
    "| `files-over-1000-lines` | " +
      metrics["files-over-1000-lines"] +
      " | 只减不增（src 非测试代码，> 1000 行） |",
    "| `max-file-lines` | " + metrics["max-file-lines"] + " | 只减不增（最大单文件行数） |",
    "| `styles-css-lines` | " +
      metrics["styles-css-lines"] +
      " | 只减不增（阶段 B：CSS 按**连续前缀**外迁到 src/styles/*.css；回升意味着有人手工折叠了切片，那会改级联） |",
    "| `undeclared-imports` | " +
      metrics["undeclared-imports"] +
      " | 必须为 0（src 中 import 的第三方包必须在 package.json 显式声明，防幽灵依赖） |",
    "| `src-lines` | " + metrics["src-lines"] + " | 记录趋势，不设闸 |",
    "| `test-cases` | 见 `TEST_BASELINE.md` | 只增不减——由测试基线守护，本文件不重复设闸 |",
    "",
    "---",
    "",
    "## 二、超 1000 行文件清单（拆分进度看板）",
    "",
    "| 文件 | 行数 |",
    "| :--- | ---: |",
    ...d.oversized.map((f) => `| \`${f.file}\` | ${f.lines} |`),
    "",
    "---",
    "",
    "## 三、CSS 拆分进度看板（阶段 B）",
    "",
    "`src/styles.css` 的按域外迁清单。**顺序即级联**：下表顺序 = `src/main.tsx` 的",
    "import 顺序 = 拆分前 styles.css 内的物理顺序；每批只切连续前缀，且必须通过",
    "重组证明（脚本已归档 `scripts/_archive/split-styles-css.cjs`，阶段 B 完结）。",
    "",
    "| 文件 | 行数 |",
    "| :--- | ---: |",
    ...d.cssSlices.map(
      (f) =>
        `| \`${f.file}\`（切片${f.unloaded ? " **未被装载——样式不存在**" : ""}） | ${f.lines} |`,
    ),
    `| \`src/styles.css\`（剩余） | ${metrics["styles-css-lines"]} |`,
    "",
    "---",
    "",
    "## 四、类型逃逸清单",
    "",
    "### `: any`",
    "",
    "| 位置 | 代码 |",
    "| :--- | :--- |",
    ...d.colonAny.map((e) => `| \`${e.file}:${e.line}\` | \`${e.snippet.trim()}\` |`),
    "",
    "### `as any`",
    "",
    "| 位置 | 代码 |",
    "| :--- | :--- |",
    ...d.asAny.map((e) => `| \`${e.file}:${e.line}\` | \`${e.snippet.trim()}\` |`),
    "",
    "---",
    "",
    "## 五、未声明的第三方 import（幽灵依赖清单，必须为空）",
    "",
    "| 位置 | 包名 |",
    "| :--- | :--- |",
    ...d.undeclared.map((e) => `| \`${e.file}:${e.line}\` | \`${e.pkg}\` |`),
    "",
  ];

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join("\n"), "utf8");
}

function check(metrics) {
  const committed = parseCommittedBaseline();
  let failed = false;

  for (const key of GATED) {
    const base = committed.get(key);
    const now = metrics[key];
    if (base === undefined) {
      console.error(`[ratchet] committed baseline is missing metric \`${key}\` - regenerate it.`);
      failed = true;
      continue;
    }
    if (now > base) {
      console.error(
        `[ratchet] REGRESSION: \`${key}\` went ${base} -> ${now} (only decreases allowed).`,
      );
      failed = true;
    } else if (now < base) {
      console.log(
        `[ratchet] \`${key}\` improved ${base} -> ${now}. Tighten the ratchet: ` +
          `run \`node scripts/quality-ratchet.cjs\` and commit the refreshed baseline.`,
      );
    } else {
      console.log(`[ratchet] \`${key}\` steady at ${base}.`);
    }
  }

  const detail = metrics._detail;
  if (metrics["undeclared-imports"] > 0) {
    // Hard gate, not a ratchet: a phantom dependency is never acceptable at
    // any count. Print the list so the fix is obvious from the CI log alone.
    console.error(`[ratchet] undeclared third-party imports (${metrics["undeclared-imports"]}):`);
    for (const e of detail.undeclared) {
      console.error(`  ${e.file}:${e.line}  ->  ${e.pkg}`);
    }
    console.error("Fix: npm install <pkg> --save  (or drop the import).");
    failed = true;
  }
  if (failed) {
    console.error(
      "\n[ratchet] If this regression is intentional, it needs a reviewed decision:\n" +
        "fix the code, or change the methodology in scripts/quality-ratchet.cjs - never this doc.",
    );
    process.exit(1);
  }
}

function main() {
  const metrics = measure();
  if (process.argv.includes("--check")) {
    check(metrics);
  } else {
    generate(metrics);
    console.log(
      `[ratchet] baseline written to ${path.relative(root, docPath)}: ` +
        `colon-any ${metrics["colon-any"]}, as-any ${metrics["as-any"]}, ` +
        `files>1000 ${metrics["files-over-1000-lines"]}, max ${metrics["max-file-lines"]}, ` +
        `styles.css ${metrics["styles-css-lines"]}, ` +
        `undeclared-imports ${metrics["undeclared-imports"]}`,
    );
  }
}

main();
