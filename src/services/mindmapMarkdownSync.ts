import type {
  Heading,
  MindmapNode,
  MindmapNodeShape,
  MindmapLineStyle,
  MindmapTextAlign,
} from "../core/types";

/*
 * Markdown ⇄ mindmap tree: parsing document structure into a MindmapNode tree
 * and synchronizing an edited tree back into the original document without
 * destroying content the tree does not know about.
 */

/**
 * Builds a hierarchical multi-way tree from linear document headings.
 */
export function buildMindmapTree(docTitle: string, headings: Heading[]): MindmapNode {
  const cleanTitle = (docTitle || "无标题文档").replace(/\.md$/i, "").trim();
  const root: MindmapNode = {
    id: "root-mindmap-node",
    text: cleanTitle || "知识导图",
    level: 0,
    children: [],
  };

  if (!headings || headings.length === 0) {
    return root;
  }

  const stack: { node: MindmapNode; level: number }[] = [{ node: root, level: 0 }];

  for (const h of headings) {
    const node: MindmapNode = {
      id: h.id,
      text: h.text,
      level: h.level,
      line: h.line,
      children: [],
    };

    // Pop from stack until top has lower level than current heading
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    stack.push({ node, level: h.level });
  }

  return root;
}

/**
 * Parses inline style annotations such as <!-- style: color=#10b981,shape=capsule,lineStyle=step,align=center,width=200 -->
 */
export function parseStyleComment(line: string): {
  cleanText: string;
  color?: string;
  shape?: MindmapNodeShape;
  lineColor?: string;
  lineStyle?: MindmapLineStyle;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textColor?: string;
  borderColor?: string;
  textAlign?: MindmapTextAlign;
  customWidth?: number;
  customHeight?: number;
} {
  const match = line.match(/\s*<!--\s*(?:mindmap|style):\s*([^>]+?)\s*-->/i);
  if (!match) {
    return { cleanText: line.trim() };
  }
  const cleanText = line.replace(match[0], "").trim();
  const rawStyle = match[1];
  const result: {
    cleanText: string;
    color?: string;
    shape?: MindmapNodeShape;
    lineColor?: string;
    lineStyle?: MindmapLineStyle;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    textColor?: string;
    borderColor?: string;
    textAlign?: MindmapTextAlign;
    customWidth?: number;
    customHeight?: number;
  } = { cleanText };

  const pairs = rawStyle.split(/[,;\s]+/).filter(Boolean);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim().toLowerCase();
    const val = pair.slice(eqIdx + 1).trim();
    if (!key || !val) continue;

    if (key === "color") {
      result.color = val;
    } else if (key === "shape" && ["rounded", "capsule", "rect", "underline"].includes(val)) {
      result.shape = val as MindmapNodeShape;
    } else if (key === "linecolor") {
      result.lineColor = val;
    } else if (key === "linestyle" && ["bezier", "step", "straight"].includes(val)) {
      result.lineStyle = val as MindmapLineStyle;
    } else if (key === "fontsize") {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 9 && num <= 36) {
        result.fontSize = num;
      }
    } else if (key === "fontweight" || key === "bold") {
      result.fontWeight = val === "bold" || val === "true" ? "bold" : "normal";
    } else if (key === "textcolor") {
      result.textColor = val;
    } else if (key === "bordercolor") {
      result.borderColor = val;
    } else if (key === "align" || key === "textalign") {
      if (["left", "center", "right", "justify"].includes(val)) {
        result.textAlign = val as MindmapTextAlign;
      }
    } else if (key === "width" || key === "customwidth") {
      const w = parseInt(val, 10);
      if (!isNaN(w) && w >= 60 && w <= 2000) {
        result.customWidth = w;
      }
    } else if (key === "height" || key === "customheight") {
      const h = parseInt(val, 10);
      if (!isNaN(h) && h >= 24 && h <= 2000) {
        result.customHeight = h;
      }
    }
  }

  return result;
}

/**
 * Formats style properties into standard comment format.
 */
