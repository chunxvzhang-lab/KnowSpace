import type { MindmapNode } from "../core/types";

/*
 * Text measurement and node sizing for the mindmap. Pure arithmetic — no DOM,
 * no canvas — so it can run anywhere the layout or the tests need it.
 */

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
  fontSize: number,
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
      const charW = code === 32 ? fontSize * 0.35 : code > 127 ? fontSize * 1.05 : fontSize * 0.75;

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
export function calculateNodeDimensions(node: MindmapNode): {
  width: number;
  height: number;
  lines: string[];
} {
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
      0,
    );

    if (maxParaWidth + basePadX <= maxAutoWidth) {
      width = Math.max(minAutoWidth, Math.round(maxParaWidth + basePadX));
      lines = rawParagraphs.length > 0 ? rawParagraphs : [""];
    } else {
      const innerWidth = maxAutoWidth - basePadX;
      lines = wrapMindmapText(node.text, innerWidth, effectiveSize);
      const maxLineWidth = Math.max(
        ...lines.map((l) => measureTextWidth(l, effectiveSize, isBold)),
        0,
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
