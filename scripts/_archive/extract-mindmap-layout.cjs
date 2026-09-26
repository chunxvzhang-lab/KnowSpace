/**
 * Moves the layout engine out of mindmapService into its own module.
 *
 * mindmapService was 1821 lines with every layout in it, and the plan's own note
 * says a fourth layout must not go in there. What moves is everything that turns
 * a tree into coordinates and connectors; what stays is the model, the parsing,
 * the serialisation and the tree operations.
 *
 * Two regions come out, and both are located by content rather than by line
 * number, because the file has been edited between the measurements and the
 * move: the layout types near the top, and the block from the shared spacing
 * constants down to just before updateNodeStyle.
 *
 * The layout id table is folded in at the same time, from core/mindmapLayouts.ts,
 * which is then deleted. The table, the labels and the dispatch are three views
 * of one list, and split across two files the way to get them wrong is to add a
 * layout to the picker and forget the switch — where the default case would
 * render it as the default layout and nothing would fail.
 *
 * Usage: node scripts/extract-mindmap-layout.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "src", "services", "mindmapService.ts");
const registryPath = path.join(root, "src", "core", "mindmapLayouts.ts");
const layoutPath = path.join(root, "src", "services", "mindmapLayout.ts");

/** Start of the types block: its own doc comment, found by walking back from the type. */
const TYPES_ANCHOR = 'export type MindmapLayoutSide = "left" | "right" | "bottom";';
/** Start of the implementation block. */
const BLOCK_ANCHOR = "/** Horizontal gap between levels. Shared, so every layout spaces identically. */";
/** The block ends where updateNodeStyle begins. */
const BLOCK_END = "export function updateNodeStyle(";
/** The registry body starts here; its header comment is replaced by the new module's. */
const REGISTRY_ANCHOR = 'export type MindmapLayoutId = "logic" | "bidirectional" | "vertical";';

const POINTER = `/*
 * The layouts are not here. Everything that turns a tree into coordinates and
 * connectors lives in \`./mindmapLayout\`, together with the id table the picker
 * reads — see the header there for why the two are one module.
 */`;

const HEADER = `import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../core/types";
import { BRANCH_COLORS, calculateNodeDimensions } from "./mindmapService";

/**
 * Mind map layouts: the id table the picker reads, and the functions behind it.
 *
 * A layout is a pure view-level function of the tree. It decides where every
 * node sits and how the connector into it is drawn, and it never touches the
 * tree, the document or a node's own styling — which is what makes switching
 * instant and free of anything to undo.
 *
 * The table, the labels and the dispatch live together on purpose: they are
 * three views of one list, and kept apart the way to get them wrong is to add a
 * layout to the picker and forget the switch, where the default case would
 * quietly render it as the default layout and no test would fail.
 *
 * The model it reads stays in \`./mindmapService\`, which is also where the
 * measurement of one node lives (\`calculateNodeDimensions\`) and where the branch
 * palette comes from. Reading from there rather than owning a copy keeps the
 * palette and the model in one place; the dependency runs one way, and the
 * service does not know this module exists.
 */
`;

/**
 * The doc comment immediately above \`index\`, if there is one.
 *
 * Walks up from the opening \`/**\` of whatever block ends just before the line,
 * so the comment belongs to what follows it rather than being left behind.
 */
function blockCommentStart(lines, index) {
  let cursor = index - 1;
  while (cursor >= 0 && lines[cursor].trim() === "") cursor -= 1;
  if (cursor < 0 || !lines[cursor].trim().endsWith("*/")) return index;

  while (cursor >= 0 && !lines[cursor].trim().startsWith("/**")) cursor -= 1;
  return cursor < 0 ? index : cursor;
}

function indexOf(lines, predicate, from = 0, what = "marker") {
  const index = lines.findIndex((line, i) => i >= from && predicate(line));
  if (index === -1) {
    console.error(`FAIL: could not find ${what} (searched from line ${from + 1})`);
    process.exit(1);
  }
  return index;
}