export function formatStyleComment(node: Partial<MindmapNode>): string {
  const parts: string[] = [];
  if (node.color) parts.push(`color=${node.color}`);
  if (node.shape) parts.push(`shape=${node.shape}`);
  if (node.lineColor) parts.push(`lineColor=${node.lineColor}`);
  if (node.lineStyle) parts.push(`lineStyle=${node.lineStyle}`);
  if (node.fontSize) parts.push(`fontSize=${node.fontSize}`);
  if (node.fontWeight) parts.push(`fontWeight=${node.fontWeight}`);
  if (node.textColor) parts.push(`textColor=${node.textColor}`);
  if (node.borderColor) parts.push(`borderColor=${node.borderColor}`);
  if (node.textAlign) parts.push(`align=${node.textAlign}`);
  if (node.customWidth) parts.push(`width=${Math.round(node.customWidth)}`);
  if (node.customHeight) parts.push(`height=${Math.round(node.customHeight)}`);
  return parts.length > 0 ? ` <!-- style: ${parts.join(",")} -->` : "";
}

/**
 * Parses markdown content (both indented bullet lists and headings) into an interactive MindmapNode tree.
 */
export function parseMarkdownToMindmapTree(source: string, defaultTitle = "中心主题"): MindmapNode {
  if (!source || !source.trim()) {
    return {
      id: "root-mindmap-node",
      text: defaultTitle,
      level: 0,
      children: [],
    };
  }

  const lines = source.split(/\r?\n/);
  let rootTitle = defaultTitle;
  let rootHeadingFound = false;
  let rootStyle: ReturnType<typeof parseStyleComment> | null = null;

  // Step 1: Detect primary title (# ...)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const parsed = parseStyleComment(trimmed.slice(2));
      rootTitle = parsed.cleanText;
      rootStyle = parsed;
      rootHeadingFound = true;
      break;
    }
  }

  const root: MindmapNode = {
    id: "root-mindmap-node",
    text: rootTitle || defaultTitle,
    level: 0,
    children: [],
    color: rootStyle?.color,
    shape: rootStyle?.shape,
    lineColor: rootStyle?.lineColor,
    lineStyle: rootStyle?.lineStyle,
    fontSize: rootStyle?.fontSize,
    fontWeight: rootStyle?.fontWeight,
    textColor: rootStyle?.textColor,
    borderColor: rootStyle?.borderColor,
    textAlign: rootStyle?.textAlign,
    customWidth: rootStyle?.customWidth,
    customHeight: rootStyle?.customHeight,
  };

  // Step 2: Check if source contains Markdown headings (##, ###, etc.)
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  let subHeadingCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(headingRegex);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim().replace(/\s\^[a-zA-Z0-9_-]+$/, "");
      const parsed = parseStyleComment(rawText);
      if (
        level === 1 &&
        parsed.cleanText === rootTitle &&
        rootHeadingFound &&
        subHeadingCount === 0
      ) {
        continue;
      }
      subHeadingCount++;
    }
  }

  // Step 3: Check if source contains indented list items (- item or * item)
  const listRegex = /^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/;
  const hasListItems = lines.some((line) => listRegex.test(line));

  // If there are no chapter headings but there are list items, parse hierarchical list items
  if (subHeadingCount === 0 && hasListItems) {
    // Parse hierarchical list items
    const stack: { node: MindmapNode; indent: number; path: string }[] = [
      { node: root, indent: -1, path: "root" },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(listRegex);
      if (!match) continue;

      const indent = match[1].length;
      let rawText = match[2].trim();
      // Remove inline block markers like ^block-id
      rawText = rawText.replace(/\s\^[a-zA-Z0-9_-]+$/, "").trim();
      if (!rawText) continue;

      const parsedStyle = parseStyleComment(rawText);
      const text = parsedStyle.cleanText;
      if (!text) continue;

      // Pop until parent indent < current indent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parentItem = stack[stack.length - 1];
      const parent = parentItem.node;
      const childIdx = parent.children.length;
      const currentPath = `${parentItem.path}-${childIdx}`;

      const newNode: MindmapNode = {
        id: `node-${currentPath}`,
        text,
        level: stack.length,
        line: i + 1,
        children: [],
        color: parsedStyle.color,
        shape: parsedStyle.shape,
        lineColor: parsedStyle.lineColor,
        lineStyle: parsedStyle.lineStyle,
        fontSize: parsedStyle.fontSize,
        fontWeight: parsedStyle.fontWeight,
        textColor: parsedStyle.textColor,
        borderColor: parsedStyle.borderColor,
        textAlign: parsedStyle.textAlign,
        customWidth: parsedStyle.customWidth,
        customHeight: parsedStyle.customHeight,
      };
      parent.children.push(newNode);
      stack.push({ node: newNode, indent, path: currentPath });
    }

    return root;
  }

  // Step 4: Parse Markdown headings (#, ##, ###)
  const headings: {
    id: string;
    text: string;
    level: number;
    line: number;
    style?: ReturnType<typeof parseStyleComment>;
  }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(headingRegex);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim().replace(/\s\^[a-zA-Z0-9_-]+$/, "");
      const parsedStyle = parseStyleComment(rawText);
      const text = parsedStyle.cleanText;
      if (level === 1 && text === rootTitle && rootHeadingFound && headings.length === 0) {
        continue;
      }
      headings.push({
        id: `heading-${i + 1}-${encodeURIComponent(text.slice(0, 10))}`,
        text,
        level,
        line: i + 1,
        style: parsedStyle,
      });
    }
  }

  if (headings.length > 0) {
    const stack: { node: MindmapNode; level: number }[] = [{ node: root, level: 0 }];
    for (const h of headings) {
      const node: MindmapNode = {
        id: h.id,
        text: h.text,
        level: h.level,
        line: h.line,
        children: [],
        color: h.style?.color,
        shape: h.style?.shape,
        lineColor: h.style?.lineColor,
        lineStyle: h.style?.lineStyle,
        fontSize: h.style?.fontSize,
        fontWeight: h.style?.fontWeight,
        textColor: h.style?.textColor,
        borderColor: h.style?.borderColor,
        textAlign: h.style?.textAlign,
        customWidth: h.style?.customWidth,
        customHeight: h.style?.customHeight,
      };
      while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].node;
      parent.children.push(node);
      stack.push({ node, level: h.level });
    }
  }

  return root;
}

