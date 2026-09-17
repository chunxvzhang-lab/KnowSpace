import type {
  Heading,
  MindmapNode,
  MindmapNodeShape,
  MindmapLineStyle,
  MindmapTextAlign,
} from "../core/types";
import { DEFAULT_LAYOUT_ID, type MindmapLayoutId } from "../core/mindmapLayouts";

/**
 * The edge a node's children are on.
 *
 * A leaf has one too — it is the edge its own parent's connector arrives at —
 * because the renderer hangs the collapse toggle off it. Three values rather
 * than two because the vertical layout grows downwards, and a toggle that stayed
 * on the right edge there would sit in the middle of the next row.
 */
export type MindmapLayoutSide = "left" | "right" | "bottom";

export interface MindmapLayoutNode {
  id: string;
  text: string;
  lines: string[];
  level: number;
  line?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children: MindmapLayoutNode[];
  hasChildren: boolean;
  collapsed: boolean;
  colorIndex: number;
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
  /**
   * The side this node's children are on.
   *
   * `right` for every node the default layout produces, so the renderer's long
   * standing assumption — the collapse toggle sits just past the right edge —
   * remains true there. The bidirectional layout grows half the map the other
   * way, and the toggle has to move to the edge the children are actually on.
   */
  side: MindmapLayoutSide;
}

