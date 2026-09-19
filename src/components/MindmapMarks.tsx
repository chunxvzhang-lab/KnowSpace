import { findPriorityMark, findProgressMark, progressSlicePath } from "../core/mindmapMarkers";
import type { NodeMarkers } from "../services/mindmapSidecar";

/**
 * How a priority and a progress are drawn, in both places they appear.
 *
 * The picker in the style panel and the marks on the node are the same two
 * drawings at two sizes, and they live together so they cannot drift into
 * meaning different things: a reader who picks a half-filled dial has to find
 * the same half-filled dial on the map.
 *
 * Everything here draws as SVG and works in either context — inside the map's
 * own `<svg>`, and inside a button in the panel, where a nested `<svg>` is just
 * an element like any other.
 */

/** A progress dial: a track, and the filled part of eighths. */
export function ProgressGlyph({ value, size = 14 }: { value: number; size?: number }) {
  const radius = size / 2 - 1.5;
  const centre = size / 2;

  return (
    <svg className="mindmap-progress-glyph" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle className="mindmap-progress-track" cx={centre} cy={centre} r={radius} />
      {value > 0 ? (
        <path className="mindmap-progress-fill" d={progressSlicePath(value, radius, centre, centre)} />
      ) : null}
    </svg>
  );
}

/**
 * The marks a node wears: its progress dial and its priority badge, at the
 * node's top-right corner.
 *
 * Above the top edge rather than inside the box, for the same reason the icon is
 * outside it: a node's size is the layout's business, and a mark that grew the
 * box would move every node in the map. The corner is free — the collapse toggle
 * sits at the middle of the right edge, and connectors leave from there too.
 *
 * `width` is the node's own, so the marks land on its corner without the caller
 * having to place them; nothing is drawn at all when neither mark is set.
 */
export function NodeMarks({ width, markers }: { width: number; markers: NodeMarkers }) {
  const priorityMark = findPriorityMark(markers.priority);
  const progressMark = findProgressMark(markers.progress);

  if (!priorityMark && !progressMark) return null;

  return (
    <g className="mindmap-node-marks" transform={`translate(${width}, -1)`}>
      {progressMark ? (
        <g className="mindmap-node-progress" transform="translate(-23, -6.5)">
          <circle className="mindmap-progress-track" cx={6.5} cy={6.5} r={5.5} />
          <path
            className="mindmap-progress-fill"
            d={progressSlicePath(progressMark.value, 5.5, 6.5, 6.5)}
          />
        </g>
      ) : null}
      {priorityMark ? (
        <>
          <rect
            className="mindmap-priority-badge"
            x={-14}
            y={-14}
            width={13}
            height={13}
            rx={3}
            fill={priorityMark.color}
          />
          <text
            className="mindmap-priority-text"
            x={-7.5}
            y={-7.5}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {priorityMark.label}
          </text>
        </>
      ) : null}
    </g>
  );
}
