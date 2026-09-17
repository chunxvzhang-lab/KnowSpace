/**
 * Replaces the release body embedded in publish_github_release.py with a read
 * of docs/RELEASE_NOTES_v2.5.0.md.
 *
 * The body used to be a 67-line string literal inside the script, which meant
 * the release notes existed in two places and could disagree. Reading the
 * maintained document removes the second copy.
 *
 * Usage: node scripts/slim-release-body.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "scripts", "publish_github_release.py");
const write = process.argv.includes("--write");

const CLOSING = '"""';

const REPLACEMENT = [
  "    # The release body is read from the maintained notes document rather than",
  "    # embedded here, so the two cannot drift apart.",
  '    notes_path = os.path.join(',
  '        os.path.dirname(os.path.abspath(__file__)), "..", "docs", "RELEASE_NOTES_v2.5.0.md"',
  "    )",
  '    with open(notes_path, "r", encoding="utf-8") as notes_file:',
  "        body_md = notes_file.read()",
];

function main() {
  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);

  const start = lines.findIndex((line) => line.startsWith("    body_md = r"));
  if (start === -1) {
    console.error("FAIL: could not find the embedded body_md assignment");
    process.exit(1);
  }
  const end = lines.findIndex((line, i) => i > start && line === CLOSING);
  if (end === -1) {
    console.error("FAIL: could not find the closing quotes after body_md");
    process.exit(1);
  }

  console.log(`body_md: lines ${start + 1}-${end + 1} (${end - start + 1} lines)`);
  console.log(`replacing with ${REPLACEMENT.length} lines`);

  if (!write) {
    console.log("--- dry run, first old line ---");
    console.log(lines[start]);
    console.log("--- last old line ---");
    console.log(lines[end]);
    return;
  }

  const next = [...lines.slice(0, start), ...REPLACEMENT, ...lines.slice(end + 1)];
  fs.writeFileSync(target, next.join("\n"));
  console.log(`rewrote ${path.relative(root, target)}: ${lines.length} -> ${next.length} lines`);
}

main();
