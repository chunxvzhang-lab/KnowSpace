/**
 * Section readers for the mindmap companion file.
 *
 * Every shape a companion file could have is answered here with something
 * usable rather than an exception — the parsing rules live with the readers,
 * and the section table in `mindmapSidecar.ts` dispatches through them so
 * writing and emptiness cannot fall out of step with reading.
 */
import { isPriorityInRange, isProgressInRange } from "../core/mindmapMarkers";
import { toRelation, type MindmapRelation } from "../core/mindmapRelations";
import { isMindmapSide, type MindmapSide } from "../core/mindmapSides";
import type { FloatingTopic, MindmapBoundary, MindmapSummary, NodeMarkers } from "./mindmapSidecar";

/**
 * A tag as the reader typed it, with the parts that mean nothing taken off.
 *
 * The hash is decoration: it is how tags are written in the document, and a tag
 * whose name contained one would be a tag called `#api` sitting next to an `api`.
 * Splitting accepts what people actually type — `#api, #urgent`, `api urgent`,
 * `、` between Chinese words — rather than insisting on one separator and
 * silently making a single tag out of the rest.
 *
 * Case is kept and compared without it, so `#API` and `#api` are one tag and the
 * spelling that survives is the one written first. Lowercasing everything would
 * be tidier in the file and would lose `#KnowSpace`.
 */
