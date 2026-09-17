/**
 * Prints the lines of a source file matching a regular expression.
 *
 * Exists because passing a regex containing `|` through PowerShell mangles it —
 * the shell treats the pipe as its own operator. A file argument has none of
 * that ambiguity, and going through a script also avoids re-quoting the pattern
 * for every call.
 *
 * Usage: node scripts/scan-source.cjs <file> "<regex>" [contextLines] [maxHits]
 */

const fs = require("node:fs");
const path = require("node:path");

const [, , fileArg, pattern, contextArg, maxArg] = process.argv;
if (!fileArg || !pattern) {
  console.error('usage: node scripts/scan-source.cjs <file> "<regex>" [context] [maxHits]');
  process.exit(1);
}

const context = Number.parseInt(contextArg ?? "0", 10) || 0;
const max = Number.parseInt(maxArg ?? "40", 10) || 40;
const target = path.resolve(__dirname, "..", fileArg);
const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
const re = new RegExp(pattern);

let hits = 0;
for (let index = 0; index < lines.length; index += 1) {
  if (!re.test(lines[index])) continue;
  if (hits >= max) {
    console.log("      ... more matches suppressed");
    break;
  }
  hits += 1;
  const from = Math.max(0, index - context);
  const to = Math.min(lines.length, index + context + 1);
  for (let i = from; i < to; i += 1) {
    console.log(String(i + 1).padStart(5) + "  " + lines[i]);
  }
  if (context) console.log("      ---");
}

console.log(`\n${hits} matching lines in ${fileArg}`);
