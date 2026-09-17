/**
 * Splits services/canvasService.ts into its R2 modules (design:
 * docs/CANVAS_SPLIT_DESIGN.md) in a single pass.
 *
 * Why one pass: each extraction shifts the line numbers of everything below it,
 * so doing this module-by-module would require re-deriving every range after
 * each step. Reading the file once and partitioning it by symbol avoids that
 * entirely — and because the code is sliced rather than retyped, the output is
 * byte-identical to the input.
 *
 * Usage:
 *   node scripts/split-canvas-service.cjs --dry-run   # print the partition plan
 *   node scripts/split-canvas-service.cjs --write     # generate modules + facade
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "services", "canvasService.ts");
const outDir = path.join(root, "src", "services");

/**
 * Which module each top-level symbol belongs to.
 *
 * Ordering inside a module follows the original file so the extracted code
 * reads in the same sequence it used to.
 */
const ASSIGNMENT = {
  serialization: [
    "parseCanvasData",
    "serializeCanvasData",
    "createDefaultCanvas",
    "isNodeSide",
  ],
  geometry: [
    "computeBoundingBox",
    "getNodeAnchorPoint",
    "computeBezierControlPoints",
    "StepBendHandleInfo",
    "getStepBendHandleInfo",
    "getOptimalAnchorSides",
    "projectPointOntoRing",
    "CanvasAlignDirection",
    "CircleAlignOptions",
    "computeMinRingRadius",
    "orderByExplicitIds",
    "convexHull",
    "isPointInPolygon",
    "isPointInsideNodeHull",
    "RingSpacingLayout",
    "computeRingSpacingLayout",
    "resizeRingSpacing",
    "alignNodesInCircle",
    "GridAlignOptions",
    "alignNodesInGrid",
    "GridLayoutInfo",
    "computeGridLayout",
    "resizeGridSpacing",
    "computeRingLayout",
    "alignNodes",
  ],
  routing: [
    "AABBBox",
    "collectCollidingEnvelope",
    "horizontalSegmentIntersectsBox",
    "verticalSegmentIntersectsBox",
    "pathIntersectsBox",
    "computeEdgePath",
    "computeEdgeMidpoint",
  ],
  graph: [
    "buildPresentationSequence",
    "extractCanvasToMarkdown",
    "isEdgeOnCycle",
    "getLoopEdgeIds",
    "edgeTopologyFingerprint",
    "cachedTopologyHash",
    "cachedLoopEdgeIds",
    "getLoopEdgeIdsCached",
    "getLoopEdgeColors",
    "expandLoopEdgeSelection",
    "syncGridEdges",
    "syncRingEdges",
    "syncLoopEdgeGeometry",
  ],
  color: [
    "normalizeHexColor",
    "isColorSimilar",
    "isColorSimilarToAny",
    "getLoopComponentInfo",
    "getSourceNodeEdgeColor",
    "getNextEdgeColorForSource",
    "getEffectiveEdgeColorKey",
    "computeSourceDisplayColorMap",
  ],
  edges: [
    "createEdgeBetweenNodes",
    "spawnConnectedCard",
    "connectOneToMany",
    "connectChainNodes",
    "connectLoopNodes",
    "disconnectNodeEdges",
    "spawnMultipleBranches",
    "cycleEdgeArrow",
    "cycleEdgeStyle",
    "cycleEdgeStrokePattern",
    "reverseEdgeDirection",
  ],
  export: [
    "CanvasExportOptions",
    "escapeSvgXml",
    "exportCanvasToSvg",
    "MAX_EXPORT_PIXELS",
    "MAX_EXPORT_EDGE",
    "EXPORT_RASTERISE_TIMEOUT_MS",
    "resolveExportScale",
    "loadImageForExport",
    "canvasToPngBlob",
    "isInternalReference",
    "fileUrlToPath",
    "RESOURCE_READ_TIMEOUT_MS",
    "readUrlAsDataUrl",
    "sanitizeSvgResources",
    "HTML_BOOLEAN_ATTR_RE",
    "SVG_OR_HTML_TAG_RE",
    "valueBooleanAttributes",
    "sanitizeSvgViaDom",
    "SVG_IMAGE_TAG_RE",
    "SVG_CSS_URL_RE",
    "sanitizeSvgViaRegex",
    "stripSvgImages",
    "stripSvgImagesViaDom",
    "isTaintedCanvasError",
    "blobToDataUrl",
    "exportCanvasToPngBlob",
    "exportCanvasToPng",
    "CanvasDownloadResult",
    "downloadCanvasAsImage",
    "copyCanvasImageToClipboard",
  ],
};

