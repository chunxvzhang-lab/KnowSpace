export type BacklinkRef = {
  sourceId: string;
  sourceTitle: string;
  sourcePath?: string;
  line: number;
  snippet: string;
  target: string;
  alias?: string;
};

export type UnlinkedMention = {
  sourceId: string;
  sourceTitle: string;
  sourcePath?: string;
  line: number;
  snippet: string;
  mentionText: string;
};

export type WikiLinkMatch = {
  target: string;
  alias?: string;
  line: number;
  snippet: string;
};

export type IndexedDocument = {
  id: string;
  title: string;
  path?: string;
  content: string;
};

export type BacklinkIndexData = {
  documents: Map<string, IndexedDocument>;
  // Map of normalizedTargetTitle -> BacklinkRef[]
  backlinks: Map<string, BacklinkRef[]>;
  // Map of docId -> Set of normalizedTargetTitles
  forwardLinks: Map<string, Set<string>>;
};

export function normalizeTitle(title: string): string {
  const base = title.split("#")[0] || "";
  return base.trim().toLowerCase().replace(/\.md$/i, "");
}

/**
 * Extracts all [[target]] and [[target|alias]] occurrences from Markdown content,
 * skipping code blocks (```...```).
 */
export function extractWikiLinksFromMarkdown(content: string): WikiLinkMatch[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const results: WikiLinkMatch[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const regex = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const rawTarget = match[1].trim();
      const target = rawTarget.split("#")[0].trim();
      results.push({
        target,
        alias: match[2] ? match[2].trim() : undefined,
        line: i + 1,
        snippet: line.trim(),
      });
    }
  }

  return results;
}

/**
 * Scans a source document's content for mentions of targetTitle that are NOT already
 * enclosed in [[...]], markdown links, or inline code.
 */
export function findUnlinkedMentions(
  targetTitle: string,
  sourceContent: string,
  sourceId: string,
  sourceTitle: string,
  sourcePath?: string,
): UnlinkedMention[] {
  if (!targetTitle || !sourceContent) return [];
  const baseTitle = targetTitle.split("#")[0] || "";
  const cleanTitle = baseTitle.trim().replace(/\.md$/i, "");
  if (cleanTitle.length < 2) return [];

  const lines = sourceContent.split(/\r?\n/);
  const results: UnlinkedMention[] = [];
  let inCodeBlock = false;

  const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match title without 'g' flag to prevent stateful lastIndex skipping subsequent lines
  const regex = new RegExp(`(?<!\\[\\[|#|\\w)(${escaped})(?!\\]\\]|\\w)`, "i");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Mask out existing wikilinks, standard markdown links, and inline code with spaces of identical length
    const masked = line
      .replace(/\[\[[^\]]+\]\]/g, (m) => " ".repeat(m.length))
      .replace(/\[([^\]]+)\]\([^)]+\)/g, (m) => " ".repeat(m.length))
      .replace(/`[^`]+`/g, (m) => " ".repeat(m.length));

    if (regex.test(masked)) {
      results.push({
        sourceId,
        sourceTitle,
        sourcePath,
        line: i + 1,
        snippet: line.trim(),
        mentionText: cleanTitle,
      });
    }
  }

  return results;
}

/**
 * Replaces the first unlinked occurrence of mentionText on the specified line with [[mentionText]].
 */
export function convertUnlinkedMentionInText(
  sourceContent: string,
  lineNum: number,
  mentionText: string,
): string {
  const lines = sourceContent.split(/\r?\n/);
  const targetLineIdx = lineNum - 1;
  if (targetLineIdx < 0 || targetLineIdx >= lines.length) return sourceContent;

  const line = lines[targetLineIdx];
  const escaped = mentionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<!\\[\\[|#|\\w)(${escaped})(?!\\]\\]|\\w)`, "i");

  // Mask out existing wikilinks, markdown links, and inline code with spaces of identical length
  // so we locate the exact character offset of the unlinked mention in plain text
  const masked = line
    .replace(/\[\[[^\]]+\]\]/g, (m) => " ".repeat(m.length))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, (m) => " ".repeat(m.length))
    .replace(/`[^`]+`/g, (m) => " ".repeat(m.length));

  const match = regex.exec(masked);
  if (!match) return sourceContent;

  const startIdx = match.index;
  const matchLen = match[0].length;
  const matchedText = line.slice(startIdx, startIdx + matchLen);

  lines[targetLineIdx] =
    line.slice(0, startIdx) + `[[${matchedText}]]` + line.slice(startIdx + matchLen);
  return lines.join("\n");
}

/**
 * Refactors occurrences of [[oldTitle...]] in markdown content to [[newTitle...]],
 * preserving any #heading anchor and |alias, while skipping code blocks (```...```).
 */
export function refactorWikiLinksInContent(
  content: string,
  oldTitle: string,
  newTitle: string,
): { newContent: string; changedCount: number } {
  if (!content || !oldTitle || !newTitle) {
    return { newContent: content, changedCount: 0 };
  }

  const cleanOld = oldTitle.split("#")[0].trim().replace(/\.md$/i, "");
  const cleanNew = newTitle.split("#")[0].trim().replace(/\.md$/i, "");
  if (!cleanOld || !cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) {
    return { newContent: content, changedCount: 0 };
  }

  const lines = content.split(/\r?\n/);
  let inCodeBlock = false;
  let changedCount = 0;
  const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Regex to match [[oldTitle(#anchor)?(|alias)?]]
  const regex = new RegExp(`\\[\\[(${escapedOld}(?:\\.md)?)(#[^\\]\n|]+)?(\\|[^\\]\n]+)?\\]\\]`, "gi");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (regex.test(line)) {
      lines[i] = line.replace(regex, (_match, _p1, p2, p3) => {
        changedCount++;
        const anchorPart = p2 || "";
        const aliasPart = p3 || "";
        return `[[${cleanNew}${anchorPart}${aliasPart}]]`;
      });
    }
  }

  return { newContent: lines.join("\n"), changedCount };
}

