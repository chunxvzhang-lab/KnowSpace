/**
 * Canvas service facade.
 *
 * Historically this file held every canvas helper — 5000+ lines of parsing,
 * geometry, routing, colour, topology and export logic. It is now a thin
 * re-export surface: the implementation lives in the canvas* modules beside it
 * (R2 canvas split).
 *
 * The facade forwards every symbol that this module exported before the split,
 * so no call site changed. Private helpers that were never exported — path
 * intersection probes, the SVG sanitising internals, the topology fingerprint —
 * stay private to their module. `getLoopEdgeIdsCached` is the one deliberate
 * exception: it was already shared with the colour code and is now a proper
 * export of the graph module.
 */

export {
  CANVAS_COLOR_PALETTES,
  CANVAS_STANDARD_COLOR_IDS,
  CANVAS_RELATION_PRESETS,
  getMediaFileType,
  isMediaFile,
  isImageFile,
  resolveMediaSrc,
  isNodeInsideGroup,
  getNodesInsideGroup,
  findContainerForNode,
  toggleChecklistInMarkdown,
} from "./canvasPrimitives";

export {
  parseCanvasData,
  serializeCanvasData,
  createDefaultCanvas,
} from "./canvasSerialization";

export {
  computeBoundingBox,
  getNodeAnchorPoint,
  computeBezierControlPoints,
  getStepBendHandleInfo,
  getOptimalAnchorSides,
  projectPointOntoRing,
  computeMinRingRadius,
  isPointInsideNodeHull,
  computeRingSpacingLayout,
  resizeRingSpacing,
  alignNodesInCircle,
  alignNodesInGrid,
  computeGridLayout,
  resizeGridSpacing,
  computeRingLayout,
  alignNodes,
} from "./canvasGeometry";

export type {
  StepBendHandleInfo,
  CanvasAlignDirection,
  CircleAlignOptions,
  RingSpacingLayout,
  GridAlignOptions,
  GridLayoutInfo,
} from "./canvasGeometry";

export {
  collectCollidingEnvelope,
  horizontalSegmentIntersectsBox,
  verticalSegmentIntersectsBox,
  pathIntersectsBox,
  computeEdgePath,
  computeEdgeMidpoint,
} from "./canvasRouting";

export type { AABBBox } from "./canvasRouting";

export {
  buildPresentationSequence,
  extractCanvasToMarkdown,
  getLoopEdgeIds,
  getLoopEdgeIdsCached,
  getLoopEdgeColors,
  expandLoopEdgeSelection,
  syncGridEdges,
  syncRingEdges,
  syncLoopEdgeGeometry,
} from "./canvasGraph";

export {
  normalizeHexColor,
  isColorSimilar,
  isColorSimilarToAny,
  getLoopComponentInfo,
  getSourceNodeEdgeColor,
  getNextEdgeColorForSource,
  getEffectiveEdgeColorKey,
  computeSourceDisplayColorMap,
} from "./canvasColor";

export {
  createEdgeBetweenNodes,
  spawnConnectedCard,
  connectOneToMany,
  connectChainNodes,
  connectLoopNodes,
  disconnectNodeEdges,
  spawnMultipleBranches,
  cycleEdgeArrow,
  cycleEdgeStyle,
  cycleEdgeStrokePattern,
  reverseEdgeDirection,
} from "./canvasEdges";

export {
  exportCanvasToSvg,
  resolveExportScale,
  sanitizeSvgResources,
  valueBooleanAttributes,
  exportCanvasToPngBlob,
  exportCanvasToPng,
  downloadCanvasAsImage,
  copyCanvasImageToClipboard,
} from "./canvasExport";

export type {
  CanvasExportOptions,
  CanvasDownloadResult,
} from "./canvasExport";
