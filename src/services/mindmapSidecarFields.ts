/**
 * Per-field accessors over the mindmap companion: the note, icon, side, link,
 * tags and markers of a node, and the three canvas-level annotation kinds —
 * boundaries, summaries and floating topics.
 *
 * Every setter returns a NEW sidecar rather than editing the one it was given,
 * so a caller can hold two versions of the file at once — which the view does,
 * since it keeps the loaded copy and the edited one apart.
 */
import { isPriorityInRange, isProgressInRange } from "../core/mindmapMarkers";
import type { MindmapSide } from "../core/mindmapSides";
import { parseTagInput } from "./mindmapSidecarRead";
import type {
  FloatingTopic,
  MindmapBoundary,
  MindmapSidecar,
  MindmapSummary,
  NodeMarkers,
} from "./mindmapSidecar";

/**
 * The highest N in a family of ids (`boundary-3`, `summary-11`), + 1.
 *
 * Equivalent to matching `^<prefix>-(\d+)$` per id, spelled as a prefix test and
 * a digits-only suffix so no pattern is ever built from the prefix.
 */
function nextNumberedId(ids: string[], prefix: string, marker = `${prefix}-`): number {
  let highest = 0;

  for (const id of ids) {
    if (!id.startsWith(marker)) continue;
    const rest = id.slice(marker.length);
    if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }

  return highest + 1;
}

/** The note on a node, or an empty string. */
export function noteFor(sidecar: MindmapSidecar | null, nodeId: string): string {
  return sidecar?.notes[nodeId] ?? "";
}

/**
 * Sets one node's note, or clears it.
 *
 * Clearing removes the entry rather than storing an empty string: the file
 * records what the reader wrote, and "no note" is the absence of an entry.
 */
export function setNodeNote(sidecar: MindmapSidecar, nodeId: string, text: string): MindmapSidecar {
  const notes = { ...sidecar.notes };
  if (text.trim()) {
    notes[nodeId] = text;
  } else {
    delete notes[nodeId];
  }
  return { ...sidecar, notes };
}

/** The icon on a node, or an empty string. */
export function iconFor(sidecar: MindmapSidecar | null, nodeId: string): string {
  return sidecar?.icons[nodeId] ?? "";
}

/** The side a branch was put on, or null when the layout still decides. */
export function sideFor(sidecar: MindmapSidecar | null, nodeId: string): MindmapSide | null {
  return sidecar?.sides[nodeId] ?? null;
}

/**
 * Puts a first-level branch on a side, or hands it back to the layout.
 *
 * Null means "no opinion", and it is the honest default: a branch nobody placed is dealt
 * to whichever side is shorter, and storing a side for it would quietly stop the layout
 * from balancing it — a click the reader never made, remembered forever.
 */
export function setNodeSide(
  sidecar: MindmapSidecar,
  nodeId: string,
  side: MindmapSide | null,
): MindmapSidecar {
  const sides = { ...sidecar.sides };
  if (side) sides[nodeId] = side;
  else delete sides[nodeId];
  return { ...sidecar, sides };
}

/**
 * Sets one node's icon, or clears it.
 *
 * An icon is chosen by clicking, so unlike a note there is no half-typed value
 * to keep: the id is either one the table knows or the empty string that means
 * none. Returns a new sidecar, like every other edit here.
 */
export function setNodeIcon(
  sidecar: MindmapSidecar,
  nodeId: string,
  iconId: string,
): MindmapSidecar {
  const icons = { ...sidecar.icons };
  if (iconId) {
    icons[nodeId] = iconId;
  } else {
    delete icons[nodeId];
  }
  return { ...sidecar, icons };
}

/** A node's link, as the reader typed it, or an empty string. */
export function linkFor(sidecar: MindmapSidecar | null, nodeId: string): string {
  return sidecar?.links[nodeId] ?? "";
}