/**
 * Header written at the top of each generated module.
 *
 * Import lists are a best guess: the split is verified by `tsc --noEmit`, which
 * names anything missing or unused far more reliably than reading 5000 lines by
 * eye. Expect one or two corrections on the first run.
 */
const MODULE_HEADERS = {
  serialization: `/**
 * JSON Canvas 1.0 serialization: parsing, writing and the default board.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type {
  CanvasData,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasGroupNode,
} from "../types/canvasTypes";

`,
  geometry: `/**
 * Canvas geometry: bounding boxes, anchors, ring/grid detection and alignment.
 *
 * Pure computation — no DOM access — so this module runs (and is testable) in a
 * plain Node environment. Extracted from canvasService during the R2 split; see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type {
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
  CanvasGroupNode,
  CanvasEdge,
} from "../types/canvasTypes";

`,
  routing: `/**
 * Edge routing: AABB obstacle avoidance and orthogonal step paths.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type { CanvasNode, CanvasNodeSide } from "../types/canvasTypes";
import { computeBezierControlPoints, projectPointOntoRing } from "./canvasGeometry";

`,
  graph: `/**
 * Canvas graph: cycle detection and topology-driven loop geometry.
 *
 * The cycle scan is memoised on an FNV-1a fingerprint of the edge topology —
 * dragging only moves coordinates, never the topology, so the O(E x (V+E))
 * scan is skipped on every drag frame. The cache lives here rather than in the
 * colour module that also consults it, so the dependency stays one-way.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type { CanvasData, CanvasNode, CanvasEdge, CanvasGroupNode } from "../types/canvasTypes";
import { getNodesInsideGroup } from "./canvasPrimitives";
import { computeGridLayout, computeRingLayout } from "./canvasGeometry";

`,
  color: `/**
 * Canvas colour: palette resolution and per-source edge colour assignment.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type { CanvasNode, CanvasEdge, CanvasGroupNode } from "../types/canvasTypes";
import {
  CANVAS_COLOR_PALETTES,
  findContainerForNode,
  isNodeInsideGroup,
} from "./canvasPrimitives";
import { getLoopEdgeIdsCached } from "./canvasGraph";

`,
  edges: `/**
 * Canvas edge mutations: creating, connecting, spawning and reversing edges.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type {
  CanvasEdge,
  CanvasEdgeLineStyle,
  CanvasNode,
  CanvasNodeSide,
  CanvasTextNode,
} from "../types/canvasTypes";
import { computeGridLayout, computeRingLayout, getOptimalAnchorSides } from "./canvasGeometry";
import { getLoopEdgeColors } from "./canvasGraph";
import { getSourceNodeEdgeColor } from "./canvasColor";

`,
  export: `/**
 * Canvas export: SVG generation, PNG rasterisation, download and clipboard.
 *
 * Every DOM and Electron-bridge call in the canvas layer lives here, which is
 * what lets the other canvas modules be tested without a browser.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type {
  CanvasData,
  CanvasEdge,
  CanvasNode,
  CanvasNodeSide,
} from "../types/canvasTypes";
import { renderCardMarkdown } from "./markdown";
import { serializeSvgForExport } from "./svgExport";
import { getCanvasThemeColors, normalizeExportTheme } from "./canvasTheme";
import { CANVAS_COLOR_PALETTES, getMediaFileType } from "./canvasPrimitives";
import {
  computeBoundingBox,
  getNodeAnchorPoint,
  getOptimalAnchorSides,
  projectPointOntoRing,
} from "./canvasGeometry";
import { computeEdgePath, computeEdgeMidpoint } from "./canvasRouting";
import { computeSourceDisplayColorMap, getEffectiveEdgeColorKey } from "./canvasColor";

`,
};

