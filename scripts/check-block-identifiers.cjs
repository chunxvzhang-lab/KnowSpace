/**
 * Counts occurrences of given identifiers inside a line range of CanvasView.
 *
 * Complements analyze-canvas-block.cjs: that one tests a curated candidate
 * list, this one checks specific names you already suspect are in play. The
 * colour-preview helpers were missed by the candidate list during B3 and only
 * surfaced when tsc ran, so they get checked explicitly from now on.
 *
 * Usage: node scripts/check-block-identifiers.cjs <startLine> <endLine> <name...>
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "components", "CanvasView.tsx");

function main() {
  const [startArg, endArg, ...names] = process.argv.slice(2);
  const start = Number(startArg);
  const end = Number(endArg);

  if (!start || !end || names.length === 0) {
    console.error("Usage: node scripts/check-block-identifiers.cjs <startLine> <endLine> <name...>");
    process.exit(1);
  }

  const body = fs
    .readFileSync(target, "utf8")
    .split(/\r?\n/)
    .slice(start - 1, end)
    .join("\n");

  let found = 0;
  for (const name of names) {
    // Plain substring count — no regex, so no escaping to get wrong.
    let count = 0;
    let index = body.indexOf(name);
    while (index !== -1) {
      count += 1;
      index = body.indexOf(name, index + name.length);
    }
    if (count > 0) {
      console.log(`${name}: ${count}`);
      found += 1;
    } else {
      console.log(`${name}: —`);
    }
  }

  console.log(`\n${found} of ${names.length} identifiers present in lines ${start}-${end}.`);
}

main();