/**
 * Builds a complete backlink index from an array of documents.
 */
export function createBacklinkIndex(documents: IndexedDocument[] = []): BacklinkIndexData {
  const docMap = new Map<string, IndexedDocument>();
  const backlinks = new Map<string, BacklinkRef[]>();
  const forwardLinks = new Map<string, Set<string>>();

  for (const doc of documents) {
    docMap.set(doc.id, doc);
    const docForward = new Set<string>();

    const matches = extractWikiLinksFromMarkdown(doc.content);
    for (const match of matches) {
      const normTarget = normalizeTitle(match.target);
      docForward.add(normTarget);

      const ref: BacklinkRef = {
        sourceId: doc.id,
        sourceTitle: doc.title,
        sourcePath: doc.path,
        line: match.line,
        snippet: match.snippet,
        target: match.target,
        alias: match.alias,
      };

      const existing = backlinks.get(normTarget) || [];
      existing.push(ref);
      backlinks.set(normTarget, existing);
    }

    forwardLinks.set(doc.id, docForward);
  }

  return { documents: docMap, backlinks, forwardLinks };
}

/**
 * Updates a single document in an existing backlink index.
 */
export function updateDocumentInIndex(
  index: BacklinkIndexData,
  docId: string,
  title: string,
  content: string,
  path?: string,
): void {
  // 1. Remove old references originating from this document
  for (const [normTarget, refs] of index.backlinks.entries()) {
    const filtered = refs.filter((r) => r.sourceId !== docId);
    if (filtered.length !== refs.length) {
      index.backlinks.set(normTarget, filtered);
    }
  }

  // 2. Save updated doc
  index.documents.set(docId, { id: docId, title, content, path });

  // 3. Re-extract outgoing wikilinks and add to backlinks
  const newForward = new Set<string>();
  const matches = extractWikiLinksFromMarkdown(content);
  for (const match of matches) {
    const normTarget = normalizeTitle(match.target);
    newForward.add(normTarget);

    const ref: BacklinkRef = {
      sourceId: docId,
      sourceTitle: title,
      sourcePath: path,
      line: match.line,
      snippet: match.snippet,
      target: match.target,
      alias: match.alias,
    };

    const existing = index.backlinks.get(normTarget) || [];
    existing.push(ref);
    index.backlinks.set(normTarget, existing);
  }

  index.forwardLinks.set(docId, newForward);
}

/**
 * Queries all linked references pointing to a given document.
 */
export function getLinkedReferences(
  index: BacklinkIndexData,
  targetTitle: string,
  targetFileName?: string,
): BacklinkRef[] {
  const normTitle = normalizeTitle(targetTitle);
  const titleRefs = index.backlinks.get(normTitle) || [];

  if (!targetFileName) return titleRefs;

  const normFile = normalizeTitle(targetFileName);
  if (normFile === normTitle) return titleRefs;

  const fileRefs = index.backlinks.get(normFile) || [];
  // Merge and deduplicate by sourceId + line
  const merged: BacklinkRef[] = [...titleRefs];
  for (const fRef of fileRefs) {
    if (!merged.some((m) => m.sourceId === fRef.sourceId && m.line === fRef.line)) {
      merged.push(fRef);
    }
  }

  return merged;
}

/**
 * Queries all unlinked mentions of a document title across the rest of the workspace.
 */
export function getUnlinkedMentions(
  index: BacklinkIndexData,
  targetDocId: string,
  targetTitle: string,
): UnlinkedMention[] {
  const mentions: UnlinkedMention[] = [];
  const cleanTitle = targetTitle.trim().replace(/\.md$/i, "");
  if (cleanTitle.length < 2) return [];

  for (const [id, doc] of index.documents.entries()) {
    if (id === targetDocId) continue;
    const found = findUnlinkedMentions(cleanTitle, doc.content, id, doc.title, doc.path);
    mentions.push(...found);
  }

  return mentions;
}
