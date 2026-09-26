/**
 * Extracts the edge branch of the canvas context menu into its own component.
 *
 * The branch closes over 26 outer identifiers. Rather than rewriting the 580
 * lines to thread those through, the generated component destructures them from
 * props *under the same names* — so the extracted body is byte-identical to
 * what it replaced and cannot drift.
 *
 * Usage: node scripts/extract-edge-context-menu.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "components", "CanvasView.tsx");
const outPath = path.join(root, "src", "components", "canvas", "EdgeContextMenu.tsx");

/** Lines 1-based, inclusive: the `(() => { … })()` body of the edge branch. */
const RANGE = [5918, 6499];

const HEADER = `import { memo } from "react";
import type { CanvasEdge, CanvasEdgeLabelShape, CanvasNode } from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import {
  CANVAS_COLOR_PALETTES,
  CANVAS_RELATION_PRESETS,
} from "../../services/canvasService";
import { renderEdgeShapeIcon } from "./canvasEdgeIcons";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * Right-click menu for one or more selected connectors.
 *
 * Extracted from CanvasView (R2 batch B3).
 *
 * This is the largest branch of the context menu. It renders two variants: a
 * batch panel when several edges are selected, and a single-edge panel
 * otherwise. Everything is read-only here — selecting colours, styles, arrow
 * modes and label shapes all report back to the parent through callbacks, which
 * is what keeps the history and gesture machinery in one place.
 *
 * The props are deliberately named after the identifiers the markup used before
 * extraction, so the body needed no rewriting.
 */
type EdgeContextMenuProps = {
  data: { nodes: CanvasNode[]; edges: CanvasEdge[] };
  nodeMap: Map<string, CanvasNode>;
  /** The context-menu state; \\\`targetEdgeId\\\` identifies the clicked edge. */
  contextMenu: { targetEdgeId?: string };
  selectedEdgeIds: Set<string>;
  /** Custom colour currently committed for the batch, if any. */
  batchEdgeCustomColor: string;
  colors: CanvasThemeColors;
  isDark: boolean;

  setContextMenu: (value: null) => void;

  handleToggleEdgeStyle: (edgeId: string) => void;
  handleToggleEdgeArrow: (edgeId: string) => void;
  handleToggleEdgeStrokePattern: (edgeId: string) => void;
  handleReverseEdge: (edgeId: string) => void;
  handleEdgeColorChange: (edgeId: string, color: string) => void;
  handleEdgeLabelChange: (edgeId: string, label: string) => void;
  handleEdgeLabelShapeChange: (edgeId: string, shape: CanvasEdgeLabelShape) => void;
  handleSetEdgeAnchorSide: (edgeId: string, side: string) => void;
  handleDeleteEdge: (edgeId: string) => void;

  handleBatchSetEdgeStyle: (style: "bezier" | "step" | "straight") => void;
  handleBatchCycleStrokePattern: () => void;
  handleBatchToggleArrow: () => void;
  handleBatchSetEdgeColor: (colorKey: string) => void;
  handleBatchDeleteEdges: () => void;
  handleBatchReverseEdges: () => void;
};

export const EdgeContextMenu = memo(function EdgeContextMenu({
  data,
  nodeMap,
  contextMenu,
  selectedEdgeIds,
  batchEdgeCustomColor,
  colors,
  isDark,
  setContextMenu,
  handleToggleEdgeStyle,
  handleToggleEdgeArrow,
  handleToggleEdgeStrokePattern,
  handleReverseEdge,
  handleEdgeColorChange,
  handleEdgeLabelChange,
  handleEdgeLabelShapeChange,
  handleSetEdgeAnchorSide,
  handleDeleteEdge,
  handleBatchSetEdgeStyle,
  handleBatchCycleStrokePattern,
  handleBatchToggleArrow,
  handleBatchSetEdgeColor,
  handleBatchDeleteEdges,
  handleBatchReverseEdges,
}: EdgeContextMenuProps) {
  return (
    <>
      {(() => {
`;

const FOOTER = `      })()}
    </>
  );
});
`;

function main() {
  const write = process.argv.includes("--write");
  const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
  const [start, end] = RANGE;

  const first = lines[start - 1].trim();
  const last = lines[end - 1].trim();

  console.log(`Range ${start}-${end} (${end - start + 1} lines)`);
  console.log(`  first: ${first.slice(0, 70)}`);
  console.log(`  last : ${last.slice(0, 70)}`);

  if (!first.startsWith("(() => {") || last !== "})()") {
    console.error("\nRange does not look like the edge branch. Aborting.");
    process.exit(1);
  }

  if (!write) {
    console.log("\n(dry run — pass --write to generate)");
    return;
  }

  const body = lines.slice(start - 1, end).join("\n");
  const content = `${HEADER}${body}\n${FOOTER}`;
  fs.writeFileSync(outPath, content, "utf8");

  console.log(`\nWrote ${path.relative(root, outPath)}`);
  console.log(`  ${content.split(/\r?\n/).length} lines`);
}

main();
