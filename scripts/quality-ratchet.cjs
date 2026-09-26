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
 *   colon-any / as-any      type escapes            - may only go DOWN
 *   files-over-1000-lines   size debt, file count   - may only go DOWN
 *   max-file-lines          size debt, worst file   - may only go DOWN
 *   src-lines (non-test)    overall size            - recorded, NOT gated
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

const GATED = new Set(["colon-any", "as-any", "files-over-1000-lines", "max-file-lines"]);

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

  for (const filePath of listSources(srcDir)) {
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
    if (lines > 1000) oversized.push({ file: rel, lines });
  }

  oversized.sort((a, b) => b.lines - a.lines);

  return {
    "colon-any": colonAny.length,
    "as-any": asAny.length,
    "files-over-1000-lines": oversized.length,
    "max-file-lines": oversized.length ? oversized[0].lines : 0,
    "src-lines": totalLines,
    _detail: { colonAny, asAny, oversized },
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
  for (const m of text.matchAll(/^\| `([a-z0-9-]+)` \| (\d+) \|/gm)) {
    values.set(m[1], Number(m[2]));
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
    "## 三、类型逃逸清单",
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
        `files>1000 ${metrics["files-over-1000-lines"]}, max ${metrics["max-file-lines"]}`,
    );
  }
}

main();