function main() {
  const write = process.argv.includes("--write");

  const serviceLines = fs.readFileSync(servicePath, "utf8").split(/\r?\n/);
  const registryLines = fs.readFileSync(registryPath, "utf8").split(/\r?\n/);

  // ── Region A: the layout types ────────────────────────────────────────────
  const typesLine = indexOf(serviceLines, (line) => line === TYPES_ANCHOR, 0, "the layout side type");
  const typesStart = blockCommentStart(serviceLines, typesLine);
  const resultStart = indexOf(
    serviceLines,
    (line) => line.startsWith("export interface MindmapLayoutResult"),
    typesLine,
    "MindmapLayoutResult"
  );
  const resultEnd = indexOf(serviceLines, (line) => line === "}", resultStart, "the end of MindmapLayoutResult");

  // ── Region B: the implementation ──────────────────────────────────────────
  const blockStart = indexOf(serviceLines, (line) => line === BLOCK_ANCHOR, 0, "the spacing constants");
  const blockEnd = indexOf(serviceLines, (line) => line.startsWith(BLOCK_END), blockStart, BLOCK_END);

  if (!(typesStart < typesLine && typesLine < resultStart && resultStart < resultEnd)) {
    console.error("FAIL: the types region is out of order");
    process.exit(1);
  }
  if (!(blockStart < blockEnd && resultEnd < blockStart)) {
    console.error("FAIL: the regions overlap or are out of order");
    process.exit(1);
  }

  const typesBlock = serviceLines.slice(typesStart, resultEnd + 1);
  const implBlock = serviceLines.slice(blockStart, blockEnd);

  const registryStart = indexOf(
    registryLines,
    (line) => line === REGISTRY_ANCHOR,
    0,
    "the layout id union"
  );
  const registryBlock = registryLines.slice(registryStart);
  while (registryBlock.length && registryBlock[registryBlock.length - 1].trim() === "") registryBlock.pop();
  // The implementation block ends just before updateNodeStyle, so its last line
  // is the blank that separated the two.
  while (implBlock.length && implBlock[implBlock.length - 1].trim() === "") implBlock.pop();

  const newModule = [
    HEADER,
    ...registryBlock,
    "",
    ...typesBlock,
    "",
    ...implBlock,
    "",
  ].join("\n");

  const nextService = [
    ...serviceLines.slice(0, typesStart),
    POINTER,
    ...serviceLines.slice(resultEnd + 1, blockStart),
    ...serviceLines.slice(blockEnd),
  ];

  console.log(`types region:  lines ${typesStart + 1}-${resultEnd + 1} (${typesBlock.length} lines)`);
  console.log(`  first: ${typesBlock[0]}`);
  console.log(`  last:  ${typesBlock[typesBlock.length - 1]}`);
  console.log(`impl region:   lines ${blockStart + 1}-${blockEnd} (${implBlock.length} lines)`);
  console.log(`  first: ${implBlock[0]}`);
  console.log(`  last:  ${implBlock[implBlock.length - 1]}`);
  console.log(`registry:      lines ${registryStart + 1}-end (${registryBlock.length} lines)`);
  console.log(`  first: ${registryBlock[0]}`);
  console.log(`  last:  ${registryBlock[registryBlock.length - 1]}`);
  console.log("");
  console.log(`mindmapService.ts: ${serviceLines.length} -> ${nextService.length} lines`);
  console.log(`mindmapLayout.ts:  ${newModule.split("\n").length} lines`);

  if (!write) {
    console.log("");
    console.log("--- dry run, nothing written ---");
    console.log("--- service around the pointer ---");
    console.log(nextService.slice(typesStart - 3, typesStart + 6).join("\n"));
    return;
  }

  fs.writeFileSync(layoutPath, newModule);
  fs.writeFileSync(servicePath, nextService.join("\n"));
  fs.unlinkSync(registryPath);
  console.log("");
  console.log(`wrote ${path.relative(root, layoutPath)}`);
  console.log(`rewrote ${path.relative(root, servicePath)}`);
  console.log(`removed ${path.relative(root, registryPath)}`);
}

main();
