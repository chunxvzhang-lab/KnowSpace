/**
 * Finds two kinds of leftover that a type-checker will not report.
 *
 * 1. Unused imports. tsc only flags these when `noUnusedLocals` is on, and even
 *    then only per file — this checks every name brought in by an import.
 * 2. Unused CSS classes. A stylesheet has no compiler, so a rule whose element
 *    was deleted years ago sits there forever. Scoped to `mindmap-*` because
 *    that is the area under work; pass a prefix to check another.
 *
 * Deliberately dumb: a name is reported when it appears exactly once in its
 * file — the import line itself. That misses nothing important and invents
 * nothing, which matters more than cleverness when the output is a list of
 * things to delete.
 *
 * Usage: node scripts/find-dead-code.cjs [classPrefix]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const prefix = process.argv[2] || "mindmap-";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(path.join(root, "src"));
const sources = files.filter((f) => /\.(ts|tsx)$/.test(f));
const contents = new Map(sources.map((f) => [f, fs.readFileSync(f, "utf8")]));

// ── 1. Unused imports ──────────────────────────────────────────────────────
console.log("=== unused imports ===");
let unusedImports = 0;

for (const file of sources) {
  const text = contents.get(file);
  const lines = text.split(/\r?\n/);

  // Collect every import statement, including multi-line braced lists.
  const statements = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*import\b/.test(lines[i])) continue;
    let stmt = lines[i];
    let j = i;
    while (!/;\s*$/.test(stmt) && j + 1 < lines.length) {
      j += 1;
      stmt += "\n" + lines[j];
    }
    statements.push({ from: i, to: j, stmt });
    i = j;
  }

  for (const { stmt } of statements) {
    // `import x from "y"` and `import { a, b as c } from "y"` and type-only.
    const defaultMatch = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(stmt);
    const bracedMatch = /\{([\s\S]*?)\}/.exec(stmt);
    const names = [];
    if (defaultMatch) names.push(defaultMatch[1]);
    if (bracedMatch) {
      for (const part of bracedMatch[1].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
      }
    }

    // Build the body by subtracting the import statements themselves, rather
    // than by dropping line ranges. A range-based version silently swallowed
    // real code whenever a statement's end was misjudged, which made used names
    // look unused — the worst possible failure for a tool whose output is a
    // list of things to delete.
    let body = text;
    for (const { stmt } of statements) {
      body = body.split(stmt).join("\n");
    }

    for (const name of names) {
      const hits = body.match(new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`, "g"));
      if (!hits) {
        console.log(`  ${path.relative(root, file)}: ${name}`);
        unusedImports += 1;
      }
    }
  }
}
if (!unusedImports) console.log("  (none)");

// ── 2. Unused CSS classes ──────────────────────────────────────────────────
console.log(`\n=== unused .${prefix}* classes in src/styles.css ===`);
const cssPath = path.join(root, "src", "styles.css");
const css = fs.readFileSync(cssPath, "utf8");

const classRe = new RegExp(`\\.(${prefix}[a-z0-9-]+)`, "g");
const declared = new Set();
let m;
while ((m = classRe.exec(css)) !== null) declared.add(m[1]);

// Every source file plus the HTML shell, since a class can be set from either.
const haystack = sources.map((f) => contents.get(f)).join("\n") + fs.readFileSync(path.join(root, "index.html"), "utf8");

const unusedClasses = [];
for (const name of [...declared].sort()) {
  // A prefix match counts: `mindmap-node` is used by `mindmap-node-interactive`.
  if (!new RegExp(`\\b${name}`).test(haystack)) unusedClasses.push(name);
}

for (const name of unusedClasses) console.log(`  .${name}`);
if (!unusedClasses.length) console.log("  (none)");

console.log(`\n${unusedImports} unused import(s), ${unusedClasses.length} unused class(es)`);