/**
 * Serializes an interactive MindmapNode tree back to standard hierarchical Markdown.
 */
export function mindmapTreeToMarkdown(tree: MindmapNode): string {
  const lines: string[] = [];
  const rootStyleTag = formatStyleComment(tree);
  lines.push(`# ${tree.text.trim() || "中心主题"}${rootStyleTag}`);
  lines.push("");

  function serializeChildren(nodes: MindmapNode[], indentLevel: number) {
    const indent = "  ".repeat(indentLevel);
    for (const node of nodes) {
      const styleTag = formatStyleComment(node);
      lines.push(`${indent}- ${node.text.trim() || "分支主题"}${styleTag}`);
      if (node.children && node.children.length > 0) {
        serializeChildren(node.children, indentLevel + 1);
      }
    }
  }

  if (tree.children && tree.children.length > 0) {
    serializeChildren(tree.children, 0);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Non-destructively synchronizes the MindmapNode tree back to the original Markdown document.
 *
 * Preserves 100% of all section body content (paragraphs, code blocks, tables, LaTeX math,
 * block references, images, etc.) without mass rewriting or data destruction.
 * Only updates heading titles, levels, order, and handles adding/removing sections.
 */
export function syncMindmapToDocument(originalMarkdown: string, tree: MindmapNode): string {
  if (!originalMarkdown || !originalMarkdown.trim()) {
    return mindmapTreeToMarkdown(tree);
  }

  const lines = originalMarkdown.split(/\r?\n/);
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  const listRegex = /^(\s*)(?:[-*+]|\d+\.)\s+(.+)$/;

  const headingIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i].trim())) {
      headingIndices.push(i);
    }
  }

  // If document does not use Markdown headings, check if it was a bullet list
  if (headingIndices.length === 0) {
    const hasListItems = lines.some((l) => listRegex.test(l));
    if (hasListItems) {
      return mindmapTreeToMarkdown(tree);
    }
    // Plain text document: if tree has branches, output formatted outline
    if (tree.children && tree.children.length > 0) {
      return mindmapTreeToMarkdown(tree);
    }
    return originalMarkdown;
  }

  // Analyze first heading: check if it's the document's primary H1 (# ...)
  const firstHeadingIdx = headingIndices[0];
  const firstHeadingLine = lines[firstHeadingIdx].trim();
  const firstHeadingMatch = firstHeadingLine.match(headingRegex);
  const isFirstHeadingH1 = Boolean(firstHeadingMatch && firstHeadingMatch[1].length === 1);

  const preludeLines: string[] = lines.slice(0, firstHeadingIdx);
  let rootIntroLines: string[] = [];

  interface ParsedSection {
    originalLine: number;
    level: number;
    rawHeadingLine: string;
    title: string;
    cleanTitle: string;
    blockId?: string;
    styleTag?: string;
    bodyLines: string[];
  }

  const sections: ParsedSection[] = [];
  const startHeadingIndex = isFirstHeadingH1 ? 1 : 0;

  if (isFirstHeadingH1) {
    const nextHeadingIdx = headingIndices.length > 1 ? headingIndices[1] : lines.length;
    rootIntroLines = lines.slice(firstHeadingIdx + 1, nextHeadingIdx);
  }

  for (let h = startHeadingIndex; h < headingIndices.length; h++) {
    const lineIdx = headingIndices[h];
    const rawLine = lines[lineIdx];
    const match = rawLine.trim().match(headingRegex);
    if (!match) continue;

    const level = match[1].length;
    let headingText = match[2].trim();

    let blockId: string | undefined;
    const blockMatch = headingText.match(/\s\^([a-zA-Z0-9_-]+)$/);
    if (blockMatch) {
      blockId = blockMatch[1];
      headingText = headingText.replace(blockMatch[0], "").trim();
    }

    let styleTag: string | undefined;
    const styleMatch = headingText.match(/\s*(<!--\s*(?:mindmap|style):\s*[^>]+?\s*-->)/i);
    if (styleMatch) {
      styleTag = styleMatch[1];
      headingText = headingText.replace(styleMatch[0], "").trim();
    }

    const nextHeadingLineIdx = h + 1 < headingIndices.length ? headingIndices[h + 1] : lines.length;
    const bodyLines = lines.slice(lineIdx + 1, nextHeadingLineIdx);

    sections.push({
      originalLine: lineIdx + 1,
      level,
      rawHeadingLine: rawLine,
      title: headingText,
      cleanTitle: headingText.toLowerCase(),
      blockId,
      styleTag,
      bodyLines,
    });
  }

  const matchedSectionIndices = new Set<number>();

  function findMatchingSectionIndex(node: MindmapNode): number {
    // Priority 1: Match by line
    if (node.line) {
      const idx = sections.findIndex(
        (s, i) => !matchedSectionIndices.has(i) && s.originalLine === node.line,
      );
      if (idx !== -1) return idx;
    }

    // Priority 2: Match by id with line number prefix
    const idMatch = node.id.match(/^heading-(\d+)-/);
    if (idMatch) {
      const targetLine = parseInt(idMatch[1], 10);
      const idx = sections.findIndex(
        (s, i) => !matchedSectionIndices.has(i) && s.originalLine === targetLine,
      );
      if (idx !== -1) return idx;
    }

    // Priority 3: Match by normalized title
    const clean = node.text.trim().toLowerCase();
    if (clean) {
      const idx = sections.findIndex(
        (s, i) => !matchedSectionIndices.has(i) && s.cleanTitle === clean,
      );
      if (idx !== -1) return idx;
    }

    return -1;
  }

  const outputLines: string[] = [];

  // Output prelude lines (frontmatter or anything before first heading)
  if (preludeLines.length > 0) {
    outputLines.push(...preludeLines);
  }

  // Output primary document H1 title and root intro lines
  if (isFirstHeadingH1) {
    const rootStyleTag = formatStyleComment(tree);
    outputLines.push(`# ${tree.text.trim() || "中心主题"}${rootStyleTag}`);
    if (rootIntroLines.length > 0) {
      outputLines.push(...rootIntroLines);
    }
  }

  // DFS traverse children of tree
  function processNode(node: MindmapNode, depth: number) {
    const matchedIdx = findMatchingSectionIndex(node);
    let matched: ParsedSection | null = null;
    if (matchedIdx !== -1) {
      matchedSectionIndices.add(matchedIdx);
      matched = sections[matchedIdx];
    }

    let headingLevel = isFirstHeadingH1 ? Math.min(6, depth + 1) : Math.min(6, Math.max(1, depth));
    if (matched && matched.level) {
      if (node.level && node.level === matched.level) {
        headingLevel = matched.level;
      }
    }

    const hashes = "#".repeat(headingLevel);
    const styleComment = formatStyleComment(node);
    const blockRef = matched?.blockId ? ` ^${matched.blockId}` : "";
    const headingLine = `${hashes} ${node.text.trim()}${styleComment}${blockRef}`;

    if (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() !== "") {
      outputLines.push("");
    }
    outputLines.push(headingLine);

    if (matched) {
      outputLines.push(...matched.bodyLines);
    } else {
      outputLines.push("");
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        processNode(child, depth + 1);
      }
    }
  }

  if (tree.children && tree.children.length > 0) {
    for (const child of tree.children) {
      processNode(child, 1);
    }
  }

  // Clean up excessive trailing empty lines and ensure single final newline
  while (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() === "") {
    outputLines.pop();
  }
  outputLines.push("");

  return outputLines.join("\n");
}
