import type { SearchResult } from "../core/types";
import type { IndexedDocument } from "./backlinkIndex";

export interface ParsedSearchQuery {
  raw: string;
  tags: string[];
  links: string[];
  phrases: string[];
  excludeTerms: string[];
  includeTerms: string[];
  afterDate?: string;
  beforeDate?: string;
  isEmpty: boolean;
  hasFilters: boolean;
}

export interface SearchIndexBlock {
  blockId: string;
  chapterId: string;
  chapterTitle: string;
  chapterPath?: string;
  startLine: number;
  endLine: number;
  text: string;
  lowerText?: string;
  tags: string[];
  links: string[];
  headingId?: string;
  headingText?: string;
  date?: string;
}

export interface SearchIndexDocument {
  id: string;
  title: string;
  path?: string;
  content?: string;
  blocks: SearchIndexBlock[];
  tags: Set<string>;
  links: Set<string>;
  date?: string;
}

export interface VaultSearchIndex {
  documents: Map<string, SearchIndexDocument>;
  tagIndex: Map<string, Set<string>>;     // lowercase tag -> Set<blockId>
  linkIndex: Map<string, Set<string>>;    // lowercase link target -> Set<blockId>
  termIndex: Map<string, Set<string>>;    // lowercase token -> Set<blockId>
  blockMap: Map<string, SearchIndexBlock>;// blockId -> SearchIndexBlock
}

/**
 * Normalizes a tag string by stripping leading '#' and converting to lowercase.
 */
export function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, "").trim().toLowerCase();
}

/**
 * Normalizes a link target string by removing [[ ]], stripping .md, and lowercasing.
 */
export function normalizeLinkTarget(target: string): string {
  return target
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "");
}

/**
 * Parses a search query string into structured components:
 * - tag:#tag or tag:tag or #tag -> tags
 * - link:[[target]] or link:target -> links
 * - "exact phrase" -> phrases
 * - -keyword or -tag:#tag -> excludeTerms
 * - after:YYYY-MM-DD, before:YYYY-MM-DD -> dates
 * - ordinary words -> includeTerms
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const raw = query.trim();
  if (!raw) {
    return {
      raw: "",
      tags: [],
      links: [],
      phrases: [],
      excludeTerms: [],
      includeTerms: [],
      isEmpty: true,
      hasFilters: false,
    };
  }

  const tags: string[] = [];
  const links: string[] = [];
  const phrases: string[] = [];
  const excludeTerms: string[] = [];
  const includeTerms: string[] = [];
  let afterDate: string | undefined;
  let beforeDate: string | undefined;

  let remaining = raw;

  // 1. Extract quoted phrases: "exact phrase"
  const phraseRegex = /"([^"]+)"/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = phraseRegex.exec(raw)) !== null) {
    const phrase = pMatch[1].trim();
    if (phrase) {
      phrases.push(phrase);
    }
  }
  remaining = remaining.replace(phraseRegex, " ");

  // 2. Extract link:[[...]] or link:...
  const linkSyntaxRegex = /(?:^|\s)link:(?:\[\[([^\]]+)\]\]|([^\s]+))/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = linkSyntaxRegex.exec(remaining)) !== null) {
    const target = lMatch[1] || lMatch[2];
    if (target) {
      links.push(normalizeLinkTarget(target));
    }
  }
  remaining = remaining.replace(linkSyntaxRegex, " ");

  // 3. Extract tag:#... or tag:...
  const tagSyntaxRegex = /(?:^|\s)tag:(?:#?([^\s]+))/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tagSyntaxRegex.exec(remaining)) !== null) {
    const tag = tMatch[1];
    if (tag) {
      tags.push(normalizeTag(tag));
    }
  }
  remaining = remaining.replace(tagSyntaxRegex, " ");

  // 4. Extract date filters: after:YYYY-MM-DD, before:YYYY-MM-DD
  const afterRegex = /(?:^|\s)after:(\d{4}-\d{2}-\d{2})/gi;
  const aMatch = afterRegex.exec(remaining);
  if (aMatch) {
    afterDate = aMatch[1];
    remaining = remaining.replace(afterRegex, " ");
  }

  const beforeRegex = /(?:^|\s)before:(\d{4}-\d{2}-\d{2})/gi;
  const bMatch = beforeRegex.exec(remaining);
  if (bMatch) {
    beforeDate = bMatch[1];
    remaining = remaining.replace(beforeRegex, " ");
  }

  // 5. Parse remaining tokens (space separated)
  const tokens = remaining.split(/\s+/).map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    if (token.startsWith("-") && token.length > 1) {
      // Excluded term
      const ex = token.slice(1);
      if (ex.startsWith("#")) {
        excludeTerms.push(normalizeTag(ex));
      } else {
        excludeTerms.push(ex.toLowerCase());
      }
    } else if (token.startsWith("#") && token.length > 1) {
      // Standalone tag like #architecture
      tags.push(normalizeTag(token));
    } else {
      includeTerms.push(token);
    }
  }

  const hasFilters =
    tags.length > 0 ||
    links.length > 0 ||
    phrases.length > 0 ||
    excludeTerms.length > 0 ||
    Boolean(afterDate) ||
    Boolean(beforeDate);

  const isEmpty =
    tags.length === 0 &&
    links.length === 0 &&
    phrases.length === 0 &&
    excludeTerms.length === 0 &&
    includeTerms.length === 0 &&
    !afterDate &&
    !beforeDate;

  return {
    raw,
    tags,
    links,
    phrases,
    excludeTerms,
    includeTerms,
    afterDate,
    beforeDate,
    isEmpty,
    hasFilters,
  };
}

/**
 * Extracts tags from Markdown content, including frontmatter tags.
 * Ignores headings (# Heading), code blocks, URLs, and hex colors.
 */
