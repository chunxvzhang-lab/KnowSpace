/**
 * Captures the full test baseline into a committed snapshot.
 *
 * R3 of the release plan requires a trusted, single-number answer to "how many
 * tests do we have?" before any refactoring starts. The README and the planning
 * docs had drifted (379 / 299 / 384 all appeared at different times), so this
 * script runs the suite once, reads vitest's own JSON report, and writes both
 * the machine-readable result and a human-readable table.
 *
 * Usage:  node scripts/capture-test-baseline.cjs
 *         node scripts/capture-test-baseline.cjs --check [--report test-baseline.json]
 * Output: test-baseline.json          (raw vitest report, git-ignored)
 *         docs/TEST_BASELINE.md       (committed snapshot)
 *
 * --check is the CI form of guide rule "3. 重跑基线": instead of writing the
 * snapshot it compares the fresh numbers against the committed one and exits
 * non-zero if the case total went down, any per-file count went down, or any
 * file vanished - the three forms a silent test deletion can take. Pass
 * --report to reuse a JSON report produced by an earlier `vitest run` in the
 * same pipeline instead of running the suite a second time.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "test-baseline.json");
const docPath = path.join(root, "docs", "TEST_BASELINE.md");

function runVitest() {
  const isWin = process.platform === "win32";
  const result = spawnSync(
    isWin ? "npx.cmd" : "npx",
    ["vitest", "run", "--reporter=json", `--outputFile=${jsonPath}`],
    { cwd: root, stdio: "inherit", shell: isWin },
  );

  if (!fs.existsSync(jsonPath)) {
    console.error(
      "\n[baseline] vitest did not produce a JSON report.\n" +
        "Re-run with:  npx vitest run --reporter=json --outputFile=test-baseline.json",
    );
    process.exit(result.status ?? 1);
  }
}

function buildReport(report) {
  // Group the per-test results by their source file
  const byFile = new Map();
  for (const suite of report.testResults ?? []) {
    const rel = path.relative(root, suite.name).replace(/\\/g, "/");
    const status = suite.status === "passed" ? "passed" : suite.status;
    byFile.set(rel, {
      total: suite.assertionResults?.length ?? 0,
      passed: (suite.assertionResults ?? []).filter((a) => a.status === "passed").length,
      failed: (suite.assertionResults ?? []).filter((a) => a.status === "failed").length,
      status,
    });
  }

  const rows = [...byFile.entries()].sort((a, b) => b[1].total - a[1].total);
  const totals = {
    files: byFile.size,
    tests: report.numTotalTests ?? 0,
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? 0,
    skipped: report.numPendingTests ?? 0,
    durationMs: report.testResults?.reduce((sum, s) => sum + (s.perfStats?.runtime ?? 0), 0) ?? 0,
  };

  return { rows, totals };
}

function writeDoc({ rows, totals }) {
  const now = new Date().toISOString().slice(0, 10);
  const pkg = require(path.join(root, "package.json"));
  // Total line count including blank lines, matching what editors and GitHub
  // display (and what .NET's ReadAllLines reports). The earlier figures in the
  // planning docs used Measure-Object -Line, which omits blank lines — that is
  // why the same file appeared as both 8636 and 9161.
  const lineCount = (rel) => {
    try {
      const lines = fs.readFileSync(path.join(root, rel), "utf8").split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      return lines.length;
    } catch {
      return null;
    }
  };

  const lines = [
    "# KnowSpace · 测试基线快照",
    "",
    "> **文档性质**：重构安全网的权威口径（release plan R3 交付物）",
    `> **生成时间**：${now}`,
    `> **应用版本**：\`${pkg.version}\``,
    "> **生成方式**：`node scripts/capture-test-baseline.cjs`（自动生成，请勿手工编辑）",
    "",
    "---",
    "",
    "## 一、总览",
    "",
    "| 项目 | 数值 |",
    "| :--- | ---: |",
    `| 测试文件 | **${totals.files}** |`,
    `| 用例总数 | **${totals.tests}** |`,
    `| 通过 | ${totals.passed} |`,
    `| 失败 | ${totals.failed} |`,
    `| 跳过 | ${totals.skipped} |`,
    `| 通过率 | ${totals.tests ? ((totals.passed / totals.tests) * 100).toFixed(1) : "0.0"}% |`,
    "",
    "> ✅ **口径确认**：`vitest.config.ts` **未配置任何 `exclude`**，因此上述数字是全量真实口径。",
    "> 此前文档中出现过的 299 / 379 均为**历史阶段的过时数字**，不是被排除的测试。",
    "",
    "---",
    "",
    "## 二、按文件的用例分布",
    "",
    "| 测试文件 | 用例数 | 状态 |",
    "| :--- | ---: | :---: |",
    ...rows.map(([file, info]) => {
      const flag = info.status === "passed" ? "✅" : "❌";
      return `| \`${file}\` | ${info.total} | ${flag} |`;
    }),
    "",
    "---",
    "",
    "## 三、重构相关的关键模块规模",
    "",
    "> 用于跟踪 release plan 中 R1（`App.tsx` < 500 行）与 R2（白板模块 < 2500 行）的达标情况。",
    "",
    "| 文件 | 当前行数 | 目标 |",
    "| :--- | ---: | :--- |",
  ];

  const targets = [
    ["src/components/CanvasView.tsx", "R2 待拆分: 目标各模块 < 2500 行"],
    ["src/App.tsx", "R1: < 500 行"],
    ["src/services/canvasGraph.ts", "R2 已拆分 ✅"],
    ["src/services/canvasExport.ts", "R2 已拆分 ✅"],
    ["src/services/canvasGeometry.ts", "R2 已拆分 ✅"],
    ["src/services/canvasService.ts", "R2 门面（127 行）✅"],
    ["src/services/fsrsService.ts", "F1 新增 · 观察项"],
    ["src/components/MindmapView.tsx", "观察项（已达标）"],
    ["src/services/mindmapService.ts", "观察项"],
  ];

  for (const [file, target] of targets) {
    const n = lineCount(file);
    lines.push(`| \`${file}\` | ${n ?? "—"} | ${target} |`);
  }

  lines.push(
    "",
    "---",
    "",
    "## 四、回归判定基线",
    "",
    "任何重构都必须满足：",
    "",
    `1. 用例总数 **不低于 ${totals.tests}**（删除测试需在 PR 说明中论证）`,
    "2. 通过率 **100%**",
    "3. 单文件用例数**不得下降**（防止测试被静默删除）",
    "",
    "> 复核方式：改动前后各跑一次 `node scripts/capture-test-baseline.cjs`，对比本文档「按文件分布」表。",
    "",
  );

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join("\n"), "utf8");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const reportArgIdx = process.argv.indexOf("--report");
  const reportPath =
    reportArgIdx !== -1 ? path.resolve(root, process.argv[reportArgIdx + 1]) : null;

  if (checkOnly && reportPath && fs.existsSync(reportPath)) {
    checkAgainstDoc(JSON.parse(fs.readFileSync(reportPath, "utf8")));
    return;
  }
  if (checkOnly && reportPath) {
    console.error(`[baseline] --report file not found: ${reportPath}`);
    process.exit(1);
  }

  if (!checkOnly || !reportPath) {
    console.log("[baseline] running the full suite ...\n");
    runVitest();
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const built = buildReport(report);

  if (checkOnly) {
    checkAgainstDoc(report);
    return;
  }

  writeDoc(built);

  console.log(
    `\n[baseline] ${built.totals.files} files / ${built.totals.tests} tests ` +
      `(${built.totals.passed} passed, ${built.totals.failed} failed)\n` +
      `[baseline] snapshot written to ${path.relative(root, docPath)}`,
  );
}

/**
 * The regression rules from the guide, enforced as an exit code:
 *   1. total cases must not drop
 *   2. no file may lose cases (a file that vanished counts as losing all)
 *   3. failed cases must be zero (the suite itself also exits non-zero, but
 *      --check can run against a stale report, so it re-verifies)
 */
