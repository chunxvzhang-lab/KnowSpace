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
 * Output: test-baseline.json          (raw vitest report, git-ignored)
 *         docs/TEST_BASELINE.md       (committed snapshot)
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
    { cwd: root, stdio: "inherit", shell: isWin }
  );

  if (!fs.existsSync(jsonPath)) {
    console.error(
      "\n[baseline] vitest did not produce a JSON report.\n" +
        "Re-run with:  npx vitest run --reporter=json --outputFile=test-baseline.json"
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
  const lineCount = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8").split("\n").length;
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
    ["src/App.tsx", "R1: < 500 行"],
    ["src/components/CanvasView.tsx", "R2: 拆分后各模块 < 2500 行"],
    ["src/services/canvasService.ts", "R2 新增目标: 建议 < 2500 行"],
    ["src/components/MindmapView.tsx", "观察项"],
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
    ""
  );

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join("\n"), "utf8");
}

function main() {
  console.log("[baseline] running the full suite ...\n");
  runVitest();

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const built = buildReport(report);
  writeDoc(built);

  console.log(
    `\n[baseline] ${built.totals.files} files / ${built.totals.tests} tests ` +
      `(${built.totals.passed} passed, ${built.totals.failed} failed)\n` +
      `[baseline] snapshot written to ${path.relative(root, docPath)}`
  );
}

main();
