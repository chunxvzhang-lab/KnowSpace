/**
 * Removes CSS rules whose selectors refer only to classes nothing renders.
 *
 * Conservative by construction: a rule is only dropped when *every* class in
 * its selector is dead. `.mindmap-node-add-btn:hover .mindmap-add-circle` goes,
 * because the circle it targets no longer exists. `.mindmap-node-add-btn` on
 * its own stays, because the button is still rendered — a blanket delete would
 * have taken the live rule with the dead one.
 *
 * Braces are matched rather than regexed, since a stylesheet's structure is
 * exactly what makes it unsafe to edit with patterns. The file is written back
 * only if the brace count still balances.
 *
 * Usage: node scripts/remove-dead-css.cjs <class1> <class2> ... [--dry]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "styles.css");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dead = new Set(args.filter((a) => !a.startsWith("--")).map((c) => c.replace(/^\./, "")));

if (!dead.size) {
  console.error("usage: node scripts/remove-dead-css.cjs <class...> [--dry]");
  process.exit(1);
}

const css = fs.readFileSync(target, "utf8");
const lines = css.split(/\r?\n/);

/** Finds the end of a rule, starting at the line holding its opening brace. */
function ruleEnd(startLine) {
  let depth = 0;
  for (let i = startLine; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Walks back to the first line of a selector.
 *
 * A selector can span lines — `.mindmap-add-symbol,\n.mindmap-collapse-symbol {`
 * — and only the last of them carries the brace. Deleting from the brace line
 * would leave `.mindmap-add-symbol,` behind, and a dangling selector does not
 * unbalance any braces: it silently joins the *next* rule, which is how a
 * stylesheet gets corrupted while every check still passes.
 */
function selectorStart(braceLine) {
  let i = braceLine;
  while (i > 0) {
    const prev = lines[i - 1].trim();
    if (prev === "" || prev.endsWith("}") || prev.endsWith("*/")) break;
    i -= 1;
  }
  return i;
}

const doomed = [];
for (let i = 0; i < lines.length; i += 1) {
  if (!/\{/.test(lines[i])) continue;
  const from = selectorStart(i);
  // Join the selector's lines, then check every class in it.
  const selector = lines
    .slice(from, i + 1)
    .join(" ")
    .slice(0, lines.slice(from, i + 1).join(" ").indexOf("{"))
    .trim();
  if (!selector || selector.startsWith("@")) continue;

  const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  if (!classes.length) continue;

  // Two ways a rule can be unreachable, and they are different tests.
  //
  // Every class dead: nothing it names is ever rendered, so drop it.
  //
  // Only the last compound dead: the selector descends through a live element
  // to a dead one — `.mindmap-node-add-btn:hover .mindmap-add-circle` — which
  // can never match, and would have survived the test above because the live
  // parent class vetoed it. The final compound is what has to exist for the
  // rule to apply at all, so it is the one that decides.
  const lastCompound = selector.split(/\s+/).pop() || "";
  const lastClasses = [...lastCompound.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);

  const allDead = classes.every((c) => dead.has(c));
  const targetDead = lastClasses.length > 0 && lastClasses.every((c) => dead.has(c));
  if (!allDead && !targetDead) continue;

  const end = ruleEnd(i);
  if (end === -1) {
    console.error(`FAIL: unbalanced rule starting at line ${from + 1}`);
    process.exit(1);
  }
  // Include a trailing blank line so removals do not leave double gaps.
  const stop = lines[end + 1] === "" ? end + 1 : end;
  doomed.push({ from, to: stop, selector });
  i = end;
}

if (!doomed.length) {
  console.log("no rules matched");
  process.exit(0);
}

for (const { from, to, selector } of doomed) {
  console.log(`  lines ${from + 1}-${to + 1}: ${selector}`);
}

const drop = new Set();
for (const { from, to } of doomed) {
  for (let i = from; i <= to; i += 1) drop.add(i);
}
const kept = lines.filter((_, i) => !drop.has(i));
const output = kept.join("\n");

const before = (css.match(/\{/g) || []).length - (css.match(/\}/g) || []).length;
const after = (output.match(/\{/g) || []).length - (output.match(/\}/g) || []).length;
if (before !== after) {
  console.error(`FAIL: brace balance changed from ${before} to ${after}; not writing`);
  process.exit(1);
}

if (dry) {
  console.log(`\nwould remove ${doomed.length} rule(s), ${css.split("\n").length - kept.length} line(s)`);
} else {
  fs.writeFileSync(target, output);
  console.log(`\nremoved ${doomed.length} rule(s), ${css.split("\n").length - kept.length} line(s)`);
}
