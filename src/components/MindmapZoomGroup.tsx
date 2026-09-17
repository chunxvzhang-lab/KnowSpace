import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

/**
 * The zoom controls: out, the readout, in, and fit.
 *
 * The readout is a button rather than a span. It looks like a value and behaves
 * like the fit-to-screen command, which is deliberate — the percentage is the
 * one number a reader who is lost will look at, so it is also the thing they
 * should be able to press to get back to a fitted view. Until this existed,
 * fit-to-screen ran once sixty milliseconds after mount and there was no way
 * back to it.
 *
 * Holds nothing: the scale comes from the caller, because the same value drives
 * the canvas transform. Keeping a copy here would be a second source of truth
 * for the one number that has to agree.
 */
export type MindmapZoomGroupProps = {
  /** The canvas scale, 1 being 100%. */
  scale: number;
  /** Multiplies the scale; the caller clamps and anchors the result. */
  onStep: (factor: number) => void;
  onFitToScreen: () => void;
};

export function MindmapZoomGroup({ scale, onStep, onFitToScreen }: MindmapZoomGroupProps) {
  return (
    <div className="mindmap-toolbar-btn-group mindmap-zoom-group">
      <button
        type="button"
        className="mindmap-tool-btn text-btn"
        onClick={() => onStep(0.87)}
        title="缩小 (Ctrl+-)"
      >
        <ZoomOut size={14} />
      </button>

      <button
        type="button"
        className="mindmap-zoom-value"
        onClick={onFitToScreen}
        title="适应画布 (Ctrl+0)"
      >
        {Math.round(scale * 100)}%
      </button>

      <button
        type="button"
        className="mindmap-tool-btn text-btn"
        onClick={() => onStep(1.15)}
        title="放大 (Ctrl+=)"
      >
        <ZoomIn size={14} />
      </button>

      <button
        type="button"
        className="mindmap-tool-btn text-btn"
        onClick={onFitToScreen}
        title="适应画布 (Ctrl+0)"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
