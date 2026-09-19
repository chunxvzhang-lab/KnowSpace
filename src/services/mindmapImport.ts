import type { MindmapNode } from "../core/types";
import { readZipEntry } from "../core/zip";

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
  /**
   * The one root topic the format had, if it had one.
   *
   * FreeMind and XMind have exactly one root and OPML may have any number of
   * top-level outlines, and the difference is not a detail: a single root *is* the
   * outline, so it becomes the document — its text names the file and its children
   * are the document's first level. Kept here rather than folded into `topics`
   * because its own note and link then have somewhere to go, where a `topics` entry
   * standing in for the document would have them attached to nothing.
   */
  root?: ImportedTopic;
  /**
   * Something the reader should know about what was *not* imported.
   *
   * A file can hold more than one outline — XMind sheets are the case that made
   * this necessary — and a document is one tree. Importing the first and saying
   * nothing would look like the rest had never existed.
   */
  warning?: string;
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

/** An element's children with a given tag name — not its grandchildren. */
function directChildren(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === tagName);
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
  const parsed = parseXmlDocument(xml);
  if (!parsed.ok) return parsed;

  const body = parsed.document.querySelector("body");
  if (!body || parsed.document.documentElement.tagName.toLowerCase() !== "opml") {
    return { ok: false, message: "这个文件不是 OPML 大纲（没有 <opml><body>）。" };
  }

  const topics = directChildren(body, "outline").map(readOpmlTopic);
  const headTitle = oneLine(parsed.document.querySelector("head > title")?.textContent ?? "");

  return { ok: true, outline: { title: headTitle, topics } };
}

/**
 * Reads a FreeMind map.
 *
 * The differences from OPML are all in the details, and each one is decided by the
 * format rather than chosen: the label is `TEXT` — an attribute spelled in
 * capitals, which is what the format's own name for it is — the children are
 * `<node>` elements, a note arrives as an HTML fragment, and there is exactly one
 * root, whose text is therefore the outline's name.
 *
 * What is *not* read: FreeMind's icon set (a Java client's drawings, with no
 * counterpart in this app's table), and the fold state, which belongs to the
 * reader's session here rather than to the document.
 */
export function parseFreemindOutline(xml: string): ImportResult {
  const parsed = parseXmlDocument(xml);
  if (!parsed.ok) return parsed;

  const root = parsed.document.documentElement;
  if (root.tagName.toLowerCase() !== "map") {
    return { ok: false, message: "这个文件不是 FreeMind 导图（没有 <map>）。" };
  }

  const rootNode = directChildren(root, "node")[0];
  if (!rootNode) {
    return { ok: false, message: "这份 FreeMind 导图里没有主题。" };
  }

  return { ok: true, outline: { title: "", topics: [], root: readFreemindTopic(rootNode) } };
}

/**
 * Reads an XMind file.
 *
 * An `.xmind` is a ZIP holding `content.json`: a list of sheets, each with a root
 * topic and its children. Four things about that are worth stating, because each
 * is a decision rather than a detail:
 *
 * - **The first sheet is the document.** A document here is one tree, and a file
 *   may hold several sheets; the rest are counted and reported rather than
 *   silently dropped.
 * - **Detached topics are not imported.** They are the sheet's floating topics,
 *   and they carry no position this file states — importing them would stack every
 *   one of them on the same spot, which is worse than not importing them and
 *   saying so.
 * - **The map's own non-tree structures are not imported** — boundaries,
 *   summaries, relationships, markers, labels. Each needs the correspondence
 *   between XMind's topic ids and this app's node ids, which the tree walk below
 *   does establish, so they are the next thing this could read rather than
 *   something it cannot.
 * - **A file from XMind 8 or earlier holds `content.xml` instead**, and is refused
 *   with that said out loud rather than as a parse failure.
 */
