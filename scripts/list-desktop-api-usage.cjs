/**
 * Lists which methods of the desktop (Electron preload) bridge each source file
 * actually calls.
 *
 * Building a test harness for App.tsx means faking `window.knowSpaceDesktop`,
 * and that interface declares 60+ methods. Knowing the ~20 that are really used
 * turns an intimidating mock into a small one.
 *
 * Usage: node scripts/list-desktop-api-usage.cjs [file ...]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const defaultTargets = ["src/App.tsx"];

/** Matches `desktop.foo`, `desktop?.foo`, `window.knowSpaceDesktop.foo`, … */
const CALL_RE = /(?:desktop|knowSpaceDesktop|bookMDDesktop)\??\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.)?\(/g;

function collect(file) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const counts = new Map();
  let match;
  while ((match = CALL_RE.exec(text)) !== null) {
    const name = match[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function main() {
  const targets = process.argv.slice(2);
  const files = targets.length > 0 ? targets : defaultTargets;

  const aggregate = new Map();

  for (const file of files) {
    const counts = collect(file);
    console.log(`\n${file}: ${counts.size} distinct bridge methods`);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`  ${name.padEnd(32)} ${count}`);
      aggregate.set(name, (aggregate.get(name) ?? 0) + count);
    }
  }

  if (files.length > 1) {
    console.log(`\nAggregate: ${aggregate.size} distinct methods`);
    console.log([...aggregate.keys()].sort().join(", "));
  }
}

main();
