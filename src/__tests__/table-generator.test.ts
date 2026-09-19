import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import {
  calculateSubmenuPosition,
  clampMenuPosition,
  generateMarkdownTable,
} from "../services/tableGenerator";

/**
 * The table the context menu inserts, and where its menus open.
 *
 * The module has no tests before this file, and reading it turned up two things that
 * looked wrong and are not — both are choices the code states in its own comments. They
 * are pinned here so the next reader does not "fix" either of them:
 *
 * - `rows` counts the header, **except** that one row still produces one body row, so
 *   that the smallest pick in the grid gives something to type in;
 * - the submenu's vertical clamp handles the bottom edge only, because the anchor is a
 *   row of a menu that is itself already inside the viewport.
 */
const md = new MarkdownIt();

/** The rows of a rendered table, so the assertions are about the table and not the text. */
function renderTable(markdown: string): string[][] {
  const html = md.render(markdown);
  const rows = html.split("<tr>").slice(1);
  return rows.map((row) =>
    Array.from(row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)).map((cell) => cell[1])
  );
}

describe("表格生成器", () => {
  it("生成一个 GFM 能认出来的表格", () => {
    // The end that matters: not "the string looks right" but "a parser makes a table of
    // it" — the same parser the editor's preview uses.
    const { markdown } = generateMarkdownTable(3, 3);
    const rows = renderTable(markdown);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === 3)).toBe(true);
    // The first row is the header, and the cells say so.
    expect(rows[0]).toEqual(["标题 1", "标题 2", "标题 3"]);
    expect(md.render(markdown)).toContain("<table>");
  });

  it("行数含表头，所以 3 行是 1 表头 + 2 正文", () => {
    expect(renderTable(generateMarkdownTable(3, 2).markdown)).toHaveLength(3);
    expect(renderTable(generateMarkdownTable(6, 2).markdown)).toHaveLength(6);
  });

  it("只要求 1 行时，仍然给一行正文（写明的选择，不要「修」它）", () => {
    // The comment says so: `rows > 1 ? rows - 1 : 1`. The smallest pick in the context
    // menu's grid is 1×1, and a table with a header and nothing under it is a table
    // nobody can type into — so the author chose a usable one over a literal one.
    expect(renderTable(generateMarkdownTable(1, 1).markdown)).toHaveLength(2);
  });

  it("行列都被夹在合理范围内", () => {
    // Clamping rather than rejecting: the picker is a grid, and these numbers arrive
    // from it, so the only job here is to never produce a table nobody asked for.
    expect(renderTable(generateMarkdownTable(0, 0).markdown)[0]).toHaveLength(1);
    expect(renderTable(generateMarkdownTable(1, -5).markdown)[0]).toHaveLength(1);
    expect(renderTable(generateMarkdownTable(-3, 2).markdown)).toHaveLength(2);
    expect(renderTable(generateMarkdownTable(1.4, 2.6).markdown)[0]).toHaveLength(3);
    expect(renderTable(generateMarkdownTable(1, 999).markdown)[0]).toHaveLength(30);
    expect(renderTable(generateMarkdownTable(999, 1).markdown)).toHaveLength(100);
  });

  it("光标停在第一个标题后面，直接就能改", () => {
    const { markdown, cursorOffset } = generateMarkdownTable(3, 3);

    expect(markdown.slice(0, cursorOffset)).toBe("| 标题 1");
    // And the cell it lands in is the first cell: typing there replaces the placeholder.
    expect(markdown.slice(cursorOffset, cursorOffset + 2)).toBe(" |");
  });

  it("末尾留一个空行，紧接着写正文不会被吞进表里", () => {
    expect(generateMarkdownTable(2, 2).markdown.endsWith("\n\n")).toBe(true);
  });
});

describe("菜单与子菜单的位置", () => {
  const viewport = { width: 1000, height: 800 };

  it("菜单在视口内：原样打开", () => {
    expect(clampMenuPosition(100, 120, 260, 340, viewport, 12)).toEqual({ left: 100, top: 120 });
  });

  it("越过右边或下边：贴边收回来", () => {
    expect(clampMenuPosition(900, 700, 260, 340, viewport, 12)).toEqual({
      left: 1000 - 260 - 12,
      top: 800 - 340 - 12,
    });
  });

  it("视口比菜单还小时，仍然留在左上的内边距上", () => {
    // Better to overflow the small viewport than to be drawn off the top-left corner
    // where nothing can be clicked.
    expect(clampMenuPosition(50, 50, 900, 900, { width: 300, height: 300 }, 12)).toEqual({
      left: 12,
      top: 12,
    });
  });

  it("负坐标被推回内边距", () => {
    expect(clampMenuPosition(-40, -40, 260, 340, viewport, 12)).toEqual({ left: 12, top: 12 });
  });

  it("子菜单默认开在锚点右侧", () => {
    const anchor = { right: 300, left: 240, top: 200 } as DOMRect;

    expect(calculateSubmenuPosition(anchor, 264, 310, viewport, 12)).toEqual({
      left: 304,
      top: 196,
    });
  });

  it("右边放不下就翻到左边，且不越过内边距", () => {
    const anchor = { right: 980, left: 920, top: 200 } as DOMRect;

    expect(calculateSubmenuPosition(anchor, 264, 310, viewport, 12).left).toBe(920 - 264 - 4);

    const cramped = { right: 100, left: 40, top: 200 } as DOMRect;
    expect(calculateSubmenuPosition(cramped, 264, 310, { width: 200, height: 800 }, 12).left).toBe(
      12
    );
  });

  it("下面放不下就往上收", () => {
    const anchor = { right: 300, left: 240, top: 700 } as DOMRect;

    expect(calculateSubmenuPosition(anchor, 264, 310, viewport, 12).top).toBe(800 - 310 - 12);
  });

  it("不做上边界钳制 —— 锚点是菜单里的一行，本身已在视口内", () => {
    // Stated rather than accidental: the anchor comes from a context menu that was
    // clamped before it opened, so its top is never near zero, and `top - 4` is the
    // alignment the design wants.
    const anchor = { right: 300, left: 240, top: 40 } as DOMRect;

    expect(calculateSubmenuPosition(anchor, 264, 310, viewport, 12).top).toBe(36);
  });
});
