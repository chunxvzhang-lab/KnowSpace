/**
 * The companion file that holds what a Markdown document cannot.
 *
 * A document stays the source of truth for the tree; this file is for everything
 * a tree cannot say — the note hanging off a node, the icon it wears — and none
 * of it can change the outline. Four rules make
 * it safe to have a second file at all, and each of them is a rule because the
 * alternative goes wrong in a way that costs the reader their writing:
 *
 * 1. **The document wins.** Nothing here can change the tree, so a stale or
 *    hand-edited companion cannot corrupt the outline — at worst it decorates
 *    it oddly.
 * 2. **Missing or unreadable means less, not broken.** A companion that is
 *    absent, empty, or replaced by garbage opens as a plain tree. The map is a
 *    view of the document first and a store of extras second.
 * 3. **Unknown is kept.** A companion written by a newer version carries
 *    sections this one has never heard of; they are written back exactly as they
 *    were read, so opening a document in an older build cannot destroy what that
 *    build does not understand.
 * 4. **Written only when the reader changes something.** Loading never rewrites
 *    the file, so a document that is merely opened gains nothing and loses
 *    nothing.
 */

/** The shape this build writes. A file may carry a different one; see above. */
import { isPriorityInRange, isProgressInRange } from "../core/mindmapMarkers";
import { isSameRelation, toRelation, type MindmapRelation } from "../core/mindmapRelations";

export const SIDECAR_VERSION = 1;

/** How urgent a node is, and how far along — the two marks a number says best. */
export interface NodeMarkers {
  /** 1 is most urgent. Absent means no priority is set. */
  priority?: number;
  /** Eighths done. Absent means no progress is set. */
  progress?: number;
  /** Fields a newer version added to a node's markers, kept as they were read. */
  [field: string]: unknown;
}

/** Everything the companion holds. */
export interface MindmapSidecar {
  /** The version of the file, as found — not necessarily the one above. */
  version: number;
  /** Note text by node id. A node with no note has no entry. */
  notes: Record<string, string>;
  /** Icon id by node id, from the mind map's own icon table. */
  icons: Record<string, string>;
  /** Tag names by node id, as written, in the order they were added. */
  tags: Record<string, string[]>;
  /**
   * One link per node, **as the reader typed it** rather than as a parsed record,
   * so a form this build does not understand is still there for the build that
   * does. See `core/mindmapLinks.ts` for how it is read.
   */
  links: Record<string, string>;
  /** Priority and progress by node id. */
  markers: Record<string, NodeMarkers>;
  /**
   * Lines between topics, which the outline itself cannot express.
   *
   * A list rather than a map: a relation has no id of its own — what identifies
   * it *is* the pair of topics it joins, kept in one canonical order.
   */
  relations: MindmapRelation[];
  /** Sections this build does not know about, kept exactly as they were read. */
  [section: string]: unknown;
}

/**
 * The sections this build understands, and how to read each one.
 *
 * Four shapes now: node id to a string (notes, icons, links), to a list (tags),
 * to a small object (markers), and a plain list of relations whose identity is
 * the pair they join rather than any key at all.
 *
 * Looked at again when the fourth arrived, as promised, and this time the list
 * of names became a table of readers. The earlier reasoning still holds — reading
 * is where the shapes differ, and each reader keeps its own signature and rules —
 * but with six sections the dispatch was the duplication: every new section had
 * to be threaded through parsing, writing and the emptiness check by hand. Now
 * writing and emptiness use the names, parsing uses the readers, and the two
 * cannot fall out of step.
 *
 * `emptySidecar` still lists its sections explicitly, because an empty list and
 * an empty object are not the same thing. A test holds it to this table.
 */
const SECTIONS = [
  { name: "notes", read: readStringSection },
  { name: "icons", read: readStringSection },
  { name: "links", read: readStringSection },
  { name: "tags", read: readTagSection },
  { name: "markers", read: readMarkerSection },
  { name: "relations", read: readRelationSection },
] as const;

/** Just the names, for writing a file and asking whether it holds anything. */
export const SIDECAR_SECTIONS: string[] = SECTIONS.map((section) => section.name);

/** The name of one section, for the places that have to name what they touched. */
export type SidecarSection = (typeof SECTIONS)[number]["name"];

/**
 * A companion with nothing in it.
 *
 * Written out rather than derived from the table above: relations are a list
 * while every other section is a map, and a derivation would have to know which
 * is which — which is the same knowledge, in a less obvious place.
 */
export function emptySidecar(): MindmapSidecar {
  return {
    version: SIDECAR_VERSION,
    notes: {},
    icons: {},
    tags: {},
    links: {},
    markers: {},
    relations: [],
  };
}

