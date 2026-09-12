/**
 * Table Generator & Viewport Positioning Utilities for Editor Context Menu
 */

export interface TableGenerationResult {
  markdown: string;
  cursorOffset: number;
}

/**
 * Generate standard GitHub Flavored Markdown (GFM) table
 * @param rows Total number of rows including header (e.g. rows=3 => 1 header + 2 content rows)
 * @param cols Number of columns
 */
export function generateMarkdownTable(
  rows: number,
  cols: number
): TableGenerationResult {
  const safeCols = Math.max(1, Math.min(Math.round(cols) || 1, 30));
  const safeRows = Math.max(1, Math.min(Math.round(rows) || 1, 100));

  // 1. Header row
  const headerCells = Array.from(
    { length: safeCols },
    (_, i) => ` 标题 ${i + 1} `
  );
  const headerLine = `|${headerCells.join("|")}|`;

  // 2. Separator row
  const sepCells = Array.from({ length: safeCols }, () => " :--- ");
  const sepLine = `|${sepCells.join("|")}|`;

  // 3. Content rows (rows - 1 content rows if rows > 1, or 1 content row if rows is 1)
  const contentRowCount = safeRows > 1 ? safeRows - 1 : 1;
  const contentLines: string[] = [];

  for (let r = 1; r <= contentRowCount; r++) {
    const rowCells = Array.from(
      { length: safeCols },
      (_, c) => ` 内容 ${r}-${c + 1} `
    );
    contentLines.push(`|${rowCells.join("|")}|`);
  }

  const markdown = `${headerLine}\n${sepLine}\n${contentLines.join("\n")}\n\n`;

  // Cursor offset placed right after first header title: "| 标题 1"
  const cursorOffset = Math.min(markdown.length, `| 标题 1`.length);

  return { markdown, cursorOffset };
}

export interface ViewportRect {
  width: number;
  height: number;
}

export interface ViewportCoords {
  left: number;
  top: number;
}

/**
 * Clamp a context menu position safely within the viewport boundaries
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewport: ViewportRect = {
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  },
  padding = 12
): ViewportCoords {
  const maxLeft = Math.max(padding, viewport.width - menuWidth - padding);
  const maxTop = Math.max(padding, viewport.height - menuHeight - padding);

  const left = Math.max(padding, Math.min(x, maxLeft));
  const top = Math.max(padding, Math.min(y, maxTop));

  return { left, top };
}

/**
 * Calculate fixed viewport coordinates for a submenu, flipping to left if right edge overflows,
 * and shifting up if bottom edge overflows.
 */
export function calculateSubmenuPosition(
  anchorRect: DOMRect,
  submenuWidth: number,
  submenuHeight: number,
  viewport: ViewportRect = {
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  },
  padding = 12
): ViewportCoords {
  // Horizontal: prefer right of anchor, flip to left if overflows
  let left = anchorRect.right + 4;
  if (left + submenuWidth > viewport.width - padding) {
    left = Math.max(padding, anchorRect.left - submenuWidth - 4);
  }

  // Vertical: align with top of anchor item, clamp to viewport bottom
  let top = anchorRect.top - 4;
  if (top + submenuHeight > viewport.height - padding) {
    top = Math.max(padding, viewport.height - submenuHeight - padding);
  }

  return { left, top };
}