export function parseTagInput(input: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const raw of String(input ?? "").split(/[,，、\s]+/)) {
    const tag = raw.trim().replace(/^#+/, "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Trims a known optional text field, and drops it if it holds nothing.
 *
 * One rule for four fields — a label and the three ids — because they differ only
 * in what they are called: any of them written as something other than a
 * non-empty string is the same as not written, and a field that is not there
 * means the default. An id this build does not know, on the other hand, is kept:
 * the table decides what to draw, the file remembers what the reader chose.
 */
export function normaliseOptionalText(record: Record<string, unknown>, field: string): void {
  const value = record[field];
  if (value === undefined) return;
  if (typeof value === "string" && value.trim()) record[field] = value.trim();
  else delete record[field];
}

/**
 * A span shape shared by summaries and boundaries: which topics, and a label.
 *
 * Written once because the second one arrived, which is the point at which a
 * shape is worth naming rather than copying. What differs between the two is a
 * field or two, and each of those is handled by its own caller.
 *
 * The shape rules are the section's own; what the ids *mean* is not. In
 * particular whether the spanned topics are siblings — the intended use, and what
 * makes a bracket read as "these together" — is not checked here: this module has
 * no tree, on purpose, and inventing one to validate a gesture would couple the
 * file format to the layout.
 *
 * A span of nothing is dropped rather than kept, since a drawing around nothing
 * has no referent — and a span written twice is a span of one, so duplicates go.
 */
function readSpanSection<T extends { nodeIds: string[]; text: string }>(
  value: unknown,
): Record<string, T> {
  const section: Record<string, T> = {};
  if (!isPlainObject(value)) return section;

  for (const [id, entry] of Object.entries(value)) {
    if (!id || !isPlainObject(entry)) continue;

    const raw = entry.nodeIds;
    if (!Array.isArray(raw)) continue;

    const nodeIds: string[] = [];
    for (const nodeId of raw) {
      if (typeof nodeId === "string" && nodeId && !nodeIds.includes(nodeId)) nodeIds.push(nodeId);
    }
    if (nodeIds.length === 0) continue;

    const span = {
      ...entry,
      nodeIds,
      text: typeof entry.text === "string" ? entry.text.trim() : "",
    };

    // A colour that is not a string is no colour; an unknown id, on the other
    // hand, is kept — it is what a newer version's palette looks like, and
    // dropping it because this build has not caught up is what makes going back
    // to the newer version lossy.
    if ("color" in span) {
      if (typeof span.color === "string" && span.color.trim()) span.color = span.color.trim();
      else delete span.color;
    }

    section[id] = span as T;
  }

  return section;
}

export function readSummarySection(value: unknown): Record<string, MindmapSummary> {
  return readSpanSection<MindmapSummary>(value);
}

export function readBoundarySection(value: unknown): Record<string, MindmapBoundary> {
  return readSpanSection<MindmapBoundary>(value);
}

/**
 * A side per node, for the two-sided layout.
 *
 * Only the two words this build knows are kept, unlike an icon id or a colour — where an
 * unknown value is what a newer version's palette looks like, and dropping it is what
 * makes going back to that version lossy. A side is a position, and there is no third one
 * to keep: a value this build cannot read is a placement it cannot draw, so the branch
 * falls back to being balanced by the layout, which is where it would have been anyway.
 */
export function readSideSection(value: unknown): Record<string, MindmapSide> {
  const section: Record<string, MindmapSide> = {};
  if (!isPlainObject(value)) return section;

  for (const [id, side] of Object.entries(value)) {
    if (!id) continue;
    if (isMindmapSide(side)) section[id] = side;
  }

  return section;
}

/**
 * The floating section: topics by their own id.
 *
 * A topic with no text is dropped rather than kept as an empty box — an unlabelled
 * box is one nobody can identify or select on purpose, and the reader who empties
 * one is asking for it to go. Coordinates that are not finite numbers fall back to
 * the origin rather than dropping the topic: a topic in the wrong place can be
 * dragged, but one that vanished cannot be found.
 */
export function readFloatingSection(value: unknown): Record<string, FloatingTopic> {
  const section: Record<string, FloatingTopic> = {};
  if (!isPlainObject(value)) return section;

  for (const [id, entry] of Object.entries(value)) {
    if (!id || !isPlainObject(entry)) continue;

    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!text) continue;

    section[id] = {
      ...entry,
      text,
      x: typeof entry.x === "number" && Number.isFinite(entry.x) ? entry.x : 0,
      y: typeof entry.y === "number" && Number.isFinite(entry.y) ? entry.y : 0,
    };
  }

  return section;
}

/** One section as read from a file: an empty map if the file's copy is unusable. */
export function readStringSection(value: unknown): Record<string, string> {
  const section: Record<string, string> = {};
  if (isPlainObject(value)) {
    for (const [nodeId, entry] of Object.entries(value)) {
      // A blank entry is the same as no entry, however the file spells it.
      if (typeof entry === "string" && entry.trim()) section[nodeId] = entry;
    }
  }
  return section;
}

/** The tags section: a list per node, with unusable entries dropped. */
export function readTagSection(value: unknown): Record<string, string[]> {
  const section: Record<string, string[]> = {};
  const sections = value;
  if (!isPlainObject(sections)) return section;

  for (const [nodeId, entry] of Object.entries(sections)) {
    if (!Array.isArray(entry)) continue;
    // Through the same rules the panel's input goes through, so a hand-edited
    // file cannot put a blank tag or a duplicate on a node.
    const tags = parseTagInput(entry.filter((item) => typeof item === "string").join(" "));
    if (tags.length > 0) section[nodeId] = tags;
  }

  return section;
}

/**
 * The relations section: a list of pairs, with the unusable ones dropped.
 *
 * Entries that are not two non-empty ids, that join a topic to itself, or that
 * repeat a pair already listed are left out — a line to nowhere and a line to
 * itself say nothing, and the same pair twice would be one relation drawn twice.
 * The duplicates are compared in canonical order, so `a` to `b` and `b` to `a`
 * are recognised as the same relation rather than kept as two.
 */
export function readRelationSection(value: unknown): MindmapRelation[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const relations: MindmapRelation[] = [];

  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const { fromId, toId } = entry;
    if (typeof fromId !== "string" || typeof toId !== "string") continue;
    if (!fromId || !toId || fromId === toId) continue;

    // The spread first, so a field a newer version added to a line is carried
    // through, and the canonical pair overwrites whatever order was written.
    const relation: MindmapRelation = { ...entry, ...toRelation(fromId, toId) };
    for (const field of ["label", "arrow", "style", "color"]) {
      normaliseOptionalText(relation, field);
    }

    const key = `${relation.fromId}\u0000${relation.toId}`;
    if (seen.has(key)) continue;

    seen.add(key);
    relations.push(relation);
  }

  return relations;
}

/**
 * The markers section, with each value checked against the range the map draws.
 *
 * A value out of range is dropped rather than clamped: the file may have been
 * edited by hand or written by a version with a wider scale, and silently moving
 * someone's "12" to a "9" invents a judgement they did not make.
 *
 * Unknown fields **inside** an entry are kept, the same rule as unknown sections
 * one level up — a node's markers are only partly this build's business.
 */
export function readMarkerSection(value: unknown): Record<string, NodeMarkers> {
  const section: Record<string, NodeMarkers> = {};
  if (!isPlainObject(value)) return section;

  for (const [nodeId, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue;

    const markers: NodeMarkers = { ...entry };
    if (isPriorityInRange(entry.priority)) markers.priority = entry.priority;
    else delete markers.priority;
    if (isProgressInRange(entry.progress)) markers.progress = entry.progress;
    else delete markers.progress;

    // An entry with nothing left in it is no entry: the file records what is
    // set, and an object of dropped fields would say the opposite.
    if (Object.keys(markers).length > 0) section[nodeId] = markers;
  }

  return section;
}
