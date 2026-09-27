/**
 * Relation lines and imported annotations over the mindmap companion.
 *
 * A relation has no id of its own — what identifies it *is* the pair of topics
 * it joins, kept in one canonical order — so every operation here is
 * pair-addressed.
 */
import { isSameRelation, toRelation, type MindmapRelation } from "../core/mindmapRelations";
import { normaliseOptionalText } from "./mindmapSidecarRead";
import {
  addBoundary,
  addSummary,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeProgress,
  setNodeTags,
} from "./mindmapSidecarFields";
import type { MindmapSidecar, NodeMarkers } from "./mindmapSidecar";

/** The lines touching one topic. */
export function relationsFor(sidecar: MindmapSidecar | null, nodeId: string): MindmapRelation[] {
  if (!sidecar) return [];
  return sidecar.relations.filter(
    (relation) => relation.fromId === nodeId || relation.toId === nodeId,
  );
}

/**
 * Changes what a line says or how it is drawn.
 *
 * A patch rather than a value per field, because the panel edits one thing at a
 * time and the line's other settings have to survive it. An empty value in the
 * patch clears that field, which for every field here means "back to the default
 * look" — that is how a colour goes back to following the theme.
 *
 * Does nothing to a pair that is not joined: a line's settings belong to a line.
 */
export function setRelationFields(
  sidecar: MindmapSidecar,
  a: string,
  b: string,
  patch: { label?: string; arrow?: string; style?: string; color?: string },
): MindmapSidecar {
  const relations = sidecar.relations.map((relation) => {
    if (!isSameRelation(relation, a, b)) return relation;

    const merged: Record<string, unknown> = { ...relation, ...patch };
    for (const field of ["label", "arrow", "style", "color"]) {
      normaliseOptionalText(merged, field);
    }
    return merged as MindmapRelation;
  });

  return { ...sidecar, relations };
}

/** The line between two topics with its settings, or null when there is none. */
export function relationBetween(
  sidecar: MindmapSidecar | null,
  a: string,
  b: string,
): MindmapRelation | null {
  return sidecar?.relations.find((relation) => isSameRelation(relation, a, b)) ?? null;
}

/**
 * What an imported file carried besides its tree.
 *
 * Keyed by the ids the *document* produced rather than by the ids the file used:
 * translating them is the importer's job, and by the time anything here runs the
 * file's own ids are gone. Nothing distinguishes an annotation that came from an
 * import from one the reader wrote — which is the point of importing into the
 * app's own format rather than alongside it.
 */
export interface ImportedAnnotations {
  notes: Record<string, string>;
  links: Record<string, string>;
  tags: Record<string, string[]>;
  markers: Record<string, NodeMarkers>;
  /** Lines between two topics, with what each says. */
  relations: { fromId: string; toId: string; label?: string }[];
  /** Brackets over a run of sibling topics. */
  summaries: { nodeIds: string[]; text: string }[];
  /** Boxes around a run of sibling topics. */
  boundaries: { nodeIds: string[]; text: string }[];
}

/**
 * Puts everything an imported file carried into the companion file.
 *
 * One function rather than a dozen calls at the call site, and here rather than
 * there, for the reason a round of verification turned up: the call site is a
 * screen, and the part that can be wrong about the file's shape is this one — which
 * is now testable without rendering anything.
 *
 * Every section goes in through the same setters the panels use, so an import
 * cannot produce a file the app would not have written itself: a note is a note,
 * an empty list is no list, and a line that is already there is not toggled off.
 */
export function applyImportedAnnotations(
  sidecar: MindmapSidecar,
  annotations: ImportedAnnotations,
): MindmapSidecar {
  let next = sidecar;

  for (const [nodeId, text] of Object.entries(annotations.notes)) {
    next = setNodeNote(next, nodeId, text);
  }
  for (const [nodeId, text] of Object.entries(annotations.links)) {
    next = setNodeLink(next, nodeId, text);
  }
  for (const [nodeId, tags] of Object.entries(annotations.tags)) {
    next = setNodeTags(next, nodeId, tags);
  }
  for (const [nodeId, markers] of Object.entries(annotations.markers)) {
    if (markers.priority !== undefined) next = setNodePriority(next, nodeId, markers.priority);
    if (markers.progress !== undefined) next = setNodeProgress(next, nodeId, markers.progress);
  }

  for (const relation of annotations.relations) {
    // Not `toggleRelation` on its own: that would remove a line that is already
    // there, and an import adds what the file had rather than flipping it.
    if (!areRelated(next, relation.fromId, relation.toId)) {
      next = toggleRelation(next, relation.fromId, relation.toId);
    }
    if (relation.label) {
      next = setRelationFields(next, relation.fromId, relation.toId, { label: relation.label });
    }
  }

  for (const summary of annotations.summaries) {
    next = addSummary(next, summary.nodeIds, summary.text).sidecar;
  }
  for (const boundary of annotations.boundaries) {
    next = addBoundary(next, boundary.nodeIds, boundary.text).sidecar;
  }

  return next;
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
