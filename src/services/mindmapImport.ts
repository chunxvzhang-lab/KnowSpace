import type { MindmapNode } from "../core/types";

/**
 * Reading an outline somebody else's app wrote.
 *
 * The map's own format is Markdown, and that does not change here: an import is a
 * *translation* into a new document, after which the document is the source of
 * truth like any other and the imported file is never consulted again. So this
 * module's product is Markdown text, and its job is to be the only place that
 * knows what the other format looked like.
 *
 * Pure, and tested against real exports' shapes rather than against its own
 * output: the failure that matters is a file that opens as a flat list because a
 * nesting rule was guessed wrong, and that is invisible until someone opens one.
 */

/** One topic as read from a foreign outline file. */
export interface ImportedTopic {
  text: string;
  /** The note the file carried, if it carried one. */
  note?: string;
  /** A link the file carried, if it carried one this build can follow. */
  link?: string;
  children: ImportedTopic[];
}

export interface ImportedOutline {
  /**
   * The outline's own name, if the file states one.
   *
   * Used for the new document's file name. It is not put in the document: the
   * document's name is its title, and writing it again as the first node would
   * add a level the outline does not have.
   */
  title: string;
  /** The top-level topics, exactly as many as the file had. */
  topics: ImportedTopic[];
}

export type ImportResult =
  | { ok: true; outline: ImportedOutline }
  | { ok: false; message: string };

/** What a topic with no text is called. Not empty: an empty list item is not a list item. */
const UNNAMED = "未命名";

/**
 * Collapses a label to one line.
 *
 * A list item is one line, and OPML labels may carry newlines and runs of
 * whitespace — in the source they are attributes, where that is legal. Left in,
 * a newline would end the item and the rest of the label would arrive as a
 * sibling.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Reads one `<outline>` and everything under it. */
function readTopic(element: Element): ImportedTopic {
  // `text` is OPML 2.0's own; `title` is what some exporters write instead, and
  // the element's text content is the last place a label can be hiding.
  const label =
    element.getAttribute("text") ??
    element.getAttribute("title") ??
    element.textContent ??
    "";

  const note = element.getAttribute("_note") ?? element.getAttribute("note") ?? "";
  const url = element.getAttribute("url") ?? "";

  return {
    text: oneLine(label) || UNNAMED,
    ...(oneLine(note) ? { note: oneLine(note) } : {}),
    ...(oneLine(url) ? { link: oneLine(url) } : {}),
    children: directOutlines(element).map(readTopic),
  };
}

/** The `<outline>` children of an element — not its grandchildren. */
function directOutlines(element: Element): Element[] {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "outline");
}

/**
 * Reads an OPML document.
 *
 * Fails only when the file is not OPML at all. Anything else that is odd — a
 * missing head, an attribute this build has never seen, a `type` it does not
 * implement — is imported as the plain topic it looks like: a reader who exported
 * an outline wants the outline, not a report about their exporter.
 */
export function parseOpmlOutline(xml: string): ImportResult {
  if (!xml.trim()) return { ok: false, message: "文件是空的。" };

  let document: Document;
  try {
    // The byte-order mark is stripped here rather than wherever the text came
    // from: it is the parser's problem — an XML declaration with a character in
    // front of it is not an XML declaration — and stripping it at the source
    // would leave the next caller to rediscover that.
    document = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "text/xml");
  } catch {
    return { ok: false, message: "这个文件不是可以解析的 XML。" };
  }

  // A parser error is not thrown: the browser hands back a document containing
  // `<parsererror>`, which is why it has to be looked for rather than caught.
  if (document.querySelector("parsererror")) {
    return { ok: false, message: "这个文件不是可以解析的 XML。" };
  }

  const body = document.querySelector("body");
  if (!body || document.documentElement.tagName.toLowerCase() !== "opml") {
    return { ok: false, message: "这个文件不是 OPML 大纲（没有 <opml><body>）。" };
  }

  const topics = directOutlines(body).map(readTopic);
  const headTitle = oneLine(document.querySelector("head > title")?.textContent ?? "");

  return { ok: true, outline: { title: headTitle, topics } };
}

/**
 * The outline as a Markdown list.
 *
 * Two spaces per level, which is what the map's own reader expects, and `- ` for
 * every item: the file this produces is a document like any other, and it should
 * look like one somebody typed.
 */
export function outlineToMarkdown(outline: ImportedOutline): string {
  const lines: string[] = [];

  const write = (topic: ImportedTopic, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- ${topic.text}`);
    for (const child of topic.children) write(child, depth + 1);
  };

  for (const topic of outline.topics) write(topic, 0);

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * The notes and links the outline carried, keyed by the node ids they belong to.
 *
 * The ids are the ones the *document* just produced, so the two trees are walked
 * together — by position, not by text. Position is right here and text is not:
 * the Markdown was written from this very outline a moment ago, so the shapes
 * correspond exactly, while two sibling topics may share a label and would then
 * be told apart by nothing.
 *
 * A node with no note and no link contributes nothing, and a mismatch in shape —
 * which would mean the two trees did not come from one another — stops the walk
 * rather than shifting every annotation after it onto the wrong node.
 */
export function annotationsFromOutline(
  outline: ImportedOutline,
  root: MindmapNode
): { notes: Record<string, string>; links: Record<string, string> } {
  const notes: Record<string, string> = {};
  const links: Record<string, string> = {};

  const walk = (tree: MindmapNode | undefined, topic: ImportedTopic | undefined) => {
    if (!tree || !topic) return;
    if (topic.note) notes[tree.id] = topic.note;
    if (topic.link) links[tree.id] = topic.link;

    const count = Math.min(tree.children.length, topic.children.length);
    for (let index = 0; index < count; index += 1) {
      walk(tree.children[index], topic.children[index]);
    }
  };

  // The document's root is the document's own name, which came from the file's
  // title rather than from the outline — so the walk starts at the top-level
  // topics, which are the root's children.
  const count = Math.min(root.children.length, outline.topics.length);
  for (let index = 0; index < count; index += 1) {
    walk(root.children[index], outline.topics[index]);
  }

  return { notes, links };
}

/** A file name for the imported document, from the outline's title. */
export function importFileName(outline: ImportedOutline, sourceName: string): string {
  const base = outline.title || sourceName.replace(/\.(opml|xml)$/i, "") || "导入的大纲";
  // A name that is not a name: either a separator or a control character would
  // make the file it names unreachable on one platform or another.
  const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return `${safe || "导入的大纲"}.md`;
}
