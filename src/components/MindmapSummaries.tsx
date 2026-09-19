import type { Bounds } from "../core/mindmapBounds";
import { summaryBracketPath, summaryLabelAnchor } from "../core/mindmapGroups";

/**
 * The brackets over groups of topics, drawn above the outline.
 *
 * A bracket rather than a box, because a box around a group is a boundary —
 * a different feature, saying "these belong together" rather than "this is the
 * group being summarised" — and both may be on the same map.
 *
 * Given the group's bounds rather than the nodes, so it knows nothing about the
 * layout: where a bracket goes is a pure function of where its group ended up,
 * and a summary whose topics are not all on the canvas is simply not drawn.
 */
export interface SummaryBox {
  id: string;
  text: string;
  /** The union of the boxes it spans, or null when none of them is on screen. */
  bounds: Bounds | null;
}

/** Roughly the width of a label at this size, for placing its own outline. */
function labelWidth(text: string): number {
  return Math.max(48, text.length * 7 + 10);
}

export function MindmapSummaries({
  summaries,
  selectedId,
  onSelect,
  onStartEdit,
}: {
  summaries: SummaryBox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
}) {
  const drawn = summaries.filter((summary) => summary.bounds);
  if (drawn.length === 0) return null;

  return (
    <g className="mindmap-summaries">
      {drawn.map((summary) => {
        const bounds = summary.bounds as Bounds;
        const anchor = summaryLabelAnchor(bounds);
        const isSelected = summary.id === selectedId;

        return (
          <g
            key={summary.id}
            className={`mindmap-summary ${isSelected ? "is-selected" : ""}`}
            onMouseDown={(event) => {
              event.stopPropagation();
              onSelect(summary.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartEdit(summary.id);
            }}
          >
            {/* The label's own box, so there is something to click and to double
                click — a few words of text is a hard target on its own. */}
            <rect
              className="mindmap-summary-label-bg"
              x={anchor.x}
              y={anchor.y - 10}
              width={labelWidth(summary.text)}
              height={20}
              rx={4}
            />
            <text
              className="mindmap-summary-label"
              x={anchor.x + 5}
              y={anchor.y}
              dominantBaseline="central"
            >
              {summary.text || "（概要）"}
            </text>

            <path className="mindmap-summary-bracket" d={summaryBracketPath(bounds)} />

            {isSelected ? (
              <rect
                className="mindmap-summary-selection"
                x={bounds.minX + bounds.width + 8}
                y={bounds.minY - 4}
                width={labelWidth(summary.text) + 24}
                height={bounds.height + 8}
                rx={5}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
