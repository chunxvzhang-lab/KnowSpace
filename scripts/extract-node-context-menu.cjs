/**
 * Extracts the card/group branch of the canvas context menu into its own
 * component. Sibling of extract-edge-context-menu.cjs, same approach.
 *
 * The branch closes over 36 outer identifiers. The generated component
 * destructures them from props *under the same names*, so the extracted body
 * is byte-identical to what it replaced.
 *
 * Usage: node scripts/extract-node-context-menu.cjs --write
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "components", "CanvasView.tsx");
const outPath = path.join(root, "src", "components", "canvas", "NodeContextMenu.tsx");

/** Lines 1-based, inclusive: the `(() => { … })()` body of the node branch. */
const RANGE = [5877, 6562];

const HEADER = `import { memo } from "react";
import type { CanvasNode } from "../../types/canvasTypes";
import type { getCanvasThemeColors } from "../../services/canvasTheme";
import { CANVAS_COLOR_PALETTES } from "../../services/canvasService";

type CanvasThemeColors = ReturnType<typeof getCanvasThemeColors>;

/**
 * Right-click menu for a card or a group container.
 *
 * Extracted from CanvasView (R2 batch B4).
 *
 * Renders three variants: group-specific actions, a batch panel when several
 * cards are selected, and a single-card panel otherwise. Nothing is mutated in
 * here — colours, grouping, z-order, connections and deletion all report back
 * to the parent, which is what keeps history and the gesture machinery in one
 * place.
 *
 * The props are deliberately named after the identifiers the markup used before
 * extraction, so the body needed no rewriting.
 */
type NodeContextMenuProps = {
  data: { nodes: CanvasNode[]; edges: unknown[] };
  /** The context-menu state; \\\`targetNodeId\\\` identifies the clicked card. */
  contextMenu: { targetNodeId?: string };
  selectedNodeIds: Set<string>;
  /** Edges whose both endpoints are selected — the batch delete action uses it. */
  connectedInternalEdges: unknown[];
  /** Custom colour currently committed for the batch, if any. */
  batchCustomColor: string;
  colors: CanvasThemeColors;

  setContextMenu: (value: null) => void;
  setSpawnModalState: (
    value: { nodeId: string; count: number; direction: "right" | "bottom" } | null
  ) => void;

  handleAlignSelected: (direction: string) => void;
  handleSpawnConnectedChild: (nodeId: string) => void;
  handleDisconnectSelectedNodesEdges: () => void;
  handleDisconnectNodeEdges: (nodeId: string) => void;
  handleCopyNodeText: (nodeId: string) => void;
  handleCopyNodeWikilink: (nodeId: string) => void;
  handleExtractCardToNote: (nodeId: string) => void;
  handleSelectGroupNodes: (groupId: string) => void;
  handleFitGroupSize: (groupId: string) => void;
  handleDissolveGroup: (groupId: string) => void;
  handleDeleteGroupWithContents: (groupId: string) => void;
  handleGroupSelectedNodes: () => void;
  handleResetNodeSize: (nodeId: string) => void;
  handleNodeColorChange: (nodeId: string, color: string) => void;
  handleBatchColorChange: (color: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteSelected: () => void;
  handleDuplicateNode: (nodeId: string) => void;
  handleDuplicateSelected: () => void;
  handleBringToFront: (nodeId: string) => void;
  handleSendToBack: (nodeId: string) => void;
  handleConnectSelectedNodes: () => void;
  handleConnectOneToMany: () => void;
  handleConnectLoopNodes: () => void;

  /**
   * Live colour preview while the native chooser is dragged; the parent owns
   * the snapshot and the debounce timer so a drag writes one history entry.
   */
  previewNodeColor: (nodeId: string, color: string) => void;
  previewBatchNodeColor: (color: string) => void;
  debounceCommitColorPick: () => void;
};

export const NodeContextMenu = memo(function NodeContextMenu({
  data,
  contextMenu,
  selectedNodeIds,
  connectedInternalEdges,
  batchCustomColor,
  colors,
  setContextMenu,
  setSpawnModalState,
  handleAlignSelected,
  handleSpawnConnectedChild,
  handleDisconnectSelectedNodesEdges,
  handleDisconnectNodeEdges,
  handleCopyNodeText,
  handleCopyNodeWikilink,
  handleExtractCardToNote,
  handleSelectGroupNodes,
  handleFitGroupSize,
  handleDissolveGroup,
  handleDeleteGroupWithContents,
  handleGroupSelectedNodes,
  handleResetNodeSize,
  handleNodeColorChange,
  handleBatchColorChange,
  handleDeleteNode,
  handleDeleteSelected,
  handleDuplicateNode,
  handleDuplicateSelected,
  handleBringToFront,
  handleSendToBack,
  handleConnectSelectedNodes,
  handleConnectOneToMany,
  handleConnectLoopNodes,
  previewNodeColor,
  previewBatchNodeColor,
  debounceCommitColorPick,
}: NodeContextMenuProps) {
  return (
    <>
      {/* The extracted body is already an IIFE, so it only needs a JSX
          expression wrapper here. Wrapping it in a second one renders nothing
          while still type-checking — the canvas-view tests catch that, tsc does
          not. */}
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
    console.error("\nRange does not look like the node branch. Aborting.");
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
