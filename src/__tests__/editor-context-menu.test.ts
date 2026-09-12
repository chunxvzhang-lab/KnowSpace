import { describe, expect, it } from "vitest";

describe("editorContextMenu utilities & transformations", () => {
  it("generates markdown block references with proper format", () => {
    const blockId = "block-xyz123";
    const docName = "2026架构设计";
    const refLink = `[[${docName}#^${blockId}]]`;
    expect(refLink).toBe("[[2026架构设计#^block-xyz123]]");
  });

  it("handles line prefix replacements for headings, todos, lists and quotes", () => {
    const rawLine = "核心需求与开发目标";

    // Heading 1
    const h1 = rawLine.replace(/^(\s*)(#{1,6}\s+)?/, "$1# ");
    expect(h1).toBe("# 核心需求与开发目标");

    // Todo item
    const todo = rawLine.replace(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$1- [ ] ");
    expect(todo).toBe("- [ ] 核心需求与开发目标");

    // Bullet list
    const bullet = rawLine.replace(/^(\s*)([-*+]|\d+\.)?\s*(\[[ xX]\]\s*)?/, "$1- ");
    expect(bullet).toBe("- 核心需求与开发目标");

    // Blockquote
    const quote = rawLine.replace(/^(\s*)(>\s*)?/, "$1> ");
    expect(quote).toBe("> 核心需求与开发目标");
  });

  it("extracts clean suggested title from selected text", () => {
    const multilineSelection = "# 敏捷开发规范\n第一条：每日站会\n第二条：快速交付";
    const defaultTitle = multilineSelection
      .split(/\r?\n/)[0]
      .replace(/[#*`_\[\]]/g, "")
      .trim()
      .slice(0, 30);

    expect(defaultTitle).toBe("敏捷开发规范");
  });

  it("calculates accurate word and character statistics for document and selection", () => {
    const docText = "KnowSpace 个人知识工作台 2026";
    const totalChars = docText.length;
    const words = docText.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_-]+/g) || [];
    expect(totalChars).toBe(22);
    // "KnowSpace", "个", "人", "知", "识", "工", "作", "台", "2026"
    expect(words.length).toBe(9);
  });

  it("handles right-click cursor repositioning: keeps selection if inside, repositions if outside", () => {
    const selection = { from: 10, to: 25, empty: false };

    const checkClick = (pos: number) => {
      const isInside = !selection.empty && pos >= selection.from && pos <= selection.to;
      return isInside ? "keep_selection" : "move_cursor";
    };

    expect(checkClick(15)).toBe("keep_selection");
    expect(checkClick(10)).toBe("keep_selection");
    expect(checkClick(25)).toBe("keep_selection");
    expect(checkClick(5)).toBe("move_cursor");
    expect(checkClick(30)).toBe("move_cursor");
  });

  it("guards extract-to-note against dialog cancellation", () => {
    let textReplaced = false;
    const onExtract = (res: { canceled: boolean; success: boolean; title?: string }) => {
      if (res.canceled || !res.success) {
        return; // aborted
      }
      textReplaced = true;
    };

    onExtract({ canceled: true, success: false });
    expect(textReplaced).toBe(false);

    onExtract({ canceled: false, success: true, title: "有效笔记" });
    expect(textReplaced).toBe(true);
  });
});

describe("tableGenerator and menu positioning algorithms", () => {
  it("generates markdown table with custom rows and columns", async () => {
    const { generateMarkdownTable } = await import("../services/tableGenerator");

    // Test 3x3 table
    const table3x3 = generateMarkdownTable(3, 3);
    expect(table3x3.markdown).toContain("| 标题 1 | 标题 2 | 标题 3 |");
    expect(table3x3.markdown).toContain("| :--- | :--- | :--- |");
    expect(table3x3.markdown).toContain("| 内容 1-1 | 内容 1-2 | 内容 1-3 |");
    expect(table3x3.markdown).toContain("| 内容 2-1 | 内容 2-2 | 内容 2-3 |");
    expect(table3x3.cursorOffset).toBeGreaterThan(0);

    // Test 2x4 table (2 rows total = 1 header + 1 data row, 4 columns)
    const table2x4 = generateMarkdownTable(2, 4);
    expect(table2x4.markdown).toContain("| 标题 1 | 标题 2 | 标题 3 | 标题 4 |");
    expect(table2x4.markdown).toContain("| 内容 1-1 | 内容 1-2 | 内容 1-3 | 内容 1-4 |");
    expect(table2x4.markdown).not.toContain("内容 2-1");

    // Test 1x1 table
    const table1x1 = generateMarkdownTable(1, 1);
    expect(table1x1.markdown).toContain("| 标题 1 |");
    expect(table1x1.markdown).toContain("| :--- |");
    expect(table1x1.markdown).toContain("| 内容 1-1 |");
  });

  it("clamps invalid or out-of-range table dimensions safely", async () => {
    const { generateMarkdownTable } = await import("../services/tableGenerator");

    // Clamps negative / zero to 1
    const clampedZero = generateMarkdownTable(0, -5);
    expect(clampedZero.markdown).toContain("| 标题 1 |");
    expect(clampedZero.markdown).toContain("| :--- |");

    // Clamps excessive columns to 30
    const clampedCols = generateMarkdownTable(2, 100);
    expect(clampedCols.markdown).toContain("| 标题 30 |");
    expect(clampedCols.markdown).not.toContain("| 标题 31 |");
  });

  it("clamps menu position within viewport bounds preventing bottom/right overflow", async () => {
    const { clampMenuPosition } = await import("../services/tableGenerator");
    const viewport = { width: 1000, height: 600 };

    // Case 1: normal coordinates inside bounds
    const normal = clampMenuPosition(100, 100, 260, 400, viewport, 12);
    expect(normal).toEqual({ left: 100, top: 100 });

    // Case 2: x overflows right boundary
    const rightOverflow = clampMenuPosition(900, 100, 260, 400, viewport, 12);
    expect(rightOverflow.left).toBe(1000 - 260 - 12); // 728
    expect(rightOverflow.top).toBe(100);

    // Case 3: y overflows bottom boundary
    const bottomOverflow = clampMenuPosition(100, 500, 260, 400, viewport, 12);
    expect(bottomOverflow.left).toBe(100);
    expect(bottomOverflow.top).toBe(600 - 400 - 12); // 188

    // Case 4: menu height larger than viewport height -> top clamped to padding
    const hugeMenu = clampMenuPosition(100, 400, 260, 700, viewport, 12);
    expect(hugeMenu.top).toBe(12);
  });

  it("calculates submenu coordinates with horizontal flip and vertical adjustment", async () => {
    const { calculateSubmenuPosition } = await import("../services/tableGenerator");
    const viewport = { width: 1000, height: 700 };

    // Case 1: plenty of space on right
    const anchor1 = { left: 200, right: 450, top: 300, bottom: 330, width: 250, height: 30 } as DOMRect;
    const pos1 = calculateSubmenuPosition(anchor1, 200, 250, viewport, 12);
    expect(pos1.left).toBe(454); // anchor.right + 4
    expect(pos1.top).toBe(296); // anchor.top - 4

    // Case 2: right edge would overflow -> flips to left
    const anchor2 = { left: 850, right: 980, top: 200, bottom: 230, width: 130, height: 30 } as DOMRect;
    const pos2 = calculateSubmenuPosition(anchor2, 200, 250, viewport, 12);
    expect(pos2.left).toBe(850 - 200 - 4); // 646 (anchor.left - submenuWidth - 4)

    // Case 3: bottom edge would overflow -> shifts up to fit inside viewport
    const anchor3 = { left: 200, right: 450, top: 600, bottom: 630, width: 250, height: 30 } as DOMRect;
    const pos3 = calculateSubmenuPosition(anchor3, 200, 250, viewport, 12);
    expect(pos3.top).toBe(700 - 250 - 12); // 438
  });
});