export interface MindmapLayoutResult {
  root: MindmapLayoutNode;
  nodes: MindmapLayoutNode[];
  edges: {
    fromId: string;
    toId: string;
    d: string;
    colorIndex: number;
    color?: string;
    style?: MindmapLineStyle;
  }[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

/**
 * Builds a hierarchical multi-way tree from linear document headings.
 */
export function buildMindmapTree(
  docTitle: string,
  headings: Heading[]
): MindmapNode {
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
      result.fontWeight = (val === "bold" || val === "true") ? "bold" : "normal";
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
export function parseMarkdownToMindmapTree(
  source: string,
  defaultTitle = "中心主题"
): MindmapNode {
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
      let rawText = match[2].trim().replace(/\s\^[a-zA-Z0-9_-]+$/, "");
      const parsed = parseStyleComment(rawText);
      if (level === 1 && parsed.cleanText === rootTitle && rootHeadingFound && subHeadingCount === 0) {
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
  const headings: { id: string; text: string; level: number; line: number; style?: ReturnType<typeof parseStyleComment> }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(headingRegex);
    if (match) {
      const level = match[1].length;
      let rawText = match[2].trim().replace(/\s\^[a-zA-Z0-9_-]+$/, "");
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
    const stack: { node: MindmapNode; level: number }[] = [
      { node: root, level: 0 },
    ];
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
        (s, i) => !matchedSectionIndices.has(i) && s.originalLine === node.line
      );
      if (idx !== -1) return idx;
    }

    // Priority 2: Match by id with line number prefix
    const idMatch = node.id.match(/^heading-(\d+)-/);
    if (idMatch) {
      const targetLine = parseInt(idMatch[1], 10);
      const idx = sections.findIndex(
        (s, i) => !matchedSectionIndices.has(i) && s.originalLine === targetLine
      );
      if (idx !== -1) return idx;
    }

    // Priority 3: Match by normalized title
    const clean = node.text.trim().toLowerCase();
    if (clean) {
      const idx = sections.findIndex(
        (s, i) => !matchedSectionIndices.has(i) && s.cleanTitle === clean
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

export function cloneTree(node: MindmapNode): MindmapNode {
  return {
    ...node,
    children: node.children ? node.children.map(cloneTree) : [],
  };
}

export function findNode(tree: MindmapNode, id: string): MindmapNode | null {
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(tree: MindmapNode, id: string): MindmapNode | null {
  if (tree.id === id) return null;
  if (tree.children) {
    for (const child of tree.children) {
      if (child.id === id) return tree;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findSibling(tree: MindmapNode, id: string, delta: number): MindmapNode | null {
  const parent = findParent(tree, id);
  if (!parent || !parent.children) return null;
  const idx = parent.children.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const targetIdx = idx + delta;
  if (targetIdx >= 0 && targetIdx < parent.children.length) {
    return parent.children[targetIdx];
  }
  return null;
}

export function addChildNode(
  tree: MindmapNode,
  parentId: string,
  text = "新建子主题"
): { nextTree: MindmapNode; newNodeId: string } {
  const nextTree = cloneTree(tree);
  const target = findNode(nextTree, parentId);
  const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newNode: MindmapNode = {
    id: newNodeId,
    text,
    level: (target?.level ?? 0) + 1,
    children: [],
  };

  if (target) {
    if (!target.children) target.children = [];
    target.children.push(newNode);
  } else {
    nextTree.children.push(newNode);
  }

  return { nextTree, newNodeId };
}

export function addSiblingNode(
  tree: MindmapNode,
  targetId: string,
  text = "新建主题"
): { nextTree: MindmapNode; newNodeId: string } {
  const nextTree = cloneTree(tree);
  const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // If target is root, add as child of root
  if (targetId === nextTree.id || targetId === "root-mindmap-node") {
    return addChildNode(tree, nextTree.id, text);
  }

  const parent = findParent(nextTree, targetId);
  if (!parent || !parent.children) {
    return addChildNode(tree, nextTree.id, text);
  }

  const idx = parent.children.findIndex((c) => c.id === targetId);
  const newNode: MindmapNode = {
    id: newNodeId,
    text,
    level: parent.level + 1,
    children: [],
  };

  if (idx === -1) {
    parent.children.push(newNode);
  } else {
    parent.children.splice(idx + 1, 0, newNode);
  }

  return { nextTree, newNodeId };
}

export function deleteNode(
  tree: MindmapNode,
  nodeId: string
): { nextTree: MindmapNode; fallbackSelectedId: string } {
  // Root node cannot be deleted
  if (nodeId === tree.id || nodeId === "root-mindmap-node") {
    return { nextTree: tree, fallbackSelectedId: tree.id };
  }

  const nextTree = cloneTree(tree);
  const parent = findParent(nextTree, nodeId);
  if (!parent || !parent.children) {
    return { nextTree, fallbackSelectedId: nextTree.id };
  }

  const idx = parent.children.findIndex((c) => c.id === nodeId);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
  }

  return { nextTree, fallbackSelectedId: parent.id };
}

export function updateNodeText(
  tree: MindmapNode,
  nodeId: string,
  newText: string
): MindmapNode {
  const nextTree = cloneTree(tree);
  const node = findNode(nextTree, nodeId);
  if (node) {
    node.text = newText.trim() || "未命名主题";
  }
  return nextTree;
}

/**
 * Palette of harmonic accent colors for root branches.
 */
export const BRANCH_COLORS = [
  "#38bdf8", // Sky blue
  "#818cf8", // Indigo
  "#a78bfa", // Purple
  "#f472b6", // Pink
  "#fb923c", // Orange
  "#facc15", // Amber
  "#34d399", // Emerald
  "#2dd4bf", // Teal
];

/**
 * Calculates visual text pixel width based on character codes and font size.
 * `bold` applies a widening factor because bold glyphs render noticeably wider
 * than the regular-weight estimate used for node sizing.
 */
export function measureTextWidth(text: string, fontSize: number, bold = false): number {
  const charWidth = fontSize * 1.05;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 32) {
      w += fontSize * 0.35; // Space
    } else if (code > 127) {
      w += charWidth; // CJK and wide characters
    } else {
      w += charWidth * 0.75; // Latin/ASCII
    }
  }
  return bold ? w * 1.08 : w;
}

/**
 * Wraps text into multiple lines given an available inner width and font size.
 * Handles both explicit newlines ('\n') and automatic wrapping for long text.
 */
export function wrapMindmapText(
  rawText: string,
  maxAvailableWidth: number,
  fontSize: number
): string[] {
  if (!rawText) return [""];
  const safeMaxWidth = Math.max(40, maxAvailableWidth);
  const rawParagraphs = rawText.split(/\r?\n/);
  const resultLines: string[] = [];

  for (const para of rawParagraphs) {
    if (!para) {
      resultLines.push("");
      continue;
    }

    let currentLine = "";
    let currentLineWidth = 0;

    for (let i = 0; i < para.length; i++) {
      const char = para[i];
      const code = char.charCodeAt(0);
      const charW =
        code === 32
          ? fontSize * 0.35
          : code > 127
          ? fontSize * 1.05
          : fontSize * 0.75;

      if (currentLineWidth + charW > safeMaxWidth && currentLine.length > 0) {
        resultLines.push(currentLine);
        currentLine = char;
        currentLineWidth = charW;
      } else {
        currentLine += char;
        currentLineWidth += charW;
      }
    }

    if (currentLine.length > 0) {
      resultLines.push(currentLine);
    }
  }

  return resultLines.length > 0 ? resultLines : [""];
}

/**
 * Calculates adaptive or customized width, height, and wrapped text lines for a node.
 */
export function calculateNodeDimensions(
  node: MindmapNode
): { width: number; height: number; lines: string[] } {
  const isRoot = node.level === 0;
  const basePadX = isRoot ? 40 : 28;
  const basePadY = isRoot ? 14 : 10;
  const effectiveSize = node.fontSize || (isRoot ? 15 : 13);
  const lineHeight = Math.round(effectiveSize * 1.38);
  // Matches the renderer's default weight: root is bold unless overridden.
  const isBold = node.fontWeight ? node.fontWeight === "bold" : isRoot;

  const minAutoWidth = isRoot ? 72 : 56;
  const maxAutoWidth = isRoot ? 320 : 250;

  let width: number;
  let lines: string[];

  if (node.customWidth && node.customWidth > 0) {
    width = Math.max(minAutoWidth, Math.round(node.customWidth));
    const innerWidth = Math.max(30, width - basePadX);
    lines = wrapMindmapText(node.text, innerWidth, effectiveSize);
  } else {
    // Check if text with manual line breaks already fits within maxAutoWidth
    const rawParagraphs = (node.text || "").split(/\r?\n/);
    const maxParaWidth = Math.max(
      ...rawParagraphs.map((p) => measureTextWidth(p, effectiveSize, isBold)),
      0
    );

    if (maxParaWidth + basePadX <= maxAutoWidth) {
      width = Math.max(minAutoWidth, Math.round(maxParaWidth + basePadX));
      lines = rawParagraphs.length > 0 ? rawParagraphs : [""];
    } else {
      const innerWidth = maxAutoWidth - basePadX;
      lines = wrapMindmapText(node.text, innerWidth, effectiveSize);
      const maxLineWidth = Math.max(
        ...lines.map((l) => measureTextWidth(l, effectiveSize, isBold)),
        0
      );
      width = Math.max(minAutoWidth, Math.min(maxAutoWidth, Math.round(maxLineWidth + basePadX)));
    }
  }

  const baseMinHeight = isRoot ? 44 : 36;
  const textBlockHeight = lines.length * lineHeight;
  const requiredMinHeight = Math.max(baseMinHeight, textBlockHeight + basePadY * 2);

  let height = requiredMinHeight;
  if (node.customHeight && node.customHeight > 0) {
    // Custom height can expand node height, but text always stays contained inside the border
    height = Math.max(requiredMinHeight, Math.round(node.customHeight));
  }

  return { width, height, lines };
}

/** Horizontal gap between levels. Shared, so every layout spaces identically. */
const LEVEL_GAP = 72;
/** Vertical gap between siblings. */
const SIBLING_GAP = 18;
/**
 * Gap between levels in the layout that grows downwards.
 *
 * Smaller than LEVEL_GAP, which measures the space beside a node: nodes are
 * wider than they are tall, so the same number read vertically looks like a gap
 * rather than like structure.
 */
const VERTICAL_LEVEL_GAP = 56;
/** Where the top-left corner of a layout lands. */
const ORIGIN = 40;
/** Space kept around the content, beyond the outermost nodes. */
const BOUNDS_PADDING = 60;

/**
 * Lays the tree out.
 *
 * A layout is a view-level choice and nothing else: the tree, the document and
 * every node's own styling are untouched, so switching is instant and leaves
 * nothing to undo. The default is the rightward tree this file has always built,
 * and the golden snapshots in `mindmap-layouts.test.ts` hold it there — which is
 * also why the fallback below is the default rather than an error.
 */
export function layoutMindmap(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string> = new Set(),
  layoutId: MindmapLayoutId = DEFAULT_LAYOUT_ID
): MindmapLayoutResult {
  switch (layoutId) {
    case "bidirectional":
      return layoutBidirectionalTree(rootNode, collapsedIds);
    case "vertical":
      return layoutVerticalTree(rootNode, collapsedIds);
    default:
      return layoutLogicTree(rootNode, collapsedIds);
  }
}

/**
 * Vertical extent of a subtree: what its siblings are stacked by.
 *
 * This is the first pass of both layouts, and the reason they can differ only in
 * the second: a subtree takes the same vertical room whichever way it grows.
 */
function measureSubtree(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
  const { height: selfHeight } = calculateNodeDimensions(node);
  if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) {
    return selfHeight;
  }
  let totalHeight = 0;
  for (let i = 0; i < node.children.length; i++) {
    totalHeight += measureSubtree(node.children[i], collapsedIds);
    if (i > 0) totalHeight += SIBLING_GAP;
  }
  return Math.max(selfHeight, totalHeight);
}

/**
 * Horizontal extent of a subtree: what the layouts that grow downwards stack
 * siblings by.
 *
 * The exact transpose of `measureSubtree` — same recursion, same gaps, the other
 * axis. A separate function rather than a flag on the shared one, because the
 * two names say which axis the caller is working in and a boolean would not.
 */
function measureSubtreeWidth(node: MindmapNode, collapsedIds: ReadonlySet<string>): number {
  const { width } = calculateNodeDimensions(node);
  if (collapsedIds.has(node.id) || !node.children || node.children.length === 0) {
    return width;
  }
  let totalWidth = 0;
  for (let i = 0; i < node.children.length; i++) {
    totalWidth += measureSubtreeWidth(node.children[i], collapsedIds);
    if (i > 0) totalWidth += SIBLING_GAP;
  }
  return Math.max(width, totalWidth);
}

/** Room a row of siblings needs, stacked along the vertical axis. */
function stackHeight(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtree(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0
  );
}

/** Room a row of siblings needs, stacked along the horizontal axis. */
function stackWidth(children: MindmapNode[], collapsedIds: ReadonlySet<string>): number {
  return children.reduce(
    (sum, child, i) => sum + measureSubtreeWidth(child, collapsedIds) + (i > 0 ? SIBLING_GAP : 0),
    0
  );
}

/**
 * One placed node: the tree node, plus the position the layout chose for it.
 *
 * Shared by every layout so that a style field added to `MindmapNode` reaches
 * all of them at once. Three copies of this literal would be three places to
 * forget, and the symptom — a node that quietly loses its colour in one layout
 * only — would be found by a reader rather than by a test.
 */
function makeLayoutNode(
  node: MindmapNode,
  position: { x: number; y: number },
  dimensions: { width: number; height: number; lines: string[] },
  side: MindmapLayoutSide,
  colorIndex: number,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutNode {
  return {
    id: node.id,
    text: node.text,
    lines: dimensions.lines,
    level: node.level,
    line: node.line,
    x: position.x,
    y: position.y,
    width: dimensions.width,
    height: dimensions.height,
    children: [],
    hasChildren: !!(node.children && node.children.length > 0),
    collapsed: collapsedIds.has(node.id),
    colorIndex,
    side,
    color: node.color,
    shape: node.shape,
    lineColor: node.lineColor,
    lineStyle: node.lineStyle,
    fontSize: node.fontSize,
    fontWeight: node.fontWeight,
    textColor: node.textColor,
    borderColor: node.borderColor,
    textAlign: node.textAlign,
    customWidth: node.customWidth,
    customHeight: node.customHeight,
  };
}

/**
 * Moves a finished layout so its top-left corner sits at the origin.
 *
 * Done after placement rather than during it, because how far a map reaches in
 * each direction is only known once it is complete — the bidirectional layout
 * cannot know what to leave on the left until the left side has been laid out.
 * Connectors are built after this, since a path is absolute coordinates.
 */
function shiftToOrigin(nodes: MindmapLayoutNode[]): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  for (const node of nodes) {
    node.x += ORIGIN - minX;
    node.y += ORIGIN - minY;
  }
}

/**
 * The connector into a child, in the shape that child asked for.
 *
 * Shared rather than written once per layout, because layouts differ in which
 * edges they connect and in nothing else: a switched map keeps the same curves,
 * and a fix to how a bezier is drawn lands in all of them at once.
 *
 * The axis is what the shape is drawn along, and it matters: `step` and `bezier`
 * both bend a horizontal run into the child, and used unchanged on a map that
 * grows downwards they would bend sideways across the level below. Rotating the
 * shape keeps the reader's expectation that a connector leaves its parent
 * heading towards its child.
 */
function buildEdgePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  style: MindmapLineStyle,
  axis: "horizontal" | "vertical" = "horizontal"
): string {
  if (style === "straight") {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  if (axis === "vertical") {
    const midY = (fromY + toY) / 2;
    return style === "step"
      ? `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`
      : `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }
  const midX = (fromX + toX) / 2;
  return style === "step"
    ? `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

/** Everything that was placed, plus room to breathe. */
function layoutBounds(nodes: MindmapLayoutNode[]): MindmapLayoutResult["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  return {
    minX: Math.max(0, minX - BOUNDS_PADDING),
    minY: Math.max(0, minY - BOUNDS_PADDING),
    maxX: maxX + BOUNDS_PADDING,
    maxY: maxY + BOUNDS_PADDING,
    width: maxX - minX + BOUNDS_PADDING * 2,
    height: maxY - minY + BOUNDS_PADDING * 2,
  };
}

/**
 * Computes a 2D horizontal tree layout for the mindmap.
 *
 * Every node grows to the right, and the map hangs off the root's left edge at
 * the origin. This is the layout every existing document has, which is why it is
 * also the one that must not change.
 */
function layoutLogicTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  const allEdges: MindmapLayoutResult["edges"] = [];

  // Second pass: assign (x, y) coordinates
  function positionSubtree(
    node: MindmapNode,
    startX: number,
    topY: number,
    colorIndex: number
  ): MindmapLayoutNode {
    const isCollapsed = collapsedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const { width, height, lines } = calculateNodeDimensions(node);
    const subtreeHeight = measureSubtree(node, collapsedIds);

    // Center node vertically within its subtree allocation
    const nodeY = topY + (subtreeHeight - height) / 2;

    const layoutNode = makeLayoutNode(
      node,
      { x: startX, y: nodeY },
      { width, height, lines },
      "right",
      colorIndex,
      collapsedIds
    );
    allNodes.push(layoutNode);

    if (!isCollapsed && hasChildren) {
      let currentChildTopY = topY;
      const childStartX = startX + width + LEVEL_GAP;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // Each top-level child gets its own branch color; deeper descendants inherit parent's branch color
        const childColorIndex = node.level === 0 ? i % BRANCH_COLORS.length : colorIndex;
        const childLayout = positionSubtree(
          child,
          childStartX,
          currentChildTopY,
          childColorIndex
        );
        layoutNode.children.push(childLayout);

        // Generate connector path according to lineStyle
        const fromX = startX + width;
        const fromY = nodeY + height / 2;
        const toX = childLayout.x;
        const toY = childLayout.y + childLayout.height / 2;

        const edgeLineStyle = child.lineStyle || node.lineStyle || "bezier";
        const edgeColor = child.lineColor || node.lineColor;

        const d = buildEdgePath(fromX, fromY, toX, toY, edgeLineStyle);

        allEdges.push({
          fromId: node.id,
          toId: child.id,
          d,
          colorIndex: childColorIndex,
          color: edgeColor,
          style: edgeLineStyle,
        });

        currentChildTopY += measureSubtree(child, collapsedIds) + SIBLING_GAP;
      }
    }

    return layoutNode;
  }

  const rootLayout = positionSubtree(rootNode, ORIGIN, ORIGIN, 0);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: allEdges,
    bounds: layoutBounds(allNodes),
  };
}

/**
 * Root in the middle, with the first-level branches dealt to either side.
 *
 * The dealing rule is "in document order, to whichever side is shorter so far".
 * Not "the first half one way, the second half the other", which leaves a map
 * with one heavy branch and four light ones lopsided; and not alternating, which
 * would renumber the branches visually and break the reading order. Dealing in
 * order keeps the document's own sequence intact within each side.
 *
 * Only the first level is split. A branch dealt to the left grows further left
 * and its descendants inherit that side — turning each generation round again
 * produces a comb, not a map.
 */
function layoutBidirectionalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutResult {
  type Branch = { node: MindmapNode; colorIndex: number; height: number };

  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  const totalHeight = (branches: Branch[]): number =>
    branches.reduce((sum, branch, i) => sum + branch.height + (i > 0 ? SIBLING_GAP : 0), 0);

  function placeNode(
    node: MindmapNode,
    x: number,
    y: number,
    side: MindmapLayoutSide,
    colorIndex: number
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const layoutNode = makeLayoutNode(node, { x, y }, dimensions, side, colorIndex, collapsedIds);
    allNodes.push(layoutNode);
    placed.set(node.id, layoutNode);
    return layoutNode;
  }

  /**
   * Lays out one side of a node, stacking the branches around the node's centre.
   *
   * `anchorX` is the edge the connector arrives at — the parent's right edge for
   * a branch growing right, its left edge for one growing left — and everything
   * below hangs off it.
   */
  function placeSubtree(
    node: MindmapNode,
    anchorX: number,
    topY: number,
    direction: 1 | -1,
    side: MindmapLayoutSide,
    colorIndex: number
  ): MindmapLayoutNode {
    const { width, height } = calculateNodeDimensions(node);
    const subtreeHeight = measureSubtree(node, collapsedIds);
    const x = direction === 1 ? anchorX : anchorX - width;
    const layoutNode = placeNode(node, x, topY + (subtreeHeight - height) / 2, side, colorIndex);

    const isCollapsed = collapsedIds.has(node.id);
    if (!isCollapsed && node.children && node.children.length > 0) {
      const childAnchorX = direction === 1 ? x + width + LEVEL_GAP : x - LEVEL_GAP;
      let childTop =
        layoutNode.y + height / 2 - stackHeight(node.children, collapsedIds) / 2;
      for (const child of node.children) {
        placeSubtree(child, childAnchorX, childTop, direction, side, colorIndex);
        childTop += measureSubtree(child, collapsedIds) + SIBLING_GAP;
      }
    }

    return layoutNode;
  }

  const rootDims = calculateNodeDimensions(rootNode);
  const rootCenterY = 0;
  // Placed around the origin and shifted into place at the end, because how far
  // the left side reaches is only known once it has been laid out.
  const rootLayout = placeNode(rootNode, 0, rootCenterY - rootDims.height / 2, "right", 0);

  const rightSide: Branch[] = [];
  const leftSide: Branch[] = [];
  if (!collapsedIds.has(rootNode.id) && rootNode.children) {
    rootNode.children.forEach((child, index) => {
      const branch: Branch = {
        node: child,
        // The colour comes from the child's position in the document, never from
        // the side it was dealt to: switching layouts must not recolour a branch.
        colorIndex: index % BRANCH_COLORS.length,
        height: measureSubtree(child, collapsedIds),
      };
      const target = totalHeight(leftSide) < totalHeight(rightSide) ? leftSide : rightSide;
      target.push(branch);
    });
  }

  function placeSide(branches: Branch[], side: MindmapLayoutSide) {
    if (branches.length === 0) return;
    const direction = side === "right" ? 1 : -1;
    const anchorX =
      side === "right" ? rootLayout.x + rootLayout.width + LEVEL_GAP : rootLayout.x - LEVEL_GAP;
    let top = rootCenterY - totalHeight(branches) / 2;
    for (const branch of branches) {
      placeSubtree(branch.node, anchorX, top, direction, side, branch.colorIndex);
      top += branch.height + SIBLING_GAP;
    }
  }

  placeSide(rightSide, "right");
  placeSide(leftSide, "left");

  shiftToOrigin(allNodes);

  const allEdges: MindmapLayoutResult["edges"] = [];
  (function collectEdges(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      // A collapsed node keeps its children in the tree but shows none of them.
      if (!childLayout) continue;

      const growsLeft = childLayout.side === "left";
      const fromX = growsLeft ? parent.x : parent.x + parent.width;
      const toX = growsLeft ? childLayout.x + childLayout.width : childLayout.x;
      const style = child.lineStyle || node.lineStyle || "bezier";

      allEdges.push({
        fromId: node.id,
        toId: child.id,
        d: buildEdgePath(
          fromX,
          parent.y + parent.height / 2,
          toX,
          childLayout.y + childLayout.height / 2,
          style
        ),
        colorIndex: childLayout.colorIndex,
        color: child.lineColor || node.lineColor,
        style,
      });
      collectEdges(child);
    }
  })(rootNode);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: allEdges,
    bounds: layoutBounds(allNodes),
  };
}

/**
 * Root at the top, levels going down, siblings side by side.
 *
 * The transpose of the default layout, for an outline that is wide and shallow:
 * twenty first-level items read as one row instead of as a column taller than
 * any screen. Placement and the branch-colour rule follow the default exactly,
 * so switching between the two keeps every branch the colour it had.
 */
function layoutVerticalTree(
  rootNode: MindmapNode,
  collapsedIds: ReadonlySet<string>
): MindmapLayoutResult {
  const allNodes: MindmapLayoutNode[] = [];
  /** Placed nodes by id, so the connector pass can read final coordinates. */
  const placed = new Map<string, MindmapLayoutNode>();

  function place(
    node: MindmapNode,
    centreX: number,
    topY: number,
    colorIndex: number
  ): MindmapLayoutNode {
    const dimensions = calculateNodeDimensions(node);
    const isCollapsed = collapsedIds.has(node.id);
    const layoutNode = makeLayoutNode(
      node,
      { x: centreX - dimensions.width / 2, y: topY },
      dimensions,
      "bottom",
      colorIndex,
      collapsedIds
    );
    allNodes.push(layoutNode);
    placed.set(node.id, layoutNode);

    if (!isCollapsed && node.children && node.children.length > 0) {
      // The row of children is centred on the parent rather than left-aligned to
      // it: a parent with one child would otherwise look like the start of a
      // column instead of the head of a tree.
      let bandLeft = centreX - stackWidth(node.children, collapsedIds) / 2;
      const childTop = topY + dimensions.height + VERTICAL_LEVEL_GAP;
      node.children.forEach((child, index) => {
        const band = measureSubtreeWidth(child, collapsedIds);
        // Each first-level child gets its own branch colour; deeper descendants
        // inherit their branch's, exactly as in the other layouts.
        const childColorIndex = node.level === 0 ? index % BRANCH_COLORS.length : colorIndex;
        place(child, bandLeft + band / 2, childTop, childColorIndex);
        bandLeft += band + SIBLING_GAP;
      });
    }

    return layoutNode;
  }

  const rootLayout = place(rootNode, 0, 0, 0);
  shiftToOrigin(allNodes);

  return {
    root: rootLayout,
    nodes: allNodes,
    edges: collectVerticalEdges(rootNode, placed),
    bounds: layoutBounds(allNodes),
  };
}

/**
 * Connectors for the layouts that grow downwards: bottom edge to top edge.
 *
 * Built after placement rather than during it, because a map is shifted into
 * place once it is complete and a path is absolute coordinates.
 */
function collectVerticalEdges(
  rootNode: MindmapNode,
  placed: Map<string, MindmapLayoutNode>
): MindmapLayoutResult["edges"] {
  const allEdges: MindmapLayoutResult["edges"] = [];

  (function walk(node: MindmapNode) {
    const parent = placed.get(node.id);
    if (!parent || !node.children) return;
    for (const child of node.children) {
      const childLayout = placed.get(child.id);
      // A collapsed node keeps its children in the tree but shows none of them.
      if (!childLayout) continue;

      const style = child.lineStyle || node.lineStyle || "bezier";
      allEdges.push({
        fromId: node.id,
        toId: child.id,
        d: buildEdgePath(
          parent.x + parent.width / 2,
          parent.y + parent.height,
          childLayout.x + childLayout.width / 2,
          childLayout.y,
          style,
          "vertical"
        ),
        colorIndex: childLayout.colorIndex,
        color: child.lineColor || node.lineColor,
        style,
      });
      walk(child);
    }
  })(rootNode);

  return allEdges;
}

export function updateNodeStyle(
  tree: MindmapNode,
  nodeId: string,
  styles: {
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
  }
): MindmapNode {
  return updateNodesStyle(tree, [nodeId], styles);
}

export function updateNodesStyle(
  tree: MindmapNode,
  nodeIds: string[],
  styles: {
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
  }
): MindmapNode {
  const nextTree = cloneTree(tree);
  const idSet = new Set(nodeIds);

  function applyStyles(node: MindmapNode) {
    if (idSet.has(node.id)) {
      if ("color" in styles) node.color = styles.color || undefined;
      if ("shape" in styles) node.shape = styles.shape || undefined;
      if ("lineColor" in styles) node.lineColor = styles.lineColor || undefined;
      if ("lineStyle" in styles) node.lineStyle = styles.lineStyle || undefined;
      if ("fontSize" in styles) node.fontSize = styles.fontSize || undefined;
      if ("fontWeight" in styles) node.fontWeight = styles.fontWeight || undefined;
      if ("textColor" in styles) node.textColor = styles.textColor || undefined;
      if ("borderColor" in styles) node.borderColor = styles.borderColor || undefined;
      if ("textAlign" in styles) node.textAlign = styles.textAlign || undefined;
      if ("customWidth" in styles) {
        node.customWidth = styles.customWidth && styles.customWidth > 0 ? Math.round(styles.customWidth) : undefined;
      }
      if ("customHeight" in styles) {
        node.customHeight = styles.customHeight && styles.customHeight > 0 ? Math.round(styles.customHeight) : undefined;
      }
    }
    if (node.children) {
      for (const child of node.children) {
        applyStyles(child);
      }
    }
  }

  applyStyles(nextTree);
  return nextTree;
}

/**
 * Copies a branch for later pasting, with fresh ids.
 *
 * Ids are regenerated rather than carried over. Node ids here are derived from
 * a document's structure — `node-<path>-<index>` — so pasting a copy that kept
 * its ids would produce two nodes claiming the same one, and every lookup by id
 * would find whichever came first. Regenerating at copy time rather than paste
 * time also means the same clipboard contents can be pasted repeatedly without
 * the second paste colliding with the first.
 *
 * Styles come along, because a copied branch that lost its colours would be a
 * worse answer than no copy at all.
 */
export function copySubtree(tree: MindmapNode, nodeId: string): MindmapNode | null {
  const source = findNode(tree, nodeId);
  if (!source) return null;

  const stamp = (node: MindmapNode, level: number): MindmapNode => ({
    ...node,
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    children: (node.children ?? []).map((child) => stamp(child, level + 1)),
  });

  // The clipboard copy is detached: it is data, not part of the tree, and
  // nothing should be able to mutate one through the other.
  return stamp(JSON.parse(JSON.stringify(source)) as MindmapNode, source.level);
}

/**
 * Attaches a copied branch under a node.
 *
 * Returns null when there is nothing to paste. The parent falls back to the
 * root, so a paste with an empty selection still lands somewhere sensible
 * instead of being silently dropped.
 */
export function pasteSubtree(
  tree: MindmapNode,
  parentId: string | undefined,
  subtree: MindmapNode
): { nextTree: MindmapNode; newNodeId: string } | null {
  if (!subtree) return null;

  const nextTree = cloneTree(tree);
  const parent = (parentId ? findNode(nextTree, parentId) : null) ?? nextTree;

  const restamp = (node: MindmapNode, level: number): MindmapNode => ({
    ...node,
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    children: (node.children ?? []).map((child) => restamp(child, level + 1)),
  });

  const attached = restamp(subtree, parent.level + 1);
  if (!parent.children) parent.children = [];
  parent.children.push(attached);

  return { nextTree, newNodeId: attached.id };
}

/**
 * Where a dragged node should land when it is dropped on another one.
 *
 * Returns the parent to attach it to and the position among that parent's
 * children, or null when the move means nothing — onto itself, or onto one of
 * its own descendants, which reparentNode would refuse anyway.
 *
 * Lives here rather than in the view so the arithmetic can be tested without a
 * rendered canvas. Two subtleties it exists to get right:
 *
 * - Dropping "after" the node below itself still lands in the right place,
 *   because detaching the node shifts everything after it down by one. The
 *   index is corrected before it is returned.
 * - The root has no siblings, so a before/after drop on it is meaningless and
 *   returns null; the caller falls back to a child drop.
 */
export function planDrop(
  tree: MindmapNode,
  movingNodeId: string,
  targetId: string,
  position: "before" | "after" | "child"
): { parentId: string; index: number } | null {
  if (movingNodeId === targetId) return null;

  const moving = findNode(tree, movingNodeId);
  if (moving && findNode(moving, targetId)) return null;

  if (position === "child") {
    const target = findNode(tree, targetId);
    return { parentId: targetId, index: target?.children?.length ?? 0 };
  }

  const parent = findParent(tree, targetId);
  if (!parent) return null;

  const siblings = parent.children ?? [];
  const targetIndex = siblings.findIndex((child) => child.id === targetId);
  if (targetIndex === -1) return null;

  const movingIndex = siblings.findIndex((child) => child.id === movingNodeId);
  let index = position === "before" ? targetIndex : targetIndex + 1;
  if (movingIndex !== -1 && movingIndex < index) index -= 1;

  return { parentId: parent.id, index };
}

/**
 * Moves a node towards the front or the back among its own siblings.
 *
 * `delta` is -1 or +1. Returns the tree it was given when the node is already
 * at that end, so a caller can tell a no-op from a move — which matters because
 * a move pushes an undo entry and a no-op must not.
 *
 * Built on planDrop rather than reimplementing the index arithmetic: moving a
 * node down and dropping it after the sibling it passes are the same problem,
 * including the shift correction, and having one implementation means the two
 * cannot disagree.
 */
export function moveWithinSiblings(
  tree: MindmapNode,
  nodeId: string,
  delta: number
): MindmapNode {
  const parent = findParent(tree, nodeId);
  if (!parent) return tree;

  const siblings = parent.children ?? [];
  const index = siblings.findIndex((child) => child.id === nodeId);
  if (index === -1) return tree;

  const target = index + delta;
  if (target < 0 || target >= siblings.length) return tree;

  const plan = planDrop(tree, nodeId, siblings[target].id, delta < 0 ? "before" : "after");
  if (!plan) return tree;
  return reparentNode(tree, nodeId, plan.parentId, plan.index);
}

/**
 * Moves a node (and all its descendants) to become a child of newParentId,
 * or reorders it among newParent's children.
 * Includes cycle prevention (cannot move a node into itself or any of its descendants).
 */
export function reparentNode(
  root: MindmapNode,
  movingNodeId: string,
  newParentId: string,
  targetIndex?: number
): MindmapNode {
  // Root node cannot be moved, and cannot move node to itself
  if (movingNodeId === root.id || movingNodeId === newParentId) {
    return root;
  }

  const clone = cloneTree(root);

  // Helper: find node by id
  const findNode = (n: MindmapNode, id: string): MindmapNode | null => {
    if (n.id === id) return n;
    for (const child of n.children) {
      const res = findNode(child, id);
      if (res) return res;
    }
    return null;
  };

  // Helper: check if targetId is inside node's subtree (cycle prevention)
  const isDescendant = (parent: MindmapNode, targetId: string): boolean => {
    for (const child of parent.children) {
      if (child.id === targetId) return true;
      if (isDescendant(child, targetId)) return true;
    }
    return false;
  };

  const movingNode = findNode(clone, movingNodeId);
  if (!movingNode) return root;

  // Prevent dragging into own descendant (would cause loop)
  if (isDescendant(movingNode, newParentId)) {
    return root;
  }

  const newParent = findNode(clone, newParentId);
  if (!newParent) return root;

  // Remove movingNode from its old parent
  const removeNode = (parent: MindmapNode, id: string): MindmapNode | null => {
    const idx = parent.children.findIndex((c) => c.id === id);
    if (idx !== -1) {
      return parent.children.splice(idx, 1)[0];
    }
    for (const child of parent.children) {
      const found = removeNode(child, id);
      if (found) return found;
    }
    return null;
  };

  const detachedNode = removeNode(clone, movingNodeId);
  if (!detachedNode) return root;

  // Update level of detachedNode and its descendants
  const updateLevels = (node: MindmapNode, level: number) => {
    node.level = level;
    for (const child of node.children) {
      updateLevels(child, level + 1);
    }
  };
  updateLevels(detachedNode, newParent.level + 1);

  // Insert into newParent's children
  if (typeof targetIndex === "number" && targetIndex >= 0 && targetIndex <= newParent.children.length) {
    newParent.children.splice(targetIndex, 0, detachedNode);
  } else {
    newParent.children.push(detachedNode);
  }

  return clone;
}

/**
 * Finds all node IDs that contain the search query
 */
export function searchMindmapNodes(root: MindmapNode, query: string): string[] {
  const clean = (query || "").trim().toLowerCase();
  if (!clean) return [];

  const matches: string[] = [];
  const traverse = (node: MindmapNode) => {
    if (node.text.toLowerCase().includes(clean)) {
      matches.push(node.id);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };
  traverse(root);
  return matches;
}

export {
  escapeXml,
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToMarkdownOutline,
} from "./mindmapExport";