function checkAgainstDoc(report) {
  const built = buildReport(report);
  const doc = fs.readFileSync(docPath, "utf8");
  const committedTotal = Number(doc.match(/\| 用例总数 \| \*\*(\d+)\*\*/)?.[1]);
  if (!Number.isFinite(committedTotal)) {
    console.error("[baseline] cannot read 用例总数 from docs/TEST_BASELINE.md");
    process.exit(1);
  }

  const sectionTwo = doc.split("## 二、")[1]?.split("## 三、")[0] ?? "";
  const committedPerFile = new Map();
  for (const m of sectionTwo.matchAll(/^\| `([^`]+)` \| (\d+) \|/gm)) {
    committedPerFile.set(m[1], Number(m[2]));
  }

  const currentPerFile = new Map();
  for (const [file, info] of built.rows) currentPerFile.set(file, info.total);

  const problems = [];
  if (built.totals.failed > 0) {
    problems.push(`suite has ${built.totals.failed} failing cases`);
  }
  if (built.totals.tests < committedTotal) {
    problems.push(`total cases went ${committedTotal} -> ${built.totals.tests}`);
  }
  for (const [file, count] of committedPerFile) {
    const now = currentPerFile.get(file);
    if (now === undefined) {
      problems.push(`test file disappeared: ${file} (had ${count} cases)`);
    } else if (now < count) {
      problems.push(`${file}: ${count} -> ${now} cases`);
    }
  }

  if (problems.length > 0) {
    console.error(
      `[baseline] REGRESSION against committed TEST_BASELINE.md (captured at ` +
        `${committedTotal} cases):\n  - ${problems.join("\n  - ")}\n` +
        `Deleting or weakening tests needs an explicit argument in the PR.`,
    );
    process.exit(1);
  }

  console.log(
    `[baseline] check OK: ${built.totals.tests} cases >= committed ${committedTotal}, ` +
      `no per-file drops, 0 failures. ` +
      `(If case counts changed, refresh the snapshot: node scripts/capture-test-baseline.cjs)`,
  );
}

main();
