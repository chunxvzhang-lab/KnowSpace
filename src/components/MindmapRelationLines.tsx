import {
  arrowEnds,
  arrowHeadPath,
  findRelationArrow,
  findRelationStyle,
  relationGeometry,
  type MindmapRelation,
  type RelationBox,
} from "../core/mindmapRelations";
import { findMarkColor } from "../core/mindmapPalette";

/**
 * The lines between topics, drawn underneath them.
 *
 * Underneath on purpose: a line crossing over a label costs both of them their
 * legibility, and the outline's own connectors are drawn at the same level as the
 * nodes they join.
 *
 * Given boxes rather than nodes, so it knows nothing about the layout engine or
 * the tree — which is what keeps the line's geometry in one pure function that
 * can be tested without a canvas.
 *
 * A relation whose topic is not in the boxes is not drawn. That covers more cases
 * than it sounds: a folded branch keeps its children off the canvas, and a
 * document whose heading was renamed has an id the file still mentions. Neither
 * is a reason to draw a line to nowhere, and neither costs the stored relation
 * anything — it comes back when its topic does.
 *
 * The line's own colour and dash are written onto the elements when the reader
 * chose them, and left to the stylesheet when they did not: choosing nothing means
 * following the theme, and an explicit choice has to survive an export, which is
 * built by cloning the canvas rather than by redrawing it.
 */
export function MindmapRelationLines({
  relations,
  boxes,
  selectedKey,
  onSelect,
  onStartLabelEdit,
  onOpenMenu,
}: {
  relations: MindmapRelation[];
  /** Where each topic is, by id. */
  boxes: Map<string, RelationBox>;
  /** The line the reader has picked, as `from\u0000to`. */
  selectedKey: string | null;
  onSelect: (relation: MindmapRelation) => void;
  onStartLabelEdit: (relation: MindmapRelation) => void;
  /** A right click: the canvas menu, with this line as its subject. */
  onOpenMenu: (relation: MindmapRelation, event: React.MouseEvent) => void;
}) {
  if (relations.length === 0) return null;

  return (
    <g className="mindmap-relations">
      {relations.map((relation) => {
        const from = boxes.get(relation.fromId);
        const to = boxes.get(relation.toId);
        if (!from || !to) return null;

        const key = `${relation.fromId}\u0000${relation.toId}`;
        const geometry = relationGeometry(from, to);
        const style = findRelationStyle(relation.style);
        const arrow = arrowEnds(relation.arrow);
        const color = relation.color ? findMarkColor(relation.color).color : undefined;
        const arrowLabel = findRelationArrow(relation.arrow).id;

        return (
          <g
            key={key}
            className={`mindmap-relation ${key === selectedKey ? "is-selected" : ""}`}
            data-relation-arrow={arrowLabel}
          >
            <path
              className="mindmap-relation-line"
              d={geometry.path}
              // Always, including the default: an export has no stylesheet, so a
              // dash left to CSS would arrive as a solid line. The colour is the
              // opposite — left off unless chosen, so the line follows the theme.
              strokeDasharray={style.dash}
              stroke={color}
            />

            {/* A wide invisible line to click and to double click. A one-pixel
                target is not something anyone hits on purpose, and the pointer is
                the only way to reach a line. */}
            <path
              className="mindmap-relation-hit"
              d={geometry.path}
              onMouseDown={(event) => {
                event.stopPropagation();
                onSelect(relation);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onStartLabelEdit(relation);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenMenu(relation, event);
              }}
            >
              <title>{relation.label ? `关系：${relation.label}` : "关系（双击写字）"}</title>
            </path>

            {arrow.atStart ? (
              <path
                className="mindmap-relation-arrow"
                d={arrowHeadPath(geometry.start, geometry.startAngle)}
                fill={color}
              />
            ) : null}
            {arrow.atEnd ? (
              <path
                className="mindmap-relation-arrow"
                d={arrowHeadPath(geometry.end, geometry.endAngle)}
                fill={color}
              />
            ) : null}

            {relation.label ? (
              <g
                className="mindmap-relation-label-group"
                transform={`translate(${geometry.apex.x}, ${geometry.apex.y})`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onSelect(relation);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onStartLabelEdit(relation);
                }}
              >
                {/* The background is what makes the label readable where it
                    crosses the line it belongs to. */}
                <rect
                  className="mindmap-relation-label-bg"
                  x={-relation.label.length * 3.6 - 5}
                  y={-8}
                  width={relation.label.length * 7.2 + 10}
                  height={16}
                  rx={8}
                />
                <text
                  className="mindmap-relation-label"
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                >
                  {relation.label}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
