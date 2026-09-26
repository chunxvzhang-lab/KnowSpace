/**
 * Extracts line ranges out of services/canvasService.ts into a new module.
 *
 * The R2 split moves thousands of lines between files. Copy-pasting that by
 * hand invites silent transcription errors, so each module is assembled from
 * exact line ranges instead — the code is byte-identical to what was removed
 * from the original.
 *
 * Usage:  node scripts/extract-canvas-module.cjs <module-name>
 *
 * The ranges below are reviewed and updated per batch. Line numbers refer to
 * src/services/canvasService.ts *as it currently stands* — re-check them with
 * the symbol dump before running:
 *
 *   node -e "const fs=require('fs');const l=fs.readFileSync('src/services/canvasService.ts','utf8').split(/\r?\n/);l.forEach((x,i)=>{if(/^export\s+(async\s+)?(function|const|interface|type)/.test(x))console.log((i+1)+' '+x.trim().slice(0,60))})"
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "services", "canvasService.ts");

/** Line ranges (1-based, inclusive) per module, in output order. */
const MODULES = {
  serialization: {
    header: `/**
 * JSON Canvas 1.0 serialization: parsing, writing, and the default board.
 *
 * Extracted from canvasService during the R2 split.
 * Code is byte-identical to the original.
 */

import type {
  CanvasData,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasGroupNode,
} from "../types/canvasTypes";

`,
    // parseCanvasData (with its doc comment) · serializeCanvasData ·
    // createDefaultCanvas · isNodeSide (its private validation helper)
    ranges: [
      [47, 193],
      [195, 207],
      [209, 263],
      [1494, 1496],
    ],
    footer: `
`,
  },
};

function sliceLines(lines, start, end) {
  return lines.slice(start - 1, end);
}

function main() {
  const name = process.argv[2];
  const config = MODULES[name];
  if (!config) {
    console.error(`Unknown module "${name}". Known: ${Object.keys(MODULES).join(", ")}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
  const parts = [config.header];

  for (const [start, end] of config.ranges) {
    const body = sliceLines(lines, start, end).join("\n");
    if (!body.trim()) {
      console.error(`Range ${start}-${end} is empty — line numbers have shifted.`);
      process.exit(1);
    }
    parts.push(body, "\n");
  }

  parts.push(config.footer);

  const outPath = path.join(root, "src", "services", `canvas${name[0].toUpperCase()}${name.slice(1)}.ts`);
  fs.writeFileSync(outPath, parts.join("\n").replace(/\n{4,}/g, "\n\n\n"), "utf8");

  const outLines = fs.readFileSync(outPath, "utf8").split(/\r?\n/).length;
  console.log(`Wrote ${path.relative(root, outPath)} (${outLines} lines)`);
}

main();