/**
 * Sets or clears a node's link.
 *
 * Stored trimmed and otherwise untouched: this build does not decide whether the
 * text is a link — `parseMindmapLink` does that when someone tries to follow it,
 * and the panel says so when it cannot. Rejecting it here would mean a form a
 * newer version understands could never be written by an older one.
 */
export function setNodeLink(sidecar: MindmapSidecar, nodeId: string, text: string): MindmapSidecar {
  const links = { ...sidecar.links };
  const trimmed = String(text ?? "").trim();

  if (trimmed) links[nodeId] = trimmed;
  else delete links[nodeId];

  return { ...sidecar, links };
}

/** A node's tags, as written. */
export function tagsFor(sidecar: MindmapSidecar | null, nodeId: string): string[] {
  return sidecar?.tags[nodeId] ?? [];
}

/**
 * Sets a node's tags.
 *
 * The list goes through the same rules the input goes through, so no caller can
 * store a tag the file could not have produced. An empty result removes the
 * entry rather than storing a list with nothing in it.
 */
export function setNodeTags(
  sidecar: MindmapSidecar,
  nodeId: string,
  tags: string[],
): MindmapSidecar {
  const next: Record<string, string[]> = { ...sidecar.tags };
  const cleaned = parseTagInput(Array.isArray(tags) ? tags.join(" ") : "");

  if (cleaned.length > 0) next[nodeId] = cleaned;
  else delete next[nodeId];

  return { ...sidecar, tags: next };
}

/**
 * Every tag in the document, most used first, ties in reading order.
 *
 * What the panel offers as one-click chips. The tags already on the map are the
 * ones a reader is most likely to want next, and offering them is what keeps
 * `#api` and `#接口` from growing up side by side as two names for one thing.
 */
