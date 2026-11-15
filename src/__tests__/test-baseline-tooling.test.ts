// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const prefix = join(tmpdir(), "knowspace-baseline-");
const fixtures: string[] = [];
const committedDoc = [
  "| 用例总数 | **1** |",
  "## 二、按文件的用例分布",
  "| `src/__tests__/owned.test.ts` | 1 | ✅ |",
  "## 三、重构相关的关键模块规模",
].join("\n");

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    if (!resolve(fixture).startsWith(resolve(prefix))) {
      throw new Error("Refusing to remove a directory outside the baseline fixture prefix");
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});

function makeFixture(
  options: { success?: boolean; suiteStatus?: string; failed?: number; empty?: boolean } = {},
) {
  const root = mkdtempSync(prefix);
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "docs"));
  copyFileSync(
    join(repoRoot, "scripts/capture-test-baseline.cjs"),
    join(root, "scripts/capture-test-baseline.cjs"),
  );
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(join(root, "docs/TEST_BASELINE.md"), committedDoc);
  writeFileSync(
    join(root, "report.json"),
    JSON.stringify({
      success: options.success ?? true,
      numTotalTests: options.empty ? 0 : 1,
      numPassedTests: options.failed || options.empty ? 0 : 1,
      numFailedTests: options.failed ?? 0,
      numPendingTests: 0,
      testResults: options.empty
        ? []
        : [
            {
              name: join(root, "src/__tests__/owned.test.ts"),
              status: options.suiteStatus ?? "passed",
              assertionResults: [{ status: options.failed ? "failed" : "passed" }],
            },
          ],
    }),
  );
  return root;
}

function check(root: string, args = ["--check", "--report", "report.json"]) {
  return spawnSync(process.execPath, ["scripts/capture-test-baseline.cjs", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
  });
}

it.each([
  { label: "unsuccessful run with zero failed assertions", success: false },
  { label: "failed suite with zero failed assertions", suiteStatus: "failed" },
  { label: "failed assertions", failed: 1 },
  { label: "empty run", empty: true },
])("rejects $label without changing the committed baseline", (options) => {
  const root = makeFixture(options);
  const result = check(root);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(committedDoc);
});

it("accepts a successful report without rewriting the baseline in check mode", () => {
  const root = makeFixture();
  const result = check(root);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(committedDoc);
});

it("captures an existing successful report without launching Vitest again", () => {
  const root = makeFixture();
  const result = check(root, ["--report", "report.json"]);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const doc = readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8");
  expect(doc).toContain("> **应用版本**：`1.0.0`");
  expect(doc).toContain("| 用例总数 | **1** |");
  expect(doc).toContain("`vitest.config.ts` 的 `include`");
});

it("refuses to capture an unsuccessful report", () => {
  const root = makeFixture({ success: false });
  const result = check(root, ["--report", "report.json"]);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(committedDoc);
});

it("refuses to lower the committed baseline when capturing", () => {
  const root = makeFixture();
  const largerBaseline = committedDoc.replaceAll("**1**", "**2**").replace("| 1 |", "| 2 |");
  writeFileSync(join(root, "docs/TEST_BASELINE.md"), largerBaseline);
  const result = check(root, ["--report", "report.json"]);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(largerBaseline);
});

it("does not reuse a stale report when Vitest fails to launch successfully", () => {
  const root = makeFixture();
  copyFileSync(join(root, "report.json"), join(root, "test-baseline.json"));
  mkdirSync(join(root, "node_modules/vitest"), { recursive: true });
  writeFileSync(join(root, "node_modules/vitest/vitest.mjs"), "process.exit(1);");
  const result = check(root, []);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stderr).toContain("vitest failed");
  expect(existsSync(join(root, "test-baseline.json"))).toBe(false);
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(committedDoc);
});

it("rejects --report without a file path", () => {
  const root = makeFixture();
  const result = check(root, ["--report"]);
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stderr).toContain("--report requires a file path");
  expect(readFileSync(join(root, "docs/TEST_BASELINE.md"), "utf8")).toBe(committedDoc);
});
