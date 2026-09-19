import type { MindmapNode } from "../core/types";
import { writeZip } from "../core/zip";
import {
  boundariesIn,
  linkFor,
  markersFor,
  noteFor,
  summariesIn,
  tagsFor,
  type MindmapSidecar,
} from "./mindmapSidecar";

/**
 * Escapes XML special characters for safe XML/OPML/FreeMind serialization.
 */
export function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Text going into an XML attribute, newlines and all.
 *
 * A literal newline in an attribute value is whitespace as far as an XML parser is
 * concerned, and comes back as a space — so a note of several lines would arrive as
 * one. A character reference to a newline is not whitespace and is not rewritten,
 * which is the only way an attribute can hold one.
 */
function attributeText(value: string): string {
  return escapeXml(value).replace(/\r\n?|\n/g, "&#10;");
}

/**
 * Exports a Mindmap tree as standard OPML 2.0 format.
 * Compatible with MindNode, OmniOutliner, XMind, Logseq, etc.
 */
export function exportMindmapToOpml(
  root: MindmapNode,
  docTitle?: string,
  sidecar?: MindmapSidecar | null
): string {
  const title = docTitle || root.text || "Knowledge Mindmap";
  const nowRfc822 = new Date().toUTCString();

  function serializeNode(node: MindmapNode, indentLevel: number): string {
    const indent = "  ".repeat(indentLevel);
    const escapedText = escapeXml(node.text || "分支主题");
    const escapedColor = node.color ? ` color="${escapeXml(node.color)}"` : "";

    // What the outline cannot carry, carried the way this format does it. Both
    // used to be dropped, which made the round trip through OPML lossy while its
    // importer read exactly these two attributes.
    const note = noteFor(sidecar ?? null, node.id);
    const link = linkFor(sidecar ?? null, node.id);
    const noteAttr = note ? ` _note="${attributeText(note)}"` : "";
    const linkAttr = link ? ` url="${attributeText(link)}"` : "";
    const extras = `${escapedColor}${noteAttr}${linkAttr}`;

    if (!node.children || node.children.length === 0) {
      return `${indent}<outline text="${escapedText}"${extras} />\n`;
    }

    let xml = `${indent}<outline text="${escapedText}"${extras}>\n`;
    for (const child of node.children) {
      xml += serializeNode(child, indentLevel + 1);
    }
    xml += `${indent}</outline>\n`;
    return xml;
  }

  let bodyContent = "";
  // If root has children, root is the primary outline container
  bodyContent += serializeNode(root, 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${nowRfc822}</dateCreated>
    <ownerName>KnowSpace</ownerName>
  </head>
  <body>
${bodyContent}  </body>
</opml>
`;
}

/**
 * Exports a Mindmap tree as standard FreeMind 1.0.1 (.mm) XML format.
 * Supported by XMind, FreeMind, Mindjet MindManager, Freeplane.
 */
export function exportMindmapToFreeMind(
  root: MindmapNode,
  collapsedIds?: ReadonlySet<string>,
  sidecar?: MindmapSidecar | null
): string {
  let counter = 1;

  function serializeNode(node: MindmapNode, indentLevel: number): string {
    const indent = "  ".repeat(indentLevel);
    const id = `ID_${counter++}`;
    const escapedText = escapeXml(node.text || "主题");
    const colorAttr = node.color && node.color !== "transparent" ? ` COLOR="${escapeXml(node.color)}"` : "";

    const hasChildren = Boolean(node.children && node.children.length > 0);
    // FOLDED belongs to a node that can be folded. It was read off the model's
    // own `collapsed` field, which nothing ever writes — the view keeps its
    // collapsed state in a separate set of ids — so this attribute was silently
    // always absent. The set is now the primary source and the field the
    // fallback, for a caller that sets it directly.
    const isFolded = Boolean(collapsedIds?.has(node.id) || node.collapsed) && hasChildren;
    const foldedAttr = isFolded ? ` FOLDED="true"` : "";

    // What the document cannot carry, carried the way this format does it. Notes
    // and links used to be dropped here, which made the round trip through FreeMind
    // lossy while its importer read exactly these two things — a one-way door
    // rather than a decision.
    const link = linkFor(sidecar ?? null, node.id);
    const note = noteFor(sidecar ?? null, node.id);
    const linkAttr = link ? ` LINK="${escapeXml(link)}"` : "";
    const noteXml = note ? richNoteXml(note, indentLevel + 1) : "";

    if (!hasChildren) {
      return noteXml
        ? `${indent}<node ID="${id}" TEXT="${escapedText}"${colorAttr}${foldedAttr}${linkAttr}>\n${noteXml}${indent}</node>\n`
        : `${indent}<node ID="${id}" TEXT="${escapedText}"${colorAttr}${foldedAttr}${linkAttr} />\n`;
    }

    let xml = `${indent}<node ID="${id}" TEXT="${escapedText}"${colorAttr}${foldedAttr}${linkAttr}>\n`;
    for (const child of node.children) {
      xml += serializeNode(child, indentLevel + 1);
    }
    // After the children, which is where FreeMind itself writes it.
    xml += noteXml;
    xml += `${indent}</node>\n`;
    return xml;
  }

  return `<map version="1.0.1">
 <!-- Generated by KnowSpace Knowledge Mindmap Engine -->
${serializeNode(root, 1)}</map>
`;
}

/**
 * A note as FreeMind writes one: an HTML fragment inside `<richcontent>`.
 *
 * One paragraph per line, because that is the shape the importer reads back into
 * lines — a note written as one paragraph would come back as one line and the
 * reader's paragraphs would be gone by the second round trip.
 */
function richNoteXml(note: string, indentLevel: number): string {
  const indent = "  ".repeat(indentLevel);
  const paragraphs = note
    .split(/\r?\n/)
    .map((line) => `${indent}  <p>${escapeXml(line)}</p>`)
    .join("\n");

  return `${indent}<richcontent TYPE="NOTE"><html><body>\n${paragraphs}\n${indent}</body></html></richcontent>\n`;
}

/**
 * Exports a Mindmap tree as structured Markdown outline.
 */
export function exportMindmapToMarkdownOutline(root: MindmapNode): string {
  const lines: string[] = [];

  // Root heading
  lines.push(`# ${root.text || "知识导图"}\n`);

  function traverseChildren(children: MindmapNode[], indentLevel: number) {
    for (const node of children) {
      const indent = "  ".repeat(indentLevel);
      lines.push(`${indent}- ${node.text || "未命名主题"}`);
      if (node.children && node.children.length > 0) {
        traverseChildren(node.children, indentLevel + 1);
      }
    }
  }

  if (root.children && root.children.length > 0) {
    traverseChildren(root.children, 0);
  }

  return lines.join("\n") + "\n";
}

/**
 * Exports a Mindmap tree as a `.xmind` file.
 *
 * Answers with **bytes** rather than a string, because an `.xmind` is a ZIP — see
 * core/zip, which writes the archive and reads the one this comes back in. The
 * entries are stored rather than compressed, so no compressor is involved, and the
 * file this produces is read back by the importer in mindmapImport.ts: the two are
 * each other's test, and that is the only verification available for a format whose
 * own application is not here to ask.
 *
 * Everything the app keeps in the companion file that XMind has a counterpart for
 * goes in: notes, links, labels as tags, the two markers, the lines between topics,
 * and the brackets and boxes over runs of them. What has no counterpart is left out
 * and said so below.
 */
export function exportMindmapToXmind(
  root: MindmapNode,
  options: { sidecar?: MindmapSidecar | null; sheetTitle?: string } = {}
): Uint8Array {
  const sidecar = options.sidecar ?? null;
  const ids = new Map<string, string>();
  const parents = new Map<string, string>();
  const spans: { kind: "summary" | "boundary"; nodeIds: string[]; text: string }[] = [];

  /** XMind's own ids: unique, and not derived from ours, which are ours. */
  let counter = 0;
  const nextId = () => `topic-${(counter += 1)}`;

  const toTopic = (node: MindmapNode): Record<string, unknown> => {
    const id = nextId();
    ids.set(node.id, id);

    const note = noteFor(sidecar, node.id);
    const link = linkFor(sidecar, node.id);
    const tags = tagsFor(sidecar, node.id);
    const markers = markersFor(sidecar, node.id);
    const markerIds = xmindMarkerIds(markers);

    const children = node.children.map((child) => {
      const topic = toTopic(child);
      parents.set(child.id, node.id);
      return topic;
    });

    return {
      id,
      class: "topic",
      title: node.text || "未命名",
      ...(children.length > 0 ? { children: { attached: children } } : {}),
      ...(note ? { notes: { plain: { content: note } } } : {}),
      ...(link ? { href: link } : {}),
      ...(tags.length > 0 ? { labels: tags } : {}),
      ...(markerIds.length > 0 ? { markers: markerIds.map((markerId) => ({ markerId })) } : {}),
    };
  };

  const rootTopic = toTopic(root);

  // Spans are collected first and attached afterwards, because where they belong is
  // the *parent's* children list — which is the thing being built as we go.
  for (const { summary } of summariesIn(sidecar)) {
    spans.push({ kind: "summary", nodeIds: summary.nodeIds, text: summary.text });
  }
  for (const { boundary } of boundariesIn(sidecar)) {
    spans.push({ kind: "boundary", nodeIds: boundary.nodeIds, text: boundary.text });
  }

  for (const span of spans) {
    const run = span.nodeIds.map((nodeId) => ids.get(nodeId)).filter((id): id is string => !!id);
    // A span over topics that are not all in this tree is not a span this file can
    // express: the bracket would have nothing to cover.
    if (run.length !== span.nodeIds.length || run.length === 0) continue;

    const parentId = parents.get(span.nodeIds[0]);
    const parent = parentId ? findTopicById(rootTopic, ids.get(parentId) ?? "") : null;
    const bucket = parent?.children as Record<string, unknown> | undefined;
    if (!bucket) continue;

    const list = Array.isArray(bucket[span.kind]) ? (bucket[span.kind] as unknown[]) : [];
    list.push({
      id: `${span.kind}-${list.length + 1}`,
      class: span.kind,
      title: span.text,
      // The two ends of the run, which is how XMind states a span — the same form
      // the importer expands back into the run.
      range: `(${run[0]},${run[run.length - 1]})`,
    });
    bucket[span.kind] = list;
  }

  const relationships = (sidecar?.relations ?? []).flatMap((relation) => {
    const end1Id = ids.get(relation.fromId);
    const end2Id = ids.get(relation.toId);
    // Both ends have to be in the tree: this app can draw a line to a floating
    // topic, and XMind's line has nowhere to point when it is not a topic.
    if (!end1Id || !end2Id) return [];
    return [
      {
        id: `relationship-${end1Id}-${end2Id}`,
        class: "relationship",
        end1Id,
        end2Id,
        ...(relation.label ? { title: relation.label } : {}),
      },
    ];
  });

  const content = [
    {
      id: "sheet-1",
      class: "sheet",
      title: options.sheetTitle || root.text || "画布 1",
      rootTopic,
      ...(relationships.length > 0 ? { relationships } : {}),
    },
  ];

  const metadata = {
    creator: { name: "KnowSpace", version: "1.0" },
    activeSheetId: "sheet-1",
  };

  return writeZip([
    { name: "content.json", bytes: new TextEncoder().encode(JSON.stringify(content)) },
    { name: "metadata.json", bytes: new TextEncoder().encode(JSON.stringify(metadata)) },
  ]);
}

/** A topic anywhere under this one, by the id given it when it was written. */
function findTopicById(topic: Record<string, unknown>, id: string): Record<string, unknown> | null {
  if (topic.id === id) return topic;

  const children = (topic.children as Record<string, unknown> | undefined)?.attached;
  if (!Array.isArray(children)) return null;

  for (const child of children) {
    if (typeof child !== "object" || child === null) continue;
    const found = findTopicById(child as Record<string, unknown>, id);
    if (found) return found;
  }

  return null;
}

/**
 * The file's own names for the two marks this app keeps.
 *
 * The exact inverse of the table the importer reads, and written out rather than
 * derived from it: the two directions are read by different people at different
 * times, and a shared table would have to be consulted to know what either does.
 */
function xmindMarkerIds(markers: { priority?: number; progress?: number }): string[] {
  const ids: string[] = [];
  if (markers.priority !== undefined) ids.push(`priority-${markers.priority}`);

  // Five names for nine eighths: an eighth that is not one of them is not written,
  // because the file would otherwise carry a marker id that means nothing there.
  const progressName = markers.progress !== undefined ? XMIND_PROGRESS[markers.progress] : undefined;
  if (progressName) ids.push(progressName);

  return ids;
}

/** The eighths XMind has a name for, which is not all of the eighths there are. */
const XMIND_PROGRESS: Record<number, string> = {
  1: "task-start",
  2: "task-quarter",
  4: "task-half",
  6: "task-3quar",
  8: "task-done",
};