export function allTags(sidecar: MindmapSidecar | null): { tag: string; count: number }[] {
  if (!sidecar) return [];

  const counts = new Map<string, { tag: string; count: number }>();
  for (const tags of Object.values(sidecar.tags)) {
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const found = counts.get(key);
      if (found) found.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }

  // Most used first, and ties in the order they were first seen — a stable sort
  // over the insertion order. Sorting ties by name would put the answer in the
  // hands of a locale, and two machines would offer the same tags in a different
  // order for no reason a reader could see.
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Every marker on a node, or nothing set. */
export function markersFor(sidecar: MindmapSidecar | null, nodeId: string): NodeMarkers {
  return sidecar?.markers[nodeId] ?? {};
}

/**
 * Sets or clears one of a node's two marks.
 *
 * One function for both rather than two, because they differ only in which field
 * they touch and which range validates them: a node keeps a priority and a
 * progress at once, so neither can be a section of its own without duplicating
 * the node's key across two of them.
 *
 * A value out of range clears the mark rather than storing something the map
 * cannot draw. The picker only ever passes a value from the table or null, so
 * this is defence rather than a path anyone takes.
 */
function setMarker(
  sidecar: MindmapSidecar,
  nodeId: string,
  field: "priority" | "progress",
  value: number | null,
  isValid: (candidate: unknown) => boolean,
): MindmapSidecar {
  const markers: Record<string, NodeMarkers> = { ...sidecar.markers };
  const current: NodeMarkers = { ...(markers[nodeId] ?? {}) };

  if (value !== null && isValid(value)) {
    current[field] = value;
  } else {
    delete current[field];
  }

  if (Object.keys(current).length > 0) {
    markers[nodeId] = current;
  } else {
    // A node with nothing set has no entry, like every other section here.
    delete markers[nodeId];
  }

  return { ...sidecar, markers };
}

/** Sets a node's priority, or clears it with null. */
export function setNodePriority(
  sidecar: MindmapSidecar,
  nodeId: string,
  priority: number | null,
): MindmapSidecar {
  return setMarker(sidecar, nodeId, "priority", priority, isPriorityInRange);
}

/** Sets a node's progress, or clears it with null. */
export function setNodeProgress(
  sidecar: MindmapSidecar,
  nodeId: string,
  progress: number | null,
): MindmapSidecar {
  return setMarker(sidecar, nodeId, "progress", progress, isProgressInRange);
}

/** Every boundary, with its id. */
export function boundariesIn(
  sidecar: MindmapSidecar | null,
): { id: string; boundary: MindmapBoundary }[] {
  if (!sidecar) return [];
  return Object.entries(sidecar.boundaries).map(([id, boundary]) => ({ id, boundary }));
}

export function nextBoundaryId(sidecar: MindmapSidecar | null): string {
  return `boundary-${nextNumberedId(Object.keys(sidecar?.boundaries ?? {}), "boundary")}`;
}

/** Draws a box around a group of topics. Answers with the id it was given. */
export function addBoundary(
  sidecar: MindmapSidecar,
  nodeIds: string[],
  text = "",
): { sidecar: MindmapSidecar; id: string } {
  const id = nextBoundaryId(sidecar);
  const boundary: MindmapBoundary = { nodeIds: [...nodeIds], text: text.trim() };
  return { sidecar: { ...sidecar, boundaries: { ...sidecar.boundaries, [id]: boundary } }, id };
}

/**
 * Retitles a boundary, or recolours it.
 *
 * Emptying the title leaves the box in place, like a summary and unlike a free
 * topic: the box is what was asked for. A colour id is stored as given, even one
 * this build does not know — the colour table's job is to decide what to draw,
 * and the file's job is to remember what the reader chose.
 */
export function setBoundaryText(sidecar: MindmapSidecar, id: string, text: string): MindmapSidecar {
  const boundary = sidecar.boundaries[id];
  if (!boundary) return sidecar;
  return {
    ...sidecar,
    boundaries: { ...sidecar.boundaries, [id]: { ...boundary, text: text.trim() } },
  };
}

export function setBoundaryColor(
  sidecar: MindmapSidecar,
  id: string,
  color: string,
): MindmapSidecar {
  const boundary = sidecar.boundaries[id];
  if (!boundary) return sidecar;

  const next: MindmapBoundary = { ...boundary };
  if (color) next.color = color;
  else delete next.color;

  return { ...sidecar, boundaries: { ...sidecar.boundaries, [id]: next } };
}

/** Takes a box off the map. */
export function removeBoundary(sidecar: MindmapSidecar, id: string): MindmapSidecar {
  if (!sidecar.boundaries[id]) return sidecar;
  const boundaries = { ...sidecar.boundaries };
  delete boundaries[id];
  return { ...sidecar, boundaries };
}

/** Every summary, with its id. */
export function summariesIn(
  sidecar: MindmapSidecar | null,
): { id: string; summary: MindmapSummary }[] {
  if (!sidecar) return [];
  return Object.entries(sidecar.summaries).map(([id, summary]) => ({ id, summary }));
}

/** A fresh id for a new summary, numbered for the same reason free topics are. */
export function nextSummaryId(sidecar: MindmapSidecar | null): string {
  return `summary-${nextNumberedId(Object.keys(sidecar?.summaries ?? {}), "summary")}`;
}

/** Brackets a group of topics. Answers with the id it was given. */
export function addSummary(
  sidecar: MindmapSidecar,
  nodeIds: string[],
  text = "",
): { sidecar: MindmapSidecar; id: string } {
  const id = nextSummaryId(sidecar);
  const summary: MindmapSummary = { nodeIds: [...nodeIds], text: text.trim() };
  return { sidecar: { ...sidecar, summaries: { ...sidecar.summaries, [id]: summary } }, id };
}

/**
 * Relabels a summary.
 *
 * Emptying the text does **not** remove it, unlike a free topic: the bracket is
 * the thing that was asked for, and a bracket with nothing written on it still
 * says "these belong together". Removal is its own action.
 */
export function setSummaryText(sidecar: MindmapSidecar, id: string, text: string): MindmapSidecar {
  const summary = sidecar.summaries[id];
  if (!summary) return sidecar;
  return {
    ...sidecar,
    summaries: { ...sidecar.summaries, [id]: { ...summary, text: text.trim() } },
  };
}

/** Takes a bracket off the map. */
export function removeSummary(sidecar: MindmapSidecar, id: string): MindmapSidecar {
  if (!sidecar.summaries[id]) return sidecar;
  const summaries = { ...sidecar.summaries };
  delete summaries[id];
  return { ...sidecar, summaries };
}

/**
 * Takes a floating topic off the canvas, along with what was written on it.
 *
 * Unlike a topic in the outline, whose note is kept when the topic disappears
 * because the document may bring it back — the same heading gives the same id —
 * a floating topic's id is handed out by a counter and never comes back. Its
 * annotations could therefore never be claimed again, and keeping them would be
 * keeping a file that says it has content when what it has is orphans.
 *
 * A summary or a boundary that spanned the topic keeps its span as it was: a span
 * is a list of what the reader picked, and nothing here prunes one. The drawing
 * already copes — an id that resolves to nothing contributes no bounds.
 */
export function removeFloatingTopic(sidecar: MindmapSidecar, id: string): MindmapSidecar {
  if (!sidecar.floating[id]) return sidecar;

  const floating = { ...sidecar.floating };
  delete floating[id];

  const notes = { ...sidecar.notes };
  const icons = { ...sidecar.icons };
  const markers = { ...sidecar.markers };
  const tags = { ...sidecar.tags };
  const links = { ...sidecar.links };
  delete notes[id];
  delete icons[id];
  delete markers[id];
  delete tags[id];
  delete links[id];

  return { ...sidecar, floating, notes, icons, markers, tags, links };
}

/** Every floating topic, with its id. */
export function floatingTopics(
  sidecar: MindmapSidecar | null,
): { id: string; topic: FloatingTopic }[] {
  if (!sidecar) return [];
  return Object.entries(sidecar.floating).map(([id, topic]) => ({ id, topic }));
}

/**
 * A fresh id for a new floating topic.
 *
 * Prefixed so it can never collide with a node's id, and **numbered rather than
 * random**: creating the same topics in the same order produces the same file
 * twice, which is what makes a diff in a version-controlled vault readable, and
 * what makes this testable at all.
 */
export function nextFloatingId(sidecar: MindmapSidecar | null): string {
  return `floating-${nextNumberedId(Object.keys(sidecar?.floating ?? {}), "floating")}`;
}

/** Puts a new topic on the canvas, and answers with the id it was given. */
export function addFloatingTopic(
  sidecar: MindmapSidecar,
  text: string,
  x: number,
  y: number,
): { sidecar: MindmapSidecar; id: string } {
  const id = nextFloatingId(sidecar);
  const floating = { ...sidecar.floating, [id]: { text: text.trim(), x, y } };
  return { sidecar: { ...sidecar, floating }, id };
}

/** Moves a topic. Called on every frame of a drag, so it does the least it can. */
export function moveFloatingTopic(
  sidecar: MindmapSidecar,
  id: string,
  x: number,
  y: number,
): MindmapSidecar {
  const topic = sidecar.floating[id];
  if (!topic) return sidecar;
  return { ...sidecar, floating: { ...sidecar.floating, [id]: { ...topic, x, y } } };
}

/**
 * Renames a topic, or removes it when the text is emptied.
 *
 * Emptying is how a reader says "this box should go" — the same reading the
 * section's own reader takes, so what is on screen and what a later version reads
 * back cannot disagree about what an empty topic means.
 */
export function setFloatingText(sidecar: MindmapSidecar, id: string, text: string): MindmapSidecar {
  const topic = sidecar.floating[id];
  if (!topic) return sidecar;
  const trimmed = text.trim();
  if (!trimmed) return removeFloatingTopic(sidecar, id);
  return { ...sidecar, floating: { ...sidecar.floating, [id]: { ...topic, text: trimmed } } };
}
