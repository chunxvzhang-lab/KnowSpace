/**
 * preflight: the release gate, run locally before tagging a version.
 *
 * Mirrors .github/workflows/quality.yml step for step, so "green locally"
 * and "green in CI" mean the same thing. Stop on first failure; every step
 * prints its own banner so the log is readable after a failure.
 *
 * Usage: npm run preflight   (or: node scripts/preflight.cjs)
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

function run(name, command, args) {
  const line = [command, ...args].join(" ");
  console.log(`\n=== preflight · ${name} ===\n$ ${line}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
  });
  if (result.status !== 0) {
    console.error(`\n[preflight] FAILED at "${name}" (exit ${result.status ?? "?"}).`);
    process.exit(result.status ?? 1);
  }
}

run("typecheck", "npx", ["tsc", "--noEmit"]);
run("lint", "npx", ["eslint", "src", "--max-warnings", "0"]);
run("format", "npx", ["prettier", "--check", "."]);
run("quality ratchet", "node", ["scripts/quality-ratchet.cjs", "--check"]);
// The suite writes its JSON report so the baseline check can reuse it instead
// of running everything a second time.
run("tests", "npx", [
  "vitest",
  "run",
  "--reporter=default",
  "--reporter=json",
  "--outputFile=test-baseline.json",
]);
run("test baseline", "node", [
  "scripts/capture-test-baseline.cjs",
  "--check",
  "--report",
  "test-baseline.json",
]);

console.log("\n[preflight] all gates green.");
