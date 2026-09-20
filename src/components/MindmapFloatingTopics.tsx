import type { NodeMarkers } from "../services/mindmapSidecar";
import { NodeIcon, NodeLinkMark, NodeMarks, NodeNoteMark, NodeTags } from "./MindmapMarks";

/**
 * Topics that no outline owns, drawn beside it.
 *
 * Same shape as a branch node and measured by the same function, because they
 * are the same thing to look at — the difference is where they come from, and
 * that is not something a reader needs to see. They carry the same annotations
 * too, drawn by the same components: an icon, marks, tags, and the two badges,
 * all keyed by the topic's id in the companion file, which does not care whether
 * the id belongs to a topic in the document or one beside it.
 *
 * The box is a capsule whatever the theme says. A floating topic has no level,
 * no parent and no branch colour to inherit from, so the one shape that needs no
 * such context is the honest choice rather than a plausible-looking guess.
 */
export interface FloatingBox {
  id: string;
  text: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  /** What the topic carries beyond its text; drawn as it is on a branch node. */
  iconId: string;
  markers: NodeMarkers;
  hasNote: boolean;
  hasLink: boolean;
  tags: string[];
}

export function MindmapFloatingTopics({
  topics,
  selectedId,
  onSelect,
  onStartEdit,
  onStartDrag,
  onOpenMenu,
  onOpenLink,
}: {
  topics: FloatingBox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onStartDrag: (id: string, event: React.MouseEvent) => void;
  /** A right click: the topic's own panel, as a right click on a node opens one. */
  onOpenMenu: (id: string, event: React.MouseEvent) => void;
  /** Follows a free topic's link. Same value as on a node's badge, same reason. */
  onOpenLink?: (id: string) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <g className="mindmap-floating-group">
      {topics.map((topic) => {
        const isSelected = topic.id === selectedId;

        return (
          <g
            key={topic.id}
            className={`mindmap-floating-topic ${isSelected ? "is-selected" : ""}`}
            transform={`translate(${topic.x}, ${topic.y})`}
            // A drag is a gesture about the box under the cursor, and the canvas
            // behind it pans on the same button — so the topic takes the event and
            // keeps it.
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelect(topic.id);
              onStartDrag(topic.id, e);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit(topic.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenMenu(topic.id, e);
            }}
          >
            {isSelected ? (
              <rect
                className="mindmap-floating-selection"
                x={-3}
                y={-3}
                width={topic.width + 6}
                height={topic.height + 6}
                rx={topic.height / 2 + 3}
              />
            ) : null}
            <rect
              className="mindmap-floating-rect"
              width={topic.width}
              height={topic.height}
              rx={topic.height / 2}
            />
            {topic.lines.map((line, index) => (
              <text
                key={index}
                className="mindmap-floating-text"
                x={topic.width / 2}
                y={topic.height / 2 + (index - (topic.lines.length - 1) / 2) * 17}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {line}
              </text>
            ))}

            {/* The same decorations, in the same places, as a topic in the
                outline wears — a reader should not have to learn two vocabularies
                for "this one has a note". */}
            <NodeIcon iconId={topic.iconId} height={topic.height} />
            <NodeMarks width={topic.width} markers={topic.markers} />
            <NodeTags height={topic.height} tags={topic.tags} />
            {topic.hasLink ? (
              <NodeLinkMark
                height={topic.height}
                onOpen={onOpenLink ? () => onOpenLink(topic.id) : undefined}
              />
            ) : null}
            {topic.hasNote ? <NodeNoteMark /> : null}
          </g>
        );
      })}
    </g>
  );
}
