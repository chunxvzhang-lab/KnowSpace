import { findPriorityMark, findProgressMark, progressSlicePath } from "../core/mindmapMarkers";
import { findMindmapIcon } from "../core/mindmapIcons";
import type { NodeMarkers } from "../services/mindmapSidecar";

/** At most this many tags on a node's chip row. */
const MAX_CHIPS = 3;
const CHIP_HEIGHT = 13;
const CHIP_GAP = 3;
/** Roughly one character's width at the chip's font size. */
const CHIP_CHAR_WIDTH = 5.6;
/** A chip wider than this would be a paragraph, not a tag. */
const MAX_TAG_CHARS = 18;

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

/**
 * The tags a node carries, as chips under its box.
 *
 * Below the box for the reason everything else here is outside it: the box's
 * size belongs to the layout engine. Three chips and a count, because a map is
 * not a tag cloud — a node wearing twenty of them is a wall of text with a node
 * somewhere inside it.
 *
 * The chip's text is shortened for the drawing and nothing else: the tag in the
 * file is the reader's own spelling, and the panel shows it in full. Widths are
 * estimated from the character count rather than measured, because measuring
 * would mean laying out text twice per frame for a row of chips.
 */
export function NodeTags({ height, tags }: { height: number; tags: string[] }) {
  if (tags.length === 0) return null;

  const chips: { key: string; text: string; x: number; width: number }[] = [];
  let x = 0;

  for (const tag of tags.slice(0, MAX_CHIPS)) {
    const label = tag.length > MAX_TAG_CHARS ? `${tag.slice(0, MAX_TAG_CHARS - 1)}…` : tag;
    const text = `#${label}`;
    const width = text.length * CHIP_CHAR_WIDTH + 8;
    chips.push({ key: tag, text, x, width });
    x += width + CHIP_GAP;
  }

  const hidden = tags.length - chips.length;
  if (hidden > 0) {
    const text = `+${hidden}`;
    const width = text.length * CHIP_CHAR_WIDTH + 8;
    chips.push({ key: "more", text, x, width });
  }

  return (
    <g className="mindmap-node-tags" transform={`translate(0, ${height + 3})`}>
      {chips.map((chip) => (
        <g key={chip.key} transform={`translate(${chip.x}, 0)`}>
          <rect
            className={`mindmap-tag-chip ${chip.key === "more" ? "is-more" : ""}`}
            width={chip.width}
            height={CHIP_HEIGHT}
            rx={CHIP_HEIGHT / 2}
          />
          <text
            className="mindmap-tag-chip-text"
            x={chip.width / 2}
            y={CHIP_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {chip.text}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * The badge for a node that carries a note.
 *
 * At the top-left, with the link's at the bottom-left: both say "there is more
 * here than the text", and opposite corners mean a topic can wear both without
 * either hiding the other. A mark rather than a control — notes are read and
 * written in the panel.
 */
export function NodeNoteMark() {
  return (
    <g className="mindmap-note-marker" transform="translate(-4, -4)" aria-label="有备注">
      <circle r="4.6" />
      {/* Two lines of writing, shortened to the two strokes that read as text. */}
      <path d="M -2 -0.8 H 2 M -2 1.4 H 0.4" />
    </g>
  );
}

/**
 * The icon a topic wears, on its leading edge and outside its box.
 *
 * Outside on purpose: a topic's size belongs to the layout, and growing the box
 * to fit a drawing would move every topic in the map — the golden layout
 * snapshots exist to stop exactly that kind of drift. An id this build does not
 * know draws nothing rather than breaking the map.
 *
 * Here rather than in the view because it is worn by both a topic in the outline
 * and one floating beside it, and the two have to wear it the same way.
 */
export function NodeIcon({ iconId, height }: { iconId: string; height: number }) {
  const icon = findMindmapIcon(iconId);
  if (!icon) return null;
  const Icon = icon.Icon;
  return (
    <Icon
      className="mindmap-node-icon"
      size={16}
      x={-22}
      y={(height - 16) / 2}
      strokeWidth={1.8}
    />
  );
}

/**
 * The badge for a node that carries a link.
 *
 * At the bottom-left corner, mirroring the note badge at the top-left: both are
 * "there is more here than the text", and putting them on opposite corners means
 * a node can wear both without either hiding the other. A mark rather than a
 * control — following the link is done from the panel, which is where the reader
 * can also see where it goes before going there.
 */
export function NodeLinkMark({ height }: { height: number }) {
  return (
    <g className="mindmap-link-marker" transform={`translate(-4, ${height + 4})`} aria-label="有链接">
      <circle r="4.6" />
      {/* An arrow pointing out: the one glyph that means "this goes elsewhere". */}
      <path d="M -1.7 1.7 L 1.5 -1.5 M 1.5 -1.5 H -0.3 M 1.5 -1.5 V 0.3" />
    </g>
  );
}

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
