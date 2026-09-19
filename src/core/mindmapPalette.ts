/**
 * The colours a reader picks to mark up the map by hand.
 *
 * A mark is a shape drawn over the outline — a boundary's box, a relation's line —
 * as against the theme, which colours the outline itself and follows the document.
 * That is why this is not the theme's palette: a mark's colour is the reader's
 * choice and must not change when the document does.
 *
 * A short list rather than a colour picker: a page with six hues on it is already
 * about as much as anyone reads, and an unbounded choice is how a map ends up
 * looking like a highlighter accident. The id is what goes in the file, for the
 * same reason icon ids are — the hex value is a rendering decision and may change;
 * which colour the reader picked may not.
 */
export const MINDMAP_MARK_COLORS = [
  { id: "slate", label: "灰", color: "#94a3b8" },
  { id: "sky", label: "蓝", color: "#38bdf8" },
  { id: "emerald", label: "绿", color: "#34d399" },
  { id: "amber", label: "琥珀", color: "#f59e0b" },
  { id: "rose", label: "玫红", color: "#fb7185" },
  { id: "violet", label: "紫", color: "#a78bfa" },
] as const;

export const DEFAULT_MARK_COLOR = MINDMAP_MARK_COLORS[0];

/**
 * The colour for an id.
 *
 * An id this build does not know falls back to the default rather than drawing
 * nothing — the opposite of the icon table, and deliberately. An icon *is* a
 * decoration and omitting it loses nothing; a box or a line is the thing the
 * reader asked for, so it has to be drawn whatever colour this build can manage.
 */
export function findMarkColor(id?: string): (typeof MINDMAP_MARK_COLORS)[number] {
  return MINDMAP_MARK_COLORS.find((entry) => entry.id === id) ?? DEFAULT_MARK_COLOR;
}
