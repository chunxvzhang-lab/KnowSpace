import type { Bounds } from "../core/mindmapBounds";
import { boundaryRect, boundaryTitleAnchor } from "../core/mindmapGroups";
import { findMarkColor } from "../core/mindmapPalette";

/**
 * The boxes drawn around groups of topics, underneath the outline.
 *
 * Underneath because a box is a background: it is about a group, and the topics
 * in it are what the reader is looking at.
 *
 * The box does not take clicks, only the title does. A boundary can cover a large
 * part of the canvas, and a box that swallowed clicks would make the space inside
 * it — which is mostly empty, by design — useless for panning and for opening the
 * canvas menu.
 *
 * Its colour is written onto the elements rather than left to the stylesheet, so
 * it survives being exported: the file is built by cloning the canvas, and what
 * is on the elements goes with them. It is also the right layer for it — a
 * boundary's colour is the reader's choice, not the theme's.
 */
export interface BoundaryBox {
  id: string;
  text: string;
  /** A colour id from the map's table; unknown or absent means the default. */
  colorId?: string;
  /** The union of the boxes it encloses, or null when none of them is on screen. */
  bounds: Bounds | null;
}

export function MindmapBoundaries({
  boundaries,
  selectedId,
  onSelect,
  onStartEdit,
}: {
  boundaries: BoundaryBox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
}) {
  const drawn = boundaries.filter((boundary) => boundary.bounds);
  if (drawn.length === 0) return null;

  return (
    <g className="mindmap-boundaries">
      {drawn.map((boundary) => {
        const bounds = boundary.bounds as Bounds;
        const rect = boundaryRect(bounds);
        const title = boundaryTitleAnchor(bounds);
        const color = findMarkColor(boundary.colorId);
        const isSelected = boundary.id === selectedId;

        return (
          <g
            key={boundary.id}
            className={`mindmap-boundary ${isSelected ? "is-selected" : ""}`}
            onMouseDown={(event) => {
              event.stopPropagation();
              onSelect(boundary.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartEdit(boundary.id);
            }}
          >
            <rect
              className="mindmap-boundary-box"
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={rect.rx}
              fill={color.color}
              fillOpacity={0.08}
              stroke={color.color}
              strokeOpacity={0.55}
              strokeWidth={1.4}
            />

            <text className="mindmap-boundary-title" x={title.x} y={title.y} fill={color.color}>
              {boundary.text || "（边界）"}
            </text>

            {isSelected ? (
              <rect
                className="mindmap-boundary-selection"
                x={rect.x - 4}
                y={rect.y - 4}
                width={rect.width + 8}
                height={rect.height + 8}
                rx={rect.rx + 3}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
