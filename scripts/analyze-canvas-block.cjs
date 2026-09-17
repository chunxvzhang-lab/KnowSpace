/**
 * Reports which outer-scope identifiers a JSX block in CanvasView.tsx uses.
 *
 * Extracting a 580-line context-menu branch means turning every outer variable
 * it closes over into a prop. Listing them mechanically is far more reliable
 * than reading the block and hoping nothing was missed.
 *
 * Usage: node scripts/analyze-canvas-block.cjs <startLine> <endLine>
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "components", "CanvasView.tsx");

/** Candidate names: component state, refs, handlers and imported helpers. */
const CANDIDATES = [
  // state
  "data", "viewport", "selectedNodeIds", "selectedEdgeIds", "hoveredNodeId",
  "editingNodeId", "editingText", "editingEdgeId", "editingEdgeLabel",
  "isPresentationMode", "currentSlideIndex", "isAutoPlaying", "showSlideDrawer",
  "isBoxSelectMode", "selectionBox", "showAlignMenu", "ringRadiusDraft",
  "contextMenu", "showFilePicker", "showExtractModal", "extractedMarkdown",
  "copiedNotification", "searchKeyword", "showExportModal", "exportFormat",
  "exportBg", "isExporting", "exportCopyFeedback", "spawnModalState",
  "toastMessage", "connectingState", "lightboxMedia", "isNarrow", "history",
  // refs
  "containerRef", "contextMenuRef", "latestDataRef", "viewportRef",
  "colorCommitTimerRef", "colorPickStartRef", "ringSliderSnapshotRef",
  // derived
  "colors", "isDark", "isEink", "nodeMap", "canvasObstacles",
  "nodeOutgoingMap", "currentMultiRootNode", "currentMultiRootTitle",
  "sourceDisplayColorMap", "presentationSequence", "minimapBBox",
  "minimapScale", "minimapOffsetX", "minimapOffsetY", "connectedInternalEdges",
  "batchCustomColor", "batchEdgeCustomColor", "selectedRingInfo",
  // callbacks / handlers
  "emitChange", "pushHistory", "showToast", "setData", "setViewport",
  "setSelectedNodeIds", "setSelectedEdgeIds", "setContextMenu",
  "setEditingEdgeId", "setEditingEdgeLabel", "setShowFilePicker",
  "setShowExtractModal", "setShowExportModal", "setSpawnModalState",
  "setLightboxMedia", "setConnectingState", "setToastMessage",
  "handleAlignSelected", "handleAlignToGrid", "handleSetEdgeStyle",
  "handleToggleEdgeStyle", "handleToggleEdgeArrow", "handleToggleEdgeStrokePattern",
  "handleReverseEdge", "handleEdgeColorChange", "handleEdgeLabelChange",
  "handleEdgeLabelShapeChange", "handleSetEdgeAnchorSide", "handleCycleEdgeAnchor",
  "handleResetEdgeStepOffset", "handleSpawnConnectedChild", "handleDeleteEdge",
  "handleDisconnectSelectedNodesEdges", "handleDisconnectNodeEdges",
  "handleBatchSetEdgeStyle", "handleBatchSetEdgeStrokePattern",
  "handleBatchCycleStrokePattern", "handleBatchToggleArrow",
  "handleBatchSetEdgeColor", "handleBatchDeleteEdges", "handleBatchReverseEdges",
  "handleCopyNodeText", "handleCopyNodeWikilink", "handleExtractCardToNote",
  "handleSelectGroupNodes", "handleFitGroupSize", "handleDissolveGroup",
  "handleDeleteGroupWithContents", "handleGroupSelectedNodes",
  "handleResetNodeSize", "handleNodeColorChange", "handleBatchColorChange",
  "handleCopyExtracted", "handleSaveAsNote", "handleDownloadExport",
  "handleCopyExport", "handleConfirmBatchSpawn", "handleSpawnMultipleBranches",
  "handleOpenExtractModal", "handleDeleteNode", "handleDeleteSelected",
  "handleDuplicateNode", "handleDuplicateSelected", "handleBringToFront",
  "handleSendToBack", "handleAddTextCard", "handleAddFileCard", "handleAddGroup",
  "handleConnectSelectedNodes", "handleConnectOneToMany", "handleConnectLoopNodes",
  "handleSaveNodeEdit", "handleSave", "handleUndo", "handleRedo",
  "handlePasteClipboardAsCard", "handleTriggerInsertMedia", "handleTriggerInsertImage",
  "handleTriggerInsertVideo", "handleTriggerInsertAudio", "handleSelectAll",
  "handleSelectAllEdges", "handleFitGroup", "handleMinimapNavigate",
  "handleSaveEdgeLabel", "handleStartBoxSelection", "handleOpenMediaPreview",
  // imported helpers
  "CANVAS_COLOR_PALETTES", "CANVAS_STANDARD_COLOR_IDS", "CANVAS_RELATION_PRESETS",
  "normalizeHexColor", "isColorSimilar", "getEdgeRing", "computeBoundingBox",
  "getNodeAnchorPoint", "computeEdgePath", "computeEdgeMidpoint",
  "getOptimalAnchorSides", "getStepBendHandleInfo", "getSourceNodeEdgeColor",
  "getEffectiveEdgeColorKey", "getLoopEdgeColors", "expandLoopEdgeSelection",
  "isNodeInsideGroup", "findContainerForNode", "getMediaFileType", "resolveMediaSrc",
  "createEdgeBetweenNodes", "spawnConnectedCard", "spawnMultipleBranches",
  "cycleEdgeArrow", "cycleEdgeStyle", "cycleEdgeStrokePattern", "reverseEdgeDirection",
  "alignNodes", "alignNodesInCircle", "alignNodesInGrid", "computeGridLayout",
  "computeRingLayout", "syncLoopEdgeGeometry", "disconnectNodeEdges",
  "toggleChecklistInMarkdown", "extractCanvasToMarkdown", "isPointInsideNodeHull",
  "projectPointOntoRing", "renderCardMarkdown", "MediaLightbox",
  // module-level helpers in this file
  "hexToRgbString", "renderEdgeShapeIcon", "getNodePalette", "toolBtnStyle",
  "modalOverlayStyle", "modalContentStyle", "isEdgeInViewport", "isNodeInViewport",
];

function main() {
  const start = Number(process.argv[2]);
  const end = Number(process.argv[3]);
  if (!start || !end) {
    console.error("Usage: node scripts/analyze-canvas-block.cjs <startLine> <endLine>");
    process.exit(1);
  }

  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
  const body = lines.slice(start - 1, end).join("\n");

  const used = [];
  const unused = [];
  for (const name of CANDIDATES) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    (re.test(body) ? used : unused).push(name);
  }

  console.log(`Block ${start}-${end}: ${end - start + 1} lines\n`);
  console.log(`USED OUTER IDENTIFIERS (${used.length}):`);
  for (const name of used) console.log(`  ${name}`);
  console.log(`\nNOT REFERENCED (${unused.length}) — these need no prop.`);
}

main();
