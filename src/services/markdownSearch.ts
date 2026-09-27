import { uniqueSlug } from "../core/ids";
import { compactWhitespace, firstVisibleParagraph } from "./markdownDom";
import { parseSearchQuery } from "./searchIndexService";
import type { Heading, SearchResult } from "../core/types";

/*
 * Chapter search: block-aware `findInChapter` over the source markdown with
 * structured filters (tag:#, link:[[, "phrase", -exclude), plus
 * `extractExcerpt` for reading-position cards. Part of the markdown service
 * re-exported by `./markdown`.
 */

type SourceBlock = {
  startLine: number;
  endLine: number;
  text: string;
};

function parseSourceBlocks(sourceMarkdown: string): SourceBlock[] {
  const lines = sourceMarkdown.split("\n");
  const blocks: SourceBlock[] = [];
  let inCodeBlock = false;
  let currentBlockLines: string[] = [];
  let currentStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fences
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        // Flush previous block
        if (currentBlockLines.length > 0) {
          blocks.push({
            startLine: currentStartLine,
            endLine: lineNumber - 1,
            text: currentBlockLines.join("\n"),
          });
          currentBlockLines = [];
        }
        inCodeBlock = true;
        currentStartLine = lineNumber;
        currentBlockLines.push(line);
      } else {
        // Closing code fence
        currentBlockLines.push(line);
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      currentBlockLines.push(line);
      continue;
    }

    // Blank line indicates paragraph boundary
    if (trimmed === "") {
      if (currentBlockLines.length > 0) {
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
      }
      continue;
    }

    // Headings are independent single-line blocks
    if (trimmed.startsWith("#")) {
      if (currentBlockLines.length > 0) {
        blocks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          text: currentBlockLines.join("\n"),
        });
        currentBlockLines = [];
      }
      blocks.push({
        startLine: lineNumber,
        endLine: lineNumber,
        text: line,
      });
      continue;
    }

    // Regular line in paragraph/list/table
    if (currentBlockLines.length === 0) {
      currentStartLine = lineNumber;
    }
    currentBlockLines.push(line);
  }

  if (currentBlockLines.length > 0) {
    blocks.push({
      startLine: currentStartLine,
      endLine: lines.length,
      text: currentBlockLines.join("\n"),
    });
  }

  return blocks;
}

