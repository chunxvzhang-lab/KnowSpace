/**
 * Prints the lines of MindmapView.tsx matching a regular expression.
 *
 * Exists because passing a regex containing `|` through PowerShell mangles it —
 * the shell treats the pipe as its own. A file argument has no such problem.
 *
 * Usage: node scripts/scan-mindmap.cjs "<regex>" [surrounding-lines]
 */

const fs = require("node:fs");
const path = require("node:path");

const [, , pattern, contextArg] = process.argv;
if (!pattern) {
  console.error('usage: node scripts/scan-mindmap.cjs "<regex>" [contextLines]');
  process.exit(1);
}

const context = Number.parseInt(contextArg ?? "0", 10) || 0;
const target = path.join(__dirname, "..", "src", "components", "MindmapView.tsx");
const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
const re = new RegExp(pattern);

let hits = 0;
lines.forEach((line, index) => {
  if (!re.test(line)) return;
  hits += 1;
  const from = Math.max(0, index - context);
  const to = Math.min(lines.length, index + context + 1);
  for (let i = from; i < to; i += 1) {
    console.log(String(i + 1).padStart(5) + "  " + lines[i]);
  }
  if (context) console.log("      ---");
});

console.log(`\n${hits} matching lines`);