/** One section as read from a file: an empty map if the file's copy is unusable. */
function readStringSection(value: unknown): Record<string, string> {
  const section: Record<string, string> = {};
  if (isPlainObject(value)) {
    for (const [nodeId, entry] of Object.entries(value)) {
      // A blank entry is the same as no entry, however the file spells it.
      if (typeof entry === "string" && entry.trim()) section[nodeId] = entry;
    }
  }
  return section;
}

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

/** The tags section: a list per node, with unusable entries dropped. */
function readTagSection(value: unknown): Record<string, string[]> {
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
function readRelationSection(value: unknown): MindmapRelation[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const relations: MindmapRelation[] = [];

  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const { fromId, toId } = entry;
    if (typeof fromId !== "string" || typeof toId !== "string") continue;
    if (!fromId || !toId || fromId === toId) continue;

    const relation = toRelation(fromId, toId);
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
function readMarkerSection(value: unknown): Record<string, NodeMarkers> {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a companion file's contents, or gives up on them.
 *
 * Total by design: this runs on a file a person may well have edited by hand, so
 * every shape it could have — truncated JSON, a list where an object belongs,
 * notes that are not strings — is answered with something usable rather than an
 * exception. `null` means "no companion", which the caller shows as a plain
 * tree.
 *
 * A note whose node is **not** in the document is kept, not dropped. The tree
 * can be shorter than the document for reasons that have nothing to do with the
 * note — a heading mid-edit, a different layout — and deleting someone's writing
 * because of what a view happened to show would be unrecoverable. It simply has
 * nowhere to appear until its node comes back.
 */
export function parseSidecar(text: string | null | undefined): MindmapSidecar | null {
  if (typeof text !== "string" || !text.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;

  const sections = Object.fromEntries(
    SECTIONS.map((section) => [section.name, section.read(parsed[section.name])])
  );

  const version = typeof parsed.version === "number" ? parsed.version : SIDECAR_VERSION;

  // The spread comes first so the sections this build does not know about are
  // carried through, and the normalised fields overwrite whatever was there.
  // The cast is the price of a table-driven dispatch; the test that parses an
  // empty object and compares the result's keys against the table is what keeps
  // it honest — a section added to the table but not to the interface fails
  // there rather than at the next reader of this file.
  return { ...parsed, version, ...sections } as MindmapSidecar;
}

/**
 * Writes a companion's contents.
 *
 * Indented and newline-terminated, because a companion is a file a person may
 * open, and — in a vault kept under version control — a diff should be about the
 * note that changed rather than about reflowed JSON.
 *
 * Empty sections are left out instead of written as empty: a file that records
 * nothing should be a small file, and a `notes: {}` on every document ever
 * opened would make "no notes" look like a decision someone made.
 */
export function serializeSidecar(sidecar: MindmapSidecar): string {
  const payload: Record<string, unknown> = { ...sidecar };

  for (const section of SIDECAR_SECTIONS) {
    if (sectionIsEmpty(payload[section])) delete payload[section];
  }

  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** The note on a node, or an empty string. */
export function noteFor(sidecar: MindmapSidecar | null, nodeId: string): string {
  return sidecar?.notes[nodeId] ?? "";
}

/**
 * Sets one node's note, or clears it.
 *
 * Returns a new sidecar rather than editing the one it was given, so a caller
 * can hold two versions of the file at once — which the view does, since it
 * keeps the loaded copy and the edited one apart.
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

/**
 * Sets one node's icon, or clears it.
 *
 * An icon is chosen by clicking, so unlike a note there is no half-typed value
 * to keep: the id is either one the table knows or the empty string that means
 * none. Returns a new sidecar, like every other edit here.
 */
export function setNodeIcon(sidecar: MindmapSidecar, nodeId: string, iconId: string): MindmapSidecar {
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
export function setNodeTags(sidecar: MindmapSidecar, nodeId: string, tags: string[]): MindmapSidecar {
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
  isValid: (candidate: unknown) => boolean
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
  priority: number | null
): MindmapSidecar {
  return setMarker(sidecar, nodeId, "priority", priority, isPriorityInRange);
}

/** Sets a node's progress, or clears it with null. */
export function setNodeProgress(
  sidecar: MindmapSidecar,
  nodeId: string,
  progress: number | null
): MindmapSidecar {
  return setMarker(sidecar, nodeId, "progress", progress, isProgressInRange);
}

/**
 * Two readings of one file: the one that was on disk when a load began, and the
 * one the reader has since edited.
 *
 * Needed because a load is not instant and an edit does not wait for it. The
 * reader's version wins for the sections they touched — so a slow read cannot
 * undo what they just did — and the file's version is kept for the rest, so that
 * same slow read cannot cost the document its other annotations either. Taking
 * either side alone loses something: the edit, or everything else in the file.
 */
export function mergeSidecar(
  fromDisk: MindmapSidecar | null,
  edited: MindmapSidecar | null,
  touched: ReadonlySet<SidecarSection>
): MindmapSidecar | null {
  if (!edited) return fromDisk;
  if (!fromDisk) return edited;

  const merged: Record<string, unknown> = { ...fromDisk };
  for (const section of touched) {
    merged[section] = edited[section];
  }
  return merged as unknown as MindmapSidecar;
}

/** The lines touching one topic. */
export function relationsFor(sidecar: MindmapSidecar | null, nodeId: string): MindmapRelation[] {
  if (!sidecar) return [];
  return sidecar.relations.filter(
    (relation) => relation.fromId === nodeId || relation.toId === nodeId
  );
}

/** Whether these two topics are already connected. */
export function areRelated(sidecar: MindmapSidecar | null, a: string, b: string): boolean {
  if (!sidecar) return false;
  return sidecar.relations.some((relation) => isSameRelation(relation, a, b));
}

/**
 * Connects two topics, or disconnects them if they already are.
 *
 * A toggle, like the icons and the marks: the gesture that draws a line is the
 * gesture that should take it away. A menu item that said "connect" while the two
 * were already connected would be lying about what it does.
 *
 * A topic cannot be related to itself, so that request is answered by doing
 * nothing rather than by storing a line from a box to the same box.
 */
export function toggleRelation(sidecar: MindmapSidecar, a: string, b: string): MindmapSidecar {
  if (!a || !b || a === b) return sidecar;

  const relations = areRelated(sidecar, a, b)
    ? sidecar.relations.filter((relation) => !isSameRelation(relation, a, b))
    : [...sidecar.relations, toRelation(a, b)];

  return { ...sidecar, relations };
}

/**
 * Whether a section holds nothing.
 *
 * Two shapes reach here: a map of topics and a list of relations, so both an
 * empty object and an empty array count as nothing. Missing out the array was a
 * real bug for one commit's worth of time — `"relations": []` was written into
 * every file, and a file with a relation in it was reported as empty.
 */
function sectionIsEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return true;
}

/** Whether anything is stored at all. */
export function sidecarIsEmpty(sidecar: MindmapSidecar | null): boolean {
  if (!sidecar) return true;

  for (const section of SIDECAR_SECTIONS) {
    if (!sectionIsEmpty(sidecar[section])) return false;
  }

  // Only the version and the sections this build knows — and those sections'
  // own keys, which are present whether or not they hold anything. Anything else
  // is content a newer version wrote, even if this build cannot see it.
  const known = new Set<string>(["version", ...SIDECAR_SECTIONS]);
  return Object.keys(sidecar).every((key) => known.has(key));
}

function bridge() {
  if (typeof window === "undefined") return undefined;
  return window.knowSpaceDesktop ?? window.bookMDDesktop;
}

/**
 * Loads a document's companion, if there is one to load.
 *
 * `null` covers every reason there might not be: no bridge (a browser preview),
 * no document key (a preview with no file behind it), no companion file, an
 * unreadable one, contents that do not parse. They all mean the same thing to
 * the caller — show the tree, forget the extras — and none of them is worth
 * interrupting the reader over.
 */
export async function loadSidecar(documentKey: string | null | undefined): Promise<MindmapSidecar | null> {
  if (!documentKey) return null;

  const api = bridge();
  if (!api?.readMindmapSidecar) return null;

  try {
    const result = await api.readMindmapSidecar({ documentPath: documentKey });
    if (!result?.success || !result.exists) return null;
    return parseSidecar(result.content);
  } catch {
    return null;
  }
}

/**
 * Saves a document's companion.
 *
 * Answers whether it landed rather than throwing. A note is worth a quiet
 * failure and a retry; it is not worth taking the editor down with an unhandled
 * rejection, and the caller is the one that can put the failure in front of the
 * reader.
 */
export async function saveSidecar(
  documentKey: string | null | undefined,
  sidecar: MindmapSidecar
): Promise<boolean> {
  if (!documentKey) return false;

  const api = bridge();
  if (!api?.saveMindmapSidecar) return false;

  try {
    const result = await api.saveMindmapSidecar({
      documentPath: documentKey,
      content: serializeSidecar(sidecar),
    });
    return Boolean(result?.success);
  } catch {
    return false;
  }
}
