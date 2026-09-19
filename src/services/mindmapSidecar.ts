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
  /** Sections this build does not know about, kept exactly as they were read. */
  [section: string]: unknown;
}

/**
 * The sections this build understands.
 *
 * Three shapes now: node id to a string (notes, icons), to a list (tags), to a
 * small object (markers, which can say a priority and a progress at once).
 *
 * Looked at again when the third arrived, as promised, and deliberately left as
 * a list of names. Reading is the only part that differs by shape, and there each
 * reader has its own type and its own rules — turning them into a table of
 * descriptors would move four different functions behind one signature and buy
 * nothing. Writing and "is this file empty" ask a question no shape can answer
 * differently: does this section hold anything at all.
 *
 * A *fourth* shape is where that reasoning runs out: dates, links with labels or
 * nested lists would each need more than a name here, and this list would have
 * become the thing to replace rather than to extend.
 */
export const SIDECAR_SECTIONS = ["notes", "icons", "tags", "links", "markers"] as const;

/** A companion with nothing in it. */
export function emptySidecar(): MindmapSidecar {
  return {
    version: SIDECAR_VERSION,
    notes: {},
    icons: {},
    tags: {},
    links: {},
    markers: {},
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

  const notes = readStringSection(parsed.notes);
  const icons = readStringSection(parsed.icons);
  const links = readStringSection(parsed.links);
  const tags = readTagSection(parsed.tags);
  const markers = readMarkerSection(parsed.markers);

  const version = typeof parsed.version === "number" ? parsed.version : SIDECAR_VERSION;

  // The spread comes first so the sections this build does not know about are
  // carried through, and the normalised fields overwrite whatever was there.
  return { ...parsed, version, notes, icons, tags, links, markers };
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
    const value = payload[section];
    if (isPlainObject(value) && Object.keys(value).length === 0) delete payload[section];
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

/** Whether anything is stored at all. */
export function sidecarIsEmpty(sidecar: MindmapSidecar | null): boolean {
  if (!sidecar) return true;

  for (const section of SIDECAR_SECTIONS) {
    const value = sidecar[section];
    if (isPlainObject(value) && Object.keys(value).length > 0) return false;
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
