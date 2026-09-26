/**
 * commit-msg gate: Conventional Commits or rejected.
 *
 * The guide's rule is that a commit message answers "why", and the release
 * notes are built from this log - so the type(scope): subject shape is the
 * minimum structure the record needs. Merge / Revert commits made by git
 * itself are exempt.
 *
 * Usage (wired via .husky/commit-msg): node scripts/check-commit-msg.cjs <file>
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("[commit-msg] no message file passed");
  process.exit(1);
}

const firstLine = (fs.readFileSync(file, "utf8").split(/\r?\n/)[0] ?? "").trim();

const accepted = [
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|release|revert)(\([^)]+\))?!?: \S/,
  /^Merge (branch|pull request|remote-tracking|commit)/,
  /^Revert /,
];

if (!accepted.some((re) => re.test(firstLine))) {
  console.error(
    `[commit-msg] rejected: "${firstLine}"\n` +
      "Expected Conventional Commits: type(scope)?: subject\n" +
      "  types: feat fix docs style refactor perf test build ci chore release revert\n" +
      "The subject should say why, not just what (ENGINEERING_GUIDE.md, S1).",
  );
  process.exit(1);
}
