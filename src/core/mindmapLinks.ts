/**
 * What a node's link points at, read from the text the reader typed.
 *
 * A link is stored as the text itself rather than as a parsed record: the reader
 * writes `https://…`, `[[笔记]]` or `#标题`, and the file keeps exactly that. Two
 * reasons, and the second is the one that matters. It keeps the file readable and
 * hand-editable, and it means a form this build does not recognise is still there
 * — unchanged — for the version that learns to understand it. A parsed record
 * would have to be migrated every time the set of forms grew.
 *
 * That also fixes what this function is not: it is not validation. Unrecognised
 * text is a normal answer (`null`), not an error to report at the point of
 * typing, and nothing here rewrites what the reader wrote.
 */

/** The three ways a node's link can point somewhere. */
export type MindmapLinkKind =
  /** A URL the operating system opens. */
  | "external"
  /** Another document, as `[[name]]`, with an optional `#heading`. */
  | "wiki"
  /** A heading in this document, as `#text`. */
  | "anchor";

export interface MindmapLink {
  kind: MindmapLinkKind;
  /** The URL, the document name, or the heading text. */
  target: string;
  /** The heading inside `[[document#heading]]`, when there is one. */
  anchor?: string;
}

/**
 * Where a link goes, in words, for the panel to show before anyone clicks.
 *
 * A link that is followed without being described is a jump into the unknown;
 * this is cheap and it is the difference between "打开" and knowing where.
 */
export function describeMindmapLink(link: MindmapLink): string {
  if (link.kind === "external") return "外部链接";
  if (link.kind === "wiki") {
    return link.anchor ? `文档「${link.target}」的 #${link.anchor}` : `文档「${link.target}」`;
  }
  return `本文档的 #${link.target}`;
}

/** Schemes this app hands to the operating system. */
const EXTERNAL_PREFIXES = ["http://", "https://", "mailto:"];

/**
 * Reads a link, or returns null if it is not one.
 *
 * The order of the checks is the order of certainty: `[[…]]` is unambiguous, a
 * scheme is unambiguous, and a leading `#` is the convention this app already
 * uses for headings. Anything else is text a reader typed into a field called
 * "link" without it being one, which the panel says so about rather than this
 * function failing over.
 */
export function parseMindmapLink(text: string | null | undefined): MindmapLink | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) {
    const inner = trimmed.slice(2, -2).trim();
    if (!inner) return null;

    // `[[document|shown as]]` is a form this build does not read, and reading it
    // as a document called "document|shown as" would send someone to a file they
    // never named. Reported as unrecognised instead: the panel says which forms
    // work, and the text is kept exactly as typed for the build that learns this
    // one. Silently dropping the alias would be worse still — it would look like
    // it had been understood.
    if (inner.includes("|")) return null;

    const hash = inner.indexOf("#");
    if (hash === -1) return { kind: "wiki", target: inner };

    const target = inner.slice(0, hash).trim();
    const anchor = inner.slice(hash + 1).trim();
    // `[[#标题]]` names no document, so it is the local form wearing a costume.
    if (!target) return anchor ? { kind: "anchor", target: anchor } : null;
    return anchor ? { kind: "wiki", target, anchor } : { kind: "wiki", target };
  }

  const lower = trimmed.toLowerCase();
  if (EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return { kind: "external", target: trimmed };
  }

  if (trimmed.startsWith("#")) {
    const anchor = trimmed.slice(1).trim();
    return anchor ? { kind: "anchor", target: anchor } : null;
  }

  return null;
}
