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
 *
 * This file is the single import surface (the shape, the section table,
 * parse/serialize, merge and the file I/O); the readers live in
 * `./mindmapSidecarRead`, the per-field accessors and canvas annotations in
 * `./mindmapSidecarFields`, and the relation lines and import application in
 * `./mindmapSidecarRelations` — all re-exported here so importers keep one
 * entry point.
 */

/** The shape this build writes. A file may carry a different one; see above. */
import type { MindmapRelation } from "../core/mindmapRelations";
import type { MindmapSide } from "../core/mindmapSides";
import {
  readBoundarySection,
  readFloatingSection,
  readMarkerSection,
  readRelationSection,
  readSideSection,
  readStringSection,
  readSummarySection,
  readTagSection,
  isPlainObject,
} from "./mindmapSidecarRead";

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
  /**
   * Topics that no outline owns, by their own id.
   *
   * The clearest case of the additional layer: a topic dragged onto the canvas
   * belongs to the map rather than to the document, so it lives here and the tree
   * stays the document's own shape. The document never hears about it.
   */
  floating: Record<string, FloatingTopic>;
  /**
   * A bracket spanning a group of topics, with what they add up to.
   *
   * Keyed by its own id like a free topic, because unlike a relation it has one:
   * it can be renamed and the span it covers can change, and neither of those is
   * a different summary.
   */
  summaries: Record<string, MindmapSummary>;
  /**
   * A box drawn around a group of topics, with a title.
   *
   * Its own id like a summary, and for the same reasons: it can be renamed, and
   * the group it encloses can change, without becoming a different boundary.
   */
  boundaries: Record<string, MindmapBoundary>;
  /**
   * Which side of the root a first-level branch hangs on, in the two-sided layout.
   *
   * Stated by the reader rather than worked out by the layout, which balances branches by
   * height and would otherwise move one to the other side the moment another grew. Only
   * first-level branches have an entry; the topics under them follow their branch.
   */
  sides: Record<string, MindmapSide>;
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
  { name: "floating", read: readFloatingSection },
  { name: "summaries", read: readSummarySection },
  { name: "boundaries", read: readBoundarySection },
  { name: "sides", read: readSideSection },
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
    floating: {},
    summaries: {},
    boundaries: {},
    sides: {},
  };
}

/** A bracket over a group of topics, and the sentence they add up to. */
export interface MindmapSummary {
  /**
   * The topics it spans, by id.
   *
   * Kept as given rather than as a range: a summary is about the topics the
   * reader picked, and a branch that is moved out of the group should take the
   * bracket's meaning with it rather than silently change what the bracket says.
   */
  nodeIds: string[];
  /** Its label. Empty is allowed — an unlabelled bracket still groups. */
  text: string;
  /** Fields a newer version added, kept as they were read. */
  [field: string]: unknown;
}

/** A topic on the canvas that no outline owns. */
export interface FloatingTopic {
  text: string;
  /** Canvas coordinates: where the box's top-left corner sits. */
  x: number;
  y: number;
  /** Fields a newer version added, kept as they were read. */
  [field: string]: unknown;
}

/** A box drawn around a group of topics, with a title and a colour. */
export interface MindmapBoundary {
  /** The topics it encloses, by id. */
  nodeIds: string[];
  /** Its title. Empty is allowed — a box with nothing written on it still groups. */
  text: string;
  /** A colour id from the map's own table. Absent means the default. */
  color?: string;
  /** Fields a newer version added, kept as they were read. */
  [field: string]: unknown;
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
    SECTIONS.map((section) => [section.name, section.read(parsed[section.name])]),
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
  touched: ReadonlySet<SidecarSection>,
): MindmapSidecar | null {
  if (!edited) return fromDisk;
  if (!fromDisk) return edited;

  const merged: Record<string, unknown> = { ...fromDisk };
  for (const section of touched) {
    merged[section] = edited[section];
  }
  return merged as unknown as MindmapSidecar;
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
  return window.knowSpaceDesktop;
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
export async function loadSidecar(
  documentKey: string | null | undefined,
): Promise<MindmapSidecar | null> {
  if (!documentKey) return null;

  const api = bridge();
  if (!api?.files.readMindmapSidecar) return null;

  try {
    const result = await api.files.readMindmapSidecar({ documentPath: documentKey });
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
  sidecar: MindmapSidecar,
): Promise<boolean> {
  if (!documentKey) return false;

  const api = bridge();
  if (!api?.files.saveMindmapSidecar) return false;

  try {
    const result = await api.files.saveMindmapSidecar({
      documentPath: documentKey,
      content: serializeSidecar(sidecar),
    });
    return Boolean(result?.success);
  } catch {
    return false;
  }
}

export { parseTagInput } from "./mindmapSidecarRead";
export * from "./mindmapSidecarFields";
export * from "./mindmapSidecarRelations";