export function extractTagsFromMarkdown(content: string): string[] {
  if (!content) return [];
  const tagsSet = new Set<string>();
  const lines = content.split(/\r?\n/);

  let inCodeBlock = false;
  let inFrontmatter = false;
  let frontmatterLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
        parseFrontmatterTags(frontmatterLines).forEach((t) => tagsSet.add(t));
      } else {
        frontmatterLines.push(trimmed);
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const tagRegex = /(?:^|[^\w#&])#([\p{L}\p{N}_\-/]+)/gu;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      const candidate = match[1];
      if (/^[0-9a-fA-F]{3,8}$/.test(candidate) && /^[0-9a-fA-F]+$/.test(candidate)) {
        continue;
      }
      if (/^\d+$/.test(candidate)) {
        continue;
      }
      tagsSet.add(normalizeTag(candidate));
    }
  }

  return Array.from(tagsSet);
}

function parseFrontmatterTags(lines: string[]): string[] {
  const result: string[] = [];
  let inTagsList = false;

  for (const line of lines) {
    if (inTagsList) {
      if (/^\s*-\s+/.test(line)) {
        const val = line.replace(/^\s*-\s+/, "").trim().replace(/^['"]|['"]$/g, "");
        if (val) result.push(normalizeTag(val));
      } else if (!/^\s+/.test(line)) {
        inTagsList = false;
      }
    }

    if (/^tags?\s*:\s*\[(.*)\]/i.test(line)) {
      const inside = line.match(/^tags?\s*:\s*\[(.*)\]/i)?.[1] || "";
      inside.split(",").forEach((item) => {
        const val = item.trim().replace(/^['"]|['"]$/g, "");
        if (val) result.push(normalizeTag(val));
      });
    } else if (/^tags?\s*:\s*$/i.test(line)) {
      inTagsList = true;
    } else if (/^tags?\s*:\s*(.+)$/i.test(line)) {
      const val = line.match(/^tags?\s*:\s*(.+)$/i)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
      if (val && val !== "[]") result.push(normalizeTag(val));
    }
  }

  return result;
}

/**
 * Extracts wikilinks from Markdown content: [[target]] or [[target|alias]]
 */
export function extractLinksFromMarkdown(content: string): string[] {
  if (!content) return [];
  const linksSet = new Set<string>();
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[1];
    if (target) {
      linksSet.add(normalizeLinkTarget(target));
    }
  }

  return Array.from(linksSet);
}

/**
 * Fast tokenization for English and CJK text.
 * Returns lowercase unigrams & bigrams for CJK, words for Latin/other scripts.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  const lower = text.toLowerCase();

  const words = lower.match(/[\p{L}\p{N}_]+/gu) || [];
  for (const word of words) {
    tokens.add(word);
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let i = 0; i < word.length; i++) {
        tokens.add(word[i]);
        if (i < word.length - 1) {
          tokens.add(word.slice(i, i + 2));
        }
      }
    }
  }

  return Array.from(tokens);
}

/**
 * Parses Markdown source into discrete searchable blocks (paragraphs, headers, code, lists).
 */
export function parseDocumentBlocks(
  chapterId: string,
  chapterTitle: string,
  content: string,
  path?: string,
  date?: string
): SearchIndexBlock[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const blocks: SearchIndexBlock[] = [];

  let currentLines: string[] = [];
  let blockStartLine = 1;
  let inCode = false;
  let currentHeadingId: string | undefined;
  let currentHeadingText: string | undefined;

  const flushBlock = (endLine: number) => {
    if (currentLines.length === 0) return;
    const text = currentLines.join("\n").trim();
    if (text) {
      const blockId = `${chapterId}:L${blockStartLine}-L${endLine}`;
      const tags = extractTagsFromMarkdown(text);
      const links = extractLinksFromMarkdown(text);

      blocks.push({
        blockId,
        chapterId,
        chapterTitle,
        chapterPath: path,
        startLine: blockStartLine,
        endLine,
        text,
        tags,
        links,
        headingId: currentHeadingId,
        headingText: currentHeadingText,
        date,
      });
    }
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Check heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!inCode && headingMatch) {
      flushBlock(lineNum - 1);
      blockStartLine = lineNum;
      currentLines.push(line);
      currentHeadingText = headingMatch[2].trim();
      currentHeadingId = currentHeadingText.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, "-");
      flushBlock(lineNum);
      blockStartLine = lineNum + 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      if (!inCode) {
        flushBlock(lineNum - 1);
        inCode = true;
        blockStartLine = lineNum;
        currentLines.push(line);
      } else {
        currentLines.push(line);
        inCode = false;
        flushBlock(lineNum);
        blockStartLine = lineNum + 1;
      }
      continue;
    }

    if (inCode) {
      currentLines.push(line);
      continue;
    }

    if (trimmed === "") {
      flushBlock(lineNum - 1);
      blockStartLine = lineNum + 1;
    } else {
      if (currentLines.length === 0) {
        blockStartLine = lineNum;
      }
      currentLines.push(line);
    }
  }

  flushBlock(lines.length);
  return blocks;
}

/**
 * Builds a fresh VaultSearchIndex from an array of IndexedDocuments.
 */
export function buildVaultSearchIndex(documents: IndexedDocument[]): VaultSearchIndex {
  const docMap = new Map<string, SearchIndexDocument>();
  const tagIndex = new Map<string, Set<string>>();
  const linkIndex = new Map<string, Set<string>>();
  const termIndex = new Map<string, Set<string>>();
  const blockMap = new Map<string, SearchIndexBlock>();

  for (const doc of documents) {
    const docTags = new Set<string>();
    const docLinks = new Set<string>();

    const blocks = parseDocumentBlocks(doc.id, doc.title, doc.content, doc.path);

    for (const block of blocks) {
      blockMap.set(block.blockId, block);

      for (const tag of block.tags) {
        docTags.add(tag);
        if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
        tagIndex.get(tag)!.add(block.blockId);
      }

      for (const link of block.links) {
        docLinks.add(link);
        if (!linkIndex.has(link)) linkIndex.set(link, new Set());
        linkIndex.get(link)!.add(block.blockId);
      }

      const tokens = tokenizeText(block.text);
      for (const token of tokens) {
        if (!termIndex.has(token)) termIndex.set(token, new Set());
        termIndex.get(token)!.add(block.blockId);
      }
    }

    docMap.set(doc.id, {
      id: doc.id,
      title: doc.title,
      path: doc.path,
      blocks,
      tags: docTags,
      links: docLinks,
    });
  }

  return {
    documents: docMap,
    tagIndex,
    linkIndex,
    termIndex,
    blockMap,
  };
}

/**
 * Incrementally updates the search index for a single edited document.
 */
export function updateVaultSearchIndexForDocument(
  currentIndex: VaultSearchIndex,
  docId: string,
  title: string,
  content: string,
  path?: string
): VaultSearchIndex {
  const existingDoc = currentIndex.documents.get(docId);

  if (existingDoc) {
    for (const block of existingDoc.blocks) {
      currentIndex.blockMap.delete(block.blockId);
      for (const tag of block.tags) {
        currentIndex.tagIndex.get(tag)?.delete(block.blockId);
      }
      for (const link of block.links) {
        currentIndex.linkIndex.get(link)?.delete(block.blockId);
      }
      const tokens = tokenizeText(block.text);
      for (const token of tokens) {
        currentIndex.termIndex.get(token)?.delete(block.blockId);
      }
    }
  }

  const newBlocks = parseDocumentBlocks(docId, title, content, path);
  const docTags = new Set<string>();
  const docLinks = new Set<string>();

  for (const block of newBlocks) {
    currentIndex.blockMap.set(block.blockId, block);

    for (const tag of block.tags) {
      docTags.add(tag);
      if (!currentIndex.tagIndex.has(tag)) currentIndex.tagIndex.set(tag, new Set());
      currentIndex.tagIndex.get(tag)!.add(block.blockId);
    }

    for (const link of block.links) {
      docLinks.add(link);
      if (!currentIndex.linkIndex.has(link)) currentIndex.linkIndex.set(link, new Set());
      currentIndex.linkIndex.get(link)!.add(block.blockId);
    }

    const tokens = tokenizeText(block.text);
    for (const token of tokens) {
      if (!currentIndex.termIndex.has(token)) currentIndex.termIndex.set(token, new Set());
      currentIndex.termIndex.get(token)!.add(block.blockId);
    }
  }

  currentIndex.documents.set(docId, {
    id: docId,
    title,
    path,
    content,
    blocks: newBlocks,
    tags: docTags,
    links: docLinks,
  });

  return currentIndex;
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Searches the entire vault index using structured syntax.
 */
export function searchVault(
  index: VaultSearchIndex,
  rawQuery: string,
  options?: {
    scopeChapterId?: string;
    limit?: number;
  }
): SearchResult[] {
  const parsed = parseSearchQuery(rawQuery);
  if (parsed.isEmpty) return [];

  const limit = options?.limit ?? 50;
  const scopeChapterId = options?.scopeChapterId;

  let candidateBlockIds: Set<string> | null = null;

  // 1. Tag candidates
  for (const tag of parsed.tags) {
    const matchingIds = index.tagIndex.get(tag) || new Set<string>();
    if (candidateBlockIds === null) {
      candidateBlockIds = new Set(matchingIds);
    } else {
      const currentCandidates: Set<string> = candidateBlockIds;
      const nextCandidates = new Set<string>();
      for (const id of currentCandidates) {
        if (matchingIds.has(id)) nextCandidates.add(id);
      }
      candidateBlockIds = nextCandidates;
    }
  }

  // 2. Link candidates
  for (const link of parsed.links) {
    const matchingIds = index.linkIndex.get(link) || new Set<string>();
    if (candidateBlockIds === null) {
      candidateBlockIds = new Set(matchingIds);
    } else {
      const currentCandidates: Set<string> = candidateBlockIds;
      const nextCandidates = new Set<string>();
      for (const id of currentCandidates) {
        if (matchingIds.has(id)) nextCandidates.add(id);
      }
      candidateBlockIds = nextCandidates;
    }
  }

  // 3. Keyword/term candidates
  if (parsed.includeTerms.length > 0) {
    const termCandidates = new Set<string>();
    let firstTerm = true;

    for (const term of parsed.includeTerms) {
      const termLower = term.toLowerCase();
      let directMatches = index.termIndex.get(termLower);

      if (!directMatches || directMatches.size === 0) {
        // Fallback for multi-character CJK / compound terms not matching exact whole-word boundaries
        const subTokens = tokenizeText(termLower);
        const subMatchSets: Set<string>[] = [];
        for (const st of subTokens) {
          const m = index.termIndex.get(st);
          if (m && m.size > 0) {
            subMatchSets.push(m);
          }
        }
        if (subMatchSets.length > 0) {
          subMatchSets.sort((a, b) => a.size - b.size);
          const candidateSet = new Set(subMatchSets[0]);
          for (let sIdx = 1; sIdx < subMatchSets.length; sIdx++) {
            for (const id of Array.from(candidateSet)) {
              if (!subMatchSets[sIdx].has(id)) {
                candidateSet.delete(id);
              }
            }
          }
          const verified = new Set<string>();
          for (const id of candidateSet) {
            const blk = index.blockMap.get(id);
            if (blk) {
              const textLower = blk.lowerText ?? (blk.lowerText = blk.text.toLowerCase());
              if (textLower.includes(termLower)) {
                verified.add(id);
              }
            }
          }
          directMatches = verified;
        } else {
          directMatches = new Set<string>();
        }
      }

      if (firstTerm) {
        directMatches.forEach((id) => termCandidates.add(id));
        firstTerm = false;
      } else {
        for (const id of Array.from(termCandidates)) {
          if (!directMatches.has(id)) {
            termCandidates.delete(id);
          }
        }
      }
    }

    if (candidateBlockIds === null) {
      candidateBlockIds = termCandidates;
    } else {
      const currentCandidates: Set<string> = candidateBlockIds;
      const nextCandidates = new Set<string>();
      for (const id of currentCandidates) {
        if (termCandidates.has(id)) nextCandidates.add(id);
      }
      candidateBlockIds = nextCandidates;
    }
  }

  // 4. Fallback if only phrases or exclusions were provided
  if (candidateBlockIds === null) {
    candidateBlockIds = new Set(index.blockMap.keys());
  }

  const scoredResults: { result: SearchResult; score: number }[] = [];

  for (const blockId of candidateBlockIds) {
    const block = index.blockMap.get(blockId);
    if (!block) continue;

    if (scopeChapterId && block.chapterId !== scopeChapterId) {
      continue;
    }

    const lowerText = block.lowerText ?? (block.lowerText = block.text.toLowerCase());

    // Exclusions check
    let excluded = false;
    for (const ex of parsed.excludeTerms) {
      if (lowerText.includes(ex) || block.tags.includes(ex)) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    // Date filters check
    if (parsed.afterDate && block.date && block.date < parsed.afterDate) {
      continue;
    }
    if (parsed.beforeDate && block.date && block.date > parsed.beforeDate) {
      continue;
    }

    // Phrases check
    let phraseMatched = true;
    for (const phrase of parsed.phrases) {
      if (!lowerText.includes(phrase.toLowerCase())) {
        phraseMatched = false;
        break;
      }
    }
    if (!phraseMatched) continue;

    // Terms validation
    let allTermsFound = true;
    for (const term of parsed.includeTerms) {
      if (!lowerText.includes(term.toLowerCase())) {
        allTermsFound = false;
        break;
      }
    }
    if (!allTermsFound) continue;

    // Score computation
    let score = 0;
    let matchCountInBlock = 0;
    let firstMatchOffset = -1;
    let primaryMatchText = "";

    for (const phrase of parsed.phrases) {
      score += 60;
      const idx = lowerText.indexOf(phrase.toLowerCase());
      if (idx !== -1 && (firstMatchOffset === -1 || idx < firstMatchOffset)) {
        firstMatchOffset = idx;
        primaryMatchText = block.text.slice(idx, idx + phrase.length);
      }
    }

    for (const tag of parsed.tags) {
      if (block.tags.includes(tag)) {
        score += 50;
        if (firstMatchOffset === -1) {
          const tIdx = lowerText.indexOf(`#${tag}`);
          if (tIdx !== -1) {
            firstMatchOffset = tIdx;
            primaryMatchText = `#${tag}`;
          }
        }
      }
    }

    for (const link of parsed.links) {
      if (block.links.includes(link)) {
        score += 50;
        if (firstMatchOffset === -1) {
          const lIdx = lowerText.indexOf(`[[${link}`);
          if (lIdx !== -1) {
            firstMatchOffset = lIdx;
            primaryMatchText = `[[${link}]]`;
          }
        }
      }
    }

    for (const term of parsed.includeTerms) {
      const tLower = term.toLowerCase();
      let pos = 0;
      while ((pos = lowerText.indexOf(tLower, pos)) !== -1) {
        matchCountInBlock++;
        score += 15;
        if (firstMatchOffset === -1 || pos < firstMatchOffset) {
          firstMatchOffset = pos;
          primaryMatchText = block.text.slice(pos, pos + term.length);
        }
        pos += Math.max(1, term.length);
      }

      if (block.chapterTitle.toLowerCase().includes(tLower)) {
        score += 80;
      }
      if (block.headingText && block.headingText.toLowerCase().includes(tLower)) {
        score += 40;
      }
    }

    if (firstMatchOffset === -1) {
      firstMatchOffset = 0;
      primaryMatchText = parsed.raw;
    }

    const start = Math.max(0, firstMatchOffset - 45);
    const end = Math.min(block.text.length, firstMatchOffset + primaryMatchText.length + 90);
    const excerpt = compactWhitespace(
      block.text.length > 160
        ? (start > 0 ? "..." : "") + block.text.slice(start, end) + (end < block.text.length ? "..." : "")
        : block.text
    );

    let category: SearchResult["category"] = "text";
    if (parsed.tags.length > 0) category = "tag";
    else if (parsed.links.length > 0) category = "link";
    else if (parsed.phrases.length > 0) category = "phrase";

    const result: SearchResult = {
      id: `res-${block.chapterId}-${block.startLine}-${block.endLine}`,
      index: firstMatchOffset,
      matchIndex: scoredResults.length,
      title: block.headingText || block.chapterTitle,
      chapterId: block.chapterId,
      chapterTitle: block.chapterTitle,
      chapterPath: block.chapterPath,
      lineNumber: block.startLine,
      lineEndNumber: block.endLine,
      lineOffset: firstMatchOffset,
      query: parsed.raw,
      matchedText: primaryMatchText,
      matchCountInBlock: Math.max(1, matchCountInBlock),
      excerpt,
      category,
      tags: block.tags,
      links: block.links,
      score,
    };

    scoredResults.push({ result, score });
  }

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, limit).map((s) => s.result);
}
