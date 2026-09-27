/*
 * The graph logic is not here. Cycle detection, the memoised loop-edge scan,
 * loop-edge colours/selection and the layout-sync routines live in
 * `./canvasGraphLoops` — see the header there for why the sync routines share
 * the module with the scan they consume. The Presentation Mode sequencer lives
 * in `./canvasGraphSequence` and the Canvas-to-Article extractor in
 * `./canvasGraphExtract`.
 *
 * This file is the single import surface for the canvas graph services:
 * everything is re-exported here so importers keep one entry point. Extracted
 * from canvasService during the R2 split — see the R2 canvas split.
 */

export {
  getLoopEdgeIds,
  getLoopEdgeIdsCached,
  getLoopEdgeColors,
  expandLoopEdgeSelection,
  syncGridEdges,
  syncRingEdges,
  syncLoopEdgeGeometry,
} from "./canvasGraphLoops";

export { buildPresentationSequence } from "./canvasGraphSequence";

export { extractCanvasToMarkdown } from "./canvasGraphExtract";