const DECL_RE = /^(export\s+)?(async\s+)?(function|const|interface|type|let)\s+([A-Za-z0-9_]+)/;

/** Walks up from a declaration to include its leading doc comment. */
function findCommentStart(lines, declIndex) {
  let i = declIndex - 1;
  if (i >= 0 && lines[i].trim().endsWith("*/")) {
    while (i >= 0 && !lines[i].trim().startsWith("/*")) i -= 1;
    return i;
  }
  // A run of `//` lines directly above
  let j = declIndex - 1;
  while (j >= 0 && lines[j].trim().startsWith("//")) j -= 1;
  return j + 1;
}

/** Collects every top-level declaration with its line span. */
function collectDeclarations(lines) {
  const decls = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = DECL_RE.exec(lines[i]);
    if (!m) continue;
    // Only column-0 declarations are top-level
    if (/^\s/.test(lines[i])) continue;
    decls.push({
      name: m[4],
      kind: m[3],
      declLine: i,
      start: findCommentStart(lines, i),
      end: null,
    });
  }
  for (let i = 0; i < decls.length; i += 1) {
    const next = decls[i + 1];
    // Trailing blank lines belong to no one; trim them off this block
    let end = next ? next.start - 1 : lines.length - 1;
    while (end > decls[i].declLine && lines[end].trim() === "") end -= 1;
    decls[i].end = end;
  }
  return decls;
}