export function parseXmindOutline(bytes: Uint8Array): ImportResult {
  const entry = readZipEntry(
    bytes,
    (name) => name === "content.json" || name.endsWith("/content.json"),
    "content.json"
  );

  if (!entry.ok) {
    return { ok: false, message: `${entry.message}（XMind 8 及更早版本用的是 content.xml，尚未支持。）` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8").decode(entry.bytes));
  } catch {
    return { ok: false, message: "这个 .xmind 里的 content.json 不是可以解析的 JSON。" };
  }

  // A list of sheets, though a file with a single sheet written as one object has
  // been seen; both are accepted because the difference means nothing here.
  const sheets = Array.isArray(parsed) ? parsed : [parsed];
  const sheet = sheets.find((candidate) => isRecord(candidate) && isRecord(candidate.rootTopic));
  if (!isRecord(sheet)) {
    return { ok: false, message: "这个 .xmind 里没有可读的画布。" };
  }

  const rootTopic = sheet.rootTopic as Record<string, unknown>;
  const root = readXmindTopic(rootTopic);
  const warning =
    sheets.length > 1
      ? `只导入了第 1 张画布，这个文件里还有 ${sheets.length - 1} 张（一篇文档是一棵树）。`
      : undefined;

  return {
    ok: true,
    outline: {
      title: typeof sheet.title === "string" ? oneLine(sheet.title) : "",
      topics: [],
      root,
      ...(warning ? { warning } : {}),
    },
  };
}

/** Reads one XMind topic and everything attached under it. */
function readXmindTopic(topic: Record<string, unknown>): ImportedTopic {
  const children = isRecord(topic.children) ? topic.children : {};
  const attached = Array.isArray(children.attached) ? children.attached : [];

  return topicFrom(
    typeof topic.title === "string" ? topic.title : "",
    xmindNoteText(topic),
    typeof topic.href === "string" ? topic.href : "",
    attached.filter(isRecord).map(readXmindTopic)
  );
}

/** A topic's note, which XMind keeps both as plain text and as HTML. */
function xmindNoteText(topic: Record<string, unknown>): string {
  const notes = isRecord(topic.notes) ? topic.notes : {};
  const plain = isRecord(notes.plain) ? notes.plain.content : undefined;
  if (typeof plain === "string" && plain.trim()) return plain;

  // The HTML copy is the same note with its paragraphs marked up, so it is
  // flattened the same way a FreeMind note is — the note is going into a text
  // field either way.
  for (const key of ["realHTML", "html"]) {
    const html = isRecord(notes[key]) ? notes[key].content : undefined;
    if (typeof html === "string" && html.trim()) return htmlToText(html);
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The bytes behind the base64 the main process sends.
 *
 * Encoded there because this crosses an IPC boundary and an unambiguous string
 * cannot be mangled by however a given Electron version serializes a typed array.
 */
export function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Reads an outline from a file's bytes, deciding by what the file *is*.
 *
 * At this level there are formats whose contents are not text at all, so the first
 * question is whether this is a ZIP. Then the text formats, where the root element
 * decides: the same exporter writes `.xml` for both of them, and an `.opml` that is
 * really a FreeMind map is not unheard of.
 */
export function parseOutlineBytes(bytes: Uint8Array): ImportResult {
  // A ZIP always begins with this, and nothing else this app reads does.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return parseXmindOutline(bytes);
  }

  return parseOutlineFile(new TextDecoder("utf-8").decode(bytes));
}

/**
 * Reads an outline file of either text format, deciding by what the file *is*.
 *
 * By the root element rather than by the extension: the same exporter writes `.xml`
 * for both, an `.opml` that is really a FreeMind map is not unheard of, and the
 * content is the thing that cannot be wrong. The answer when neither matches says
 * what this build can read, because "not OPML" is not useful news if FreeMind was
 * the format the reader had in mind.
 */
export function parseOutlineFile(xml: string): ImportResult {
  const parsed = parseXmlDocument(xml);
  if (!parsed.ok) return parsed;

  const root = parsed.document.documentElement.tagName.toLowerCase();
  if (root === "opml") return parseOpmlOutline(xml);
  if (root === "map") return parseFreemindOutline(xml);

  return {
    ok: false,
    message: `认不出这个大纲的格式（根元素是 <${root}>）。目前可以读 OPML (.opml) 与 FreeMind (.mm)。`,
  };
}

/**
 * The XML every reader above starts with.
 *
 * The byte-order mark is stripped here rather than wherever the text came from:
 * it is the parser's problem — an XML declaration with a character in front of it
 * is not an XML declaration — and stripping it at the source would leave the next
 * caller to rediscover that.
 *
 * A parse error is not thrown: the browser hands back a document containing
 * `<parsererror>`, which is why it has to be looked for rather than caught.
 */
function parseXmlDocument(xml: string): { ok: true; document: Document } | { ok: false; message: string } {
  if (!xml.trim()) return { ok: false, message: "文件是空的。" };

  let document: Document;
  try {
    document = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "text/xml");
  } catch {
    return { ok: false, message: "这个文件不是可以解析的 XML。" };
  }

  if (document.querySelector("parsererror")) {
    return { ok: false, message: "这个文件不是可以解析的 XML。" };
  }

  return { ok: true, document };
}

/** Reads one OPML `<outline>` and everything under it. */
function readOpmlTopic(element: Element): ImportedTopic {
  // `text` is OPML 2.0's own; `title` is what some exporters write instead, and
  // the element's text content is the last place a label can be hiding.
  const label =
    element.getAttribute("text") ??
    element.getAttribute("title") ??
    element.textContent ??
    "";

  return topicFrom(
    label,
    element.getAttribute("_note") ?? element.getAttribute("note") ?? "",
    element.getAttribute("url") ?? "",
    directChildren(element, "outline").map(readOpmlTopic)
  );
}

/** Reads one FreeMind `<node>` and everything under it. */
function readFreemindTopic(element: Element): ImportedTopic {
  return topicFrom(
    element.getAttribute("TEXT") ?? element.getAttribute("text") ?? "",
    richNoteText(element),
    element.getAttribute("LINK") ?? "",
    directChildren(element, "node").map(readFreemindTopic)
  );
}

/**
 * A note written as HTML, flattened to text.
 *
 * Both formats that carry notes mark them up — FreeMind writes a fragment inside
 * `<richcontent>`, XMind keeps a second copy of the note as HTML — and both are
 * going into a text field here. So the paragraphs and line breaks are kept as
 * text, and the markup, which would only be in the way, is not.
 */
function htmlToText(html: string): string {
  // Parsed as HTML rather than as XML: these fragments are HTML, and they are
  // frequently not well-formed enough for an XML parser.
  const container = new DOMParser().parseFromString(html, "text/html").body;
  container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  container.querySelectorAll("p, div, li").forEach((block) => block.append("\n"));

  return (container.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * A FreeMind note, which is written as HTML inside `<richcontent TYPE="NOTE">`.
 *
 * A note written as plain text, which the format also allows, comes back as it is.
 */
function richNoteText(node: Element): string {
  const rich = Array.from(node.children).find(
    (child) =>
      child.tagName.toLowerCase() === "richcontent" &&
      (child.getAttribute("TYPE") ?? child.getAttribute("type") ?? "").toUpperCase() === "NOTE"
  );
  if (!rich) return "";

  const html = rich.innerHTML ?? "";
  if (!html.trim()) return oneLine(rich.textContent ?? "");

  return htmlToText(html) || oneLine(rich.textContent ?? "");
}

/** One topic out of four parts, with the empties left out. */
function topicFrom(
  label: string,
  note: string,
  link: string,
  children: ImportedTopic[]
): ImportedTopic {
  return {
    text: oneLine(label) || UNNAMED,
    ...(oneLine(note) ? { note: note.trim() } : {}),
    ...(oneLine(link) ? { link: oneLine(link) } : {}),
    children,
  };
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

  // The document's own topics: a format with one root contributes that root's
  // children, since the root itself is the document.
  for (const topic of topicsOf(outline)) write(topic, 0);

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** The topics that become the document's first level, whichever shape the file had. */
function topicsOf(outline: ImportedOutline): ImportedTopic[] {
  return outline.root ? outline.root.children : outline.topics;
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

  // A format with one root names the document after that root, so the document's
  // own root *is* the imported root — and its note and link belong there. A format
  // with several top-level outlines has no such topic, and the walk starts one
  // level down.
  if (outline.root) {
    walk(root, outline.root);
    return { notes, links };
  }

  const count = Math.min(root.children.length, outline.topics.length);
  for (let index = 0; index < count; index += 1) {
    walk(root.children[index], outline.topics[index]);
  }

  return { notes, links };
}

/** A file name for the imported document, from the outline's title. */
export function importFileName(outline: ImportedOutline, sourceName: string): string {
  const extensions = /\.(opml|xml|mm|xmind)$/i;
  const base =
    outline.title ||
    outline.root?.text ||
    sourceName.replace(extensions, "") ||
    "导入的大纲";
  // A name that is not a name: either a separator or a control character would
  // make the file it names unreachable on one platform or another.
  const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return `${safe || "导入的大纲"}.md`;
}
