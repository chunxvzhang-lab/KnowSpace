/**
 * Removes the imports that scripts/find-dead-code.cjs reports as unused.
 *
 * Run the finder first and read its list — this deletes whatever the finder
 * would print, so a bad finder means a bad edit. The check that makes it safe
 * is `npx tsc --noEmit` afterwards: a name that was actually used becomes a
 * compile error, and the file can be restored from git. Nothing here needs to
 * be trusted on its own.
 *
 * Default imports are dropped whole. Named imports are removed from the braces,
 * and the statement goes if that empties the list.
 *
 * Usage: node scripts/remove-dead-imports.cjs [--dry]
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dry = process.argv.includes("--dry");

// Re-use the finder rather than re-deriving the list, so the two cannot drift.
const report = execFileSync(process.execPath, [path.join(__dirname, "find-dead-code.cjs")], {
  cwd: root,
  encoding: "utf8",
});

const targets = new Map();
for (const line of report.split(/\r?\n/)) {
  const m = /^\s{2}(\S+):\s+(\S+)$/.exec(line);
  if (!m) continue;
  const [, file, name] = m;
  if (!targets.has(file)) targets.set(file, new Set());
  targets.get(file).add(name);
}

let removed = 0;
let touchedFiles = 0;

for (const [relFile, names] of targets) {
  const file = path.join(root, relFile.replace(/\\/g, "/"));
  let text = fs.readFileSync(file, "utf8");
  const before = text;

  for (const name of names) {
    // Every import statement mentioning the name, possibly multi-line.
    const stmtRe = /^\s*import\b[^;]*;/gm;
    let m;
    const edits = [];
    while ((m = stmtRe.exec(text)) !== null) {
      const stmt = m[0];
      if (!new RegExp(`\\b${name}\\b`).test(stmt)) continue;

      const braced = /\{([\s\S]*?)\}/.exec(stmt);
      const isDefaultImport = !braced && new RegExp(`^\\s*import\\s+${name}\\b`).test(stmt);

      if (isDefaultImport) {
        edits.push({ from: m.index, to: m.index + stmt.length, text: "" });
        continue;
      }
      if (!braced) continue; // named but not in braces — leave alone

      const kept = braced[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => p.replace(/^type\s+/, "").split(/\s+as\s+/).pop() !== name);

      const rebuilt = kept.length
        ? stmt.replace(braced[0], `{ ${kept.join(", ")} }`)
        : ""; // nothing left, drop the whole statement
      edits.push({ from: m.index, to: m.index + stmt.length, text: rebuilt });
    }

    // Apply back-to-front so indices stay valid.
    for (const e of edits.sort((a, b) => b.from - a.from)) {
      text = text.slice(0, e.from) + e.text + text.slice(e.to);
      if (!e.text) removed += 1;
      else removed += 1;
    }
  }

  if (text !== before) {
    if (!dry) fs.writeFileSync(file, text);
    touchedFiles += 1;
    console.log(`  ${relFile}: ${names.size} name(s)${dry ? " (dry run)" : ""}`);
  }
}

console.log(`\n${removed} import reference(s) across ${touchedFiles} file(s)`);
if (!dry) console.log("now run: npx tsc --noEmit");