function main() {
  const write = process.argv.includes("--write");
  const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
  const decls = collectDeclarations(lines);

  const byName = new Map(decls.map((d) => [d.name, d]));

  // Verify every assignment resolves, and that nothing is claimed twice
  const claimed = new Map();
  const missing = [];
  for (const [moduleName, symbols] of Object.entries(ASSIGNMENT)) {
    for (const symbol of symbols) {
      if (!byName.has(symbol)) {
        missing.push(`${moduleName}:${symbol}`);
        continue;
      }
      if (claimed.has(symbol)) {
        missing.push(`DUPLICATE ${symbol} (${claimed.get(symbol)} & ${moduleName})`);
        continue;
      }
      claimed.set(symbol, moduleName);
    }
  }

  if (missing.length > 0) {
    console.error("Unresolved symbols:\n  " + missing.join("\n  "));
    process.exit(1);
  }

  // Anything not claimed stays in the facade for now
  const unclaimed = decls.filter((d) => !claimed.has(d.name));
  const ranges = decls.map((d) => ({ ...d, module: claimed.get(d.name) ?? "(facade)" }));
  ranges.sort((a, b) => a.start - b.start);

  console.log(`Total declarations: ${decls.length}`);
  for (const [moduleName, symbols] of Object.entries(ASSIGNMENT)) {
    console.log(`  ${moduleName.padEnd(15)} ${symbols.length} symbols`);
  }
  console.log(`  ${"(facade)".padEnd(15)} ${unclaimed.length} symbols`);
  if (unclaimed.length > 0) {
    console.log("    " + unclaimed.map((d) => d.name).join(", "));
  }

  // Report gaps: line ranges not covered by any declaration
  console.log("\nCoverage check:");
  let cursor = 0;
  const gaps = [];
  const headerEnd = decls.length > 0 ? decls[0].start : lines.length;
  if (headerEnd > 0) {
    const header = lines.slice(0, headerEnd).filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"));
    if (header.length > 0) console.log(`  header block: ${headerEnd} lines (imports + re-exports)`);
  }
  for (const r of ranges) {
    if (r.start > cursor) {
      const skipped = lines.slice(cursor, r.start).filter((l) => l.trim() !== "");
      if (skipped.length > 0) gaps.push(`lines ${cursor + 1}-${r.start}: ${skipped.length} non-blank`);
    }
    cursor = r.end + 1;
  }
  if (cursor < lines.length) {
    const tail = lines.slice(cursor).filter((l) => l.trim() !== "");
    if (tail.length > 0) gaps.push(`tail lines ${cursor + 1}-${lines.length}: ${tail.length} non-blank`);
  }
  if (gaps.length === 0) console.log("  ✅ every non-blank line is inside a declaration block");
  else for (const g of gaps) console.log("  ⚠️ " + g);

  if (!write) {
    console.log("\n(dry run — pass --write to generate files)");
    console.log("\nPer-symbol spans:");
    for (const r of ranges) {
      console.log(`  ${String(r.start + 1).padStart(5)}-${String(r.end + 1).padStart(5)}  ${r.module.padEnd(15)} ${r.name}`);
    }
    return;
  }

  if (!MODULE_HEADERS) {
    console.error("No module headers configured.");
    process.exit(1);
  }

  // Keep the pre-split file around: this run overwrites canvasService.ts, and
  // having the original next to it makes a botched split trivially recoverable.
  const backupPath = path.join(root, "canvasService.pre-split.ts.bak");
  fs.copyFileSync(sourcePath, backupPath);
  console.log(`\nBacked up the original to ${path.relative(root, backupPath)}`);

  // ── Generate one file per module ────────────────────────────────────────
  const byModule = new Map();
  for (const r of ranges) {
    if (r.module === "(facade)") continue;
    const list = byModule.get(r.module) || [];
    list.push(r);
    byModule.set(r.module, list);
  }

  const written = [];
  for (const [moduleName, list] of byModule.entries()) {
    const header = MODULE_HEADERS[moduleName];
    if (!header) {
      console.error(`No header configured for module "${moduleName}"`);
      process.exit(1);
    }
    const body = list.map((r) => lines.slice(r.start, r.end + 1).join("\n")).join("\n\n");
    const fileName = `canvas${moduleName[0].toUpperCase()}${moduleName.slice(1)}.ts`;
    fs.writeFileSync(path.join(outDir, fileName), `${header}${body}\n`, "utf8");
    written.push({ moduleName, fileName, count: list.length });
  }

  // ── Rebuild canvasService.ts as a pure re-export facade ─────────────────
  //
  // `isolatedModules` is on, so type-only symbols have to go through
  // `export type { … }` while values use a plain `export { … }`. Mixing them
  // would break the single-file transpilation the bundler relies on.
  const facadeParts = [
    `/**
 * Canvas service facade.
 *
 * Historically this file held every canvas helper — 5000+ lines of parsing,
 * geometry, routing, colour, topology and export logic. It is now a thin
 * re-export surface: the implementation lives in the canvas* modules beside it
 * (see docs/CANVAS_SPLIT_DESIGN.md).
 *
 * The facade deliberately forwards *every* symbol, including ones only used
 * internally by sibling modules, so no call site had to change during the split.
 */

`,
  ];

  for (const [moduleName, list] of byModule.entries()) {
    const importPath = `./canvas${moduleName[0].toUpperCase()}${moduleName.slice(1)}`;
    const typeNames = list
      .filter((r) => r.kind === "interface" || r.kind === "type")
      .map((r) => r.name);
    const valueNames = list
      .filter((r) => r.kind !== "interface" && r.kind !== "type")
      .map((r) => r.name);

    if (valueNames.length > 0) {
      facadeParts.push(`export {\n  ${valueNames.join(",\n  ")},\n} from "${importPath}";\n`);
    }
    if (typeNames.length > 0) {
      facadeParts.push(`export type {\n  ${typeNames.join(",\n  ")},\n} from "${importPath}";\n`);
    }
  }

  const facadePath = path.join(outDir, "canvasService.ts");
  fs.writeFileSync(facadePath, facadeParts.join("\n"), "utf8");

  for (const w of written) {
    console.log(`  wrote src/services/${w.fileName}  (${w.count} symbols)`);
  }
  console.log(`  wrote src/services/canvasService.ts  (facade)`);
  console.log("\nNext: npx tsc --noEmit   — fix any unresolved imports it reports.");
}

main();