function nearestHeadingForLine(
  lines: string[],
  headings: Heading[],
  targetLine: number,
): Heading | undefined {
  for (let i = targetLine - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("#")) {
      const headingText = line.replace(/^#+\s*/, "").trim();
      const matchedHeading = headings.find(
        (h) => h.text.toLowerCase() === headingText.toLowerCase(),
      );
      if (matchedHeading) return matchedHeading;
      return {
        id: uniqueSlug(headingText, new Map()),
        text: headingText,
        level: line.match(/^#+/)?.[0].length ?? 1,
      };
    }
  }
  return headings[0];
}

export function findInChapter(
  query: string,
  plainText: string,
  headings: Heading[],
  sourceMarkdown?: string,
): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const parsed = parseSearchQuery(q);
  if (parsed.isEmpty) return [];
  const qLower = q.toLowerCase();

  const results: SearchResult[] = [];

  if (sourceMarkdown) {
    const lines = sourceMarkdown.split("\n");
    const blocks = parseSourceBlocks(sourceMarkdown);

    // If structured filters exist (tag:#, link:[[, "phrase", -exclude)
    if (parsed.hasFilters) {
      for (let bIdx = 0; bIdx < blocks.length && results.length < 50; bIdx++) {
        const block = blocks[bIdx];
        const blockText = block.text;
        const blockLower = blockText.toLowerCase();

        // Check exclusions
        if (parsed.excludeTerms.some((ex) => blockLower.includes(ex))) {
          continue;
        }

        // Check phrases
        if (parsed.phrases.some((p) => !blockLower.includes(p.toLowerCase()))) {
          continue;
        }

        // Check tags
        if (parsed.tags.some((t) => !blockLower.includes(`#${t}`))) {
          continue;
        }

        // Check links
        if (parsed.links.some((l) => !blockLower.includes(`[[${l}`))) {
          continue;
        }

        // Check include terms
        if (parsed.includeTerms.some((t) => !blockLower.includes(t.toLowerCase()))) {
          continue;
        }

        let firstPos = 0;
        let primaryMatchText = q;
        if (parsed.phrases.length > 0) {
          firstPos = blockLower.indexOf(parsed.phrases[0].toLowerCase());
          primaryMatchText = parsed.phrases[0];
        } else if (parsed.tags.length > 0) {
          firstPos = blockLower.indexOf(`#${parsed.tags[0]}`);
          primaryMatchText = `#${parsed.tags[0]}`;
        } else if (parsed.links.length > 0) {
          firstPos = blockLower.indexOf(`[[${parsed.links[0]}`);
          primaryMatchText = `[[${parsed.links[0]}]]`;
        } else if (parsed.includeTerms.length > 0) {
          firstPos = blockLower.indexOf(parsed.includeTerms[0].toLowerCase());
          primaryMatchText = parsed.includeTerms[0];
        }
        if (firstPos === -1) firstPos = 0;

        const heading = nearestHeadingForLine(lines, headings, block.startLine);
        const start = Math.max(0, firstPos - 40);
        const end = Math.min(blockText.length, firstPos + primaryMatchText.length + 100);

        let category: SearchResult["category"] = "text";
        if (parsed.tags.length > 0) category = "tag";
        else if (parsed.links.length > 0) category = "link";
        else if (parsed.phrases.length > 0) category = "phrase";

        results.push({
          id: `block-${block.startLine}-${block.endLine}`,
          index: firstPos,
          matchIndex: results.length,
          lineNumber: block.startLine,
          lineEndNumber: block.endLine,
          lineOffset: firstPos,
          query: q,
          title:
            heading?.text ??
            (block.startLine === block.endLine
              ? `第 ${block.startLine} 行`
              : `第 ${block.startLine}-${block.endLine} 行`),
          headingId: heading?.id,
          excerpt: compactWhitespace(
            blockText.length > 180 ? blockText.slice(start, end) : blockText,
          ),
          matchedText: blockText.slice(firstPos, firstPos + primaryMatchText.length),
          matchCountInBlock: 1,
          category,
        });
      }
      if (results.length > 0) return results;
    }

    const qLower = q.toLowerCase();
    for (let bIdx = 0; bIdx < blocks.length && results.length < 50; bIdx++) {
      const block = blocks[bIdx];
      const blockText = block.text;
      const blockLower = blockText.toLowerCase();

      const firstPos = blockLower.indexOf(qLower);
      if (firstPos === -1) continue;

      // Count occurrences in this block
      let occurrences = 0;
      let p = 0;
      while ((p = blockLower.indexOf(qLower, p)) !== -1) {
        occurrences++;
        p += Math.max(1, q.length);
      }

      const heading = nearestHeadingForLine(lines, headings, block.startLine);
      const start = Math.max(0, firstPos - 40);
      const end = Math.min(blockText.length, firstPos + q.length + 100);

      results.push({
        id: `block-${block.startLine}-${block.endLine}`,
        index: firstPos,
        matchIndex: results.length,
        lineNumber: block.startLine,
        lineEndNumber: block.endLine,
        lineOffset: firstPos,
        query: q,
        title:
          heading?.text ??
          (block.startLine === block.endLine
            ? `第 ${block.startLine} 行`
            : `第 ${block.startLine}-${block.endLine} 行`),
        headingId: heading?.id,
        excerpt: compactWhitespace(
          blockText.length > 180 ? blockText.slice(start, end) : blockText,
        ),
        matchedText: blockText.slice(firstPos, firstPos + q.length),
        matchCountInBlock: occurrences,
      });
    }
    if (results.length > 0) return results;
  }

  const paragraphs = plainText.split(/\n+/);
  let globalOffset = 0;
  for (let pIdx = 0; pIdx < paragraphs.length && results.length < 50; pIdx++) {
    const para = paragraphs[pIdx].trim();
    if (!para) continue;
    const paraLower = para.toLowerCase();
    const firstPos = paraLower.indexOf(qLower);
    if (firstPos !== -1) {
      let occurrences = 0;
      let p = 0;
      while ((p = paraLower.indexOf(qLower, p)) !== -1) {
        occurrences++;
        p += Math.max(1, q.length);
      }
      const heading = nearestHeadingForOffset(headings, plainText, globalOffset + firstPos);
      const start = Math.max(0, firstPos - 40);
      const end = Math.min(para.length, firstPos + q.length + 100);
      results.push({
        id: `para-${pIdx}`,
        index: globalOffset + firstPos,
        matchIndex: results.length,
        headingId: heading?.id,
        query: q,
        title: heading?.text ?? "章节匹配",
        excerpt: compactWhitespace(para.length > 180 ? para.slice(start, end) : para),
        matchedText: para.slice(firstPos, firstPos + q.length),
        matchCountInBlock: occurrences,
      });
    }
    globalOffset += paragraphs[pIdx].length + 1;
  }
  return results;
}

export function extractExcerpt(container: HTMLElement, activeHeadingId?: string): string {
  const start = activeHeadingId ? container.querySelector(`#${CSS.escape(activeHeadingId)}`) : null;
  const text =
    start?.nextElementSibling?.textContent ??
    start?.textContent ??
    firstVisibleParagraph(container)?.textContent ??
    "已保存位置";
  return compactWhitespace(text).slice(0, 150);
}

function nearestHeadingForOffset(
  headings: Heading[],
  plainText: string,
  offset: number,
): Heading | undefined {
  let selected: Heading | undefined;
  for (const heading of headings) {
    const headingIndex = plainText.toLowerCase().indexOf(heading.text.toLowerCase());
    if (headingIndex <= offset && headingIndex !== -1) {
      selected = heading;
    }
  }
  return selected;
}
