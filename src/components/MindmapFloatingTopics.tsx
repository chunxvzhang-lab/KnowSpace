/**
 * Topics that no outline owns, drawn beside it.
 *
 * Same shape as a branch node and measured by the same function, because they
 * are the same thing to look at — the difference is where they come from, and
 * that is not something a reader needs to see. What they do not carry is the
 * annotations: an icon or a note belongs to a topic in the document, and a
 * floating topic's own annotations have no panel to edit them in yet.
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
}

export function MindmapFloatingTopics({
  topics,
  selectedId,
  onSelect,
  onStartEdit,
  onStartDrag,
}: {
  topics: FloatingBox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onStartDrag: (id: string, event: React.MouseEvent) => void;
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
          </g>
        );
      })}
    </g>
  );
}
