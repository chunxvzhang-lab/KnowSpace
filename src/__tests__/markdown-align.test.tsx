/**
 * Paragraph centering — the right-click menu's 段落居中 / 取消居中 pair and the
 * production markdown pipeline that turns the trailing align marker into a
 * centered block.
 *
 * Pair-asserted (rule 5): every notation that must render is paired with the
 * look-alike that must stay literal:
 *  - a marker on the last line centers that paragraph and never leaks the
 *    marker characters into the visible text;
 *  - a marker that is NOT at end-of-line (mid-sentence) stays literal text and
 *    centers nothing;
 *  - an unmarked paragraph is not centered;
 *  - the block-segmentation identities still hold for a centered document
 *    (per-group raw renders concatenate back to `md.render`, byte for byte).
 *
 * The editor-side transforms are checked document-level (no output may keep
 * the marker in the wrong place, toggling is a whole-span decision), against
 * the same mock EditorView the sibling line-transform tests use.
 */
import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  renderMarkdown,
  buildMarkdownIt,
  buildBlockPlan,
  ALIGN_CENTER_MARKER,
} from "../services/markdown";
import { EditorContextMenu } from "../components/EditorContextMenu";
import type { EditorView } from "@codemirror/view";

const htmlOf = async (source: string): Promise<string> => {
  const chapter = await renderMarkdown(source);
  return chapter.html;
};

describe("align center rendering", () => {
  it("centers a paragraph whose last line carries the marker", async () => {
    const html = await htmlOf(`居中的一句话 ${ALIGN_CENTER_MARKER}\n`);
    expect(html).toContain('style="text-align:center"');
    // The marker must be consumed, never rendered as literal characters.
    expect(html).not.toContain(ALIGN_CENTER_MARKER);
    expect(html).toContain("居中的一句话");
  });

  it("centers every paragraph of a multi-paragraph selection (marker on each)", async () => {
    const html = await htmlOf(
      `第一段 ${ALIGN_CENTER_MARKER}\n\n第二段 ${ALIGN_CENTER_MARKER}\n\n第三段普通\n`,
    );
    // Two centered paragraphs, the third untouched.
    expect((html.match(/style="text-align:center"/g) ?? []).length).toBe(2);
    expect(html).not.toContain(ALIGN_CENTER_MARKER);
    expect(html).toContain("第三段普通");
  });

  it("a marker NOT at end of line stays literal and centers nothing", async () => {
    const html = await htmlOf(`这句话中间有 ${ALIGN_CENTER_MARKER} 标记但在句中\n`);
    expect(html).not.toContain("text-align:center");
    expect(html).toContain(ALIGN_CENTER_MARKER);
  });

  it("an unmarked paragraph is left-aligned (not centered)", async () => {
    const html = await htmlOf("普通的一段话\n");
    expect(html).not.toContain("text-align:center");
  });

  it("block segmentation identities still hold for a centered document", async () => {
    const source = `# 标题\n\n居中段落 ${ALIGN_CENTER_MARKER}\n\n普通段落\n`;
    const md = buildMarkdownIt(() => {});
    const plan = buildBlockPlan(md, source);
    expect(plan.mode).toBe("blocks");
    if (plan.mode !== "blocks") return;
    // Identity 1: per-group raw renders concatenate back to md.render exactly.
    expect(plan.groups.map((g) => g.raw).join("")).toBe(md.render(source));
    // And the pipeline renders the centered paragraph end to end.
    expect(await htmlOf(source)).toContain("text-align:center");
  });
});

/* ------------------------------------------------------------------ */
/* Editor-side transforms (document-level)                            */
/* ------------------------------------------------------------------ */

type LineInfo = { text: string; from: number; to: number; number: number };

function lineMap(text: string): LineInfo[] {
  const lines = text.split("\n");
  let pos = 0;
  return lines.map((t, i) => {
    const info = { text: t, from: pos, to: pos + t.length, number: i + 1 };
    pos += t.length + 1;
    return info;
  });
}

function docAfter(text: string, changes: { from: number; to: number; insert: string }[]) {
  let out = text;
  for (const ch of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, ch.from) + ch.insert + out.slice(ch.to);
  }
  return out;
}

function createView(text: string, selFrom: number, selTo: number) {
  const lines = lineMap(text);
  const doc = {
    toString: () => text,
    length: text.length,
    sliceString: (from: number, to: number) => text.slice(from, to),
    lineAt: (pos: number) =>
      lines.find((l) => pos >= l.from && pos <= l.to) ?? lines[lines.length - 1],
    line: (n: number) => lines[n - 1],
  };
  return {
    state: {
      doc,
      selection: { main: { from: selFrom, to: selTo, empty: selFrom === selTo } },
      sliceDoc: (from: number, to: number) => text.slice(from, to),
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn> };
}

function openListSubmenu(view: EditorView) {
  render(<EditorContextMenu x={150} y={200} onClose={vi.fn()} view={view} />);
  const trigger = screen.getByText("列表与段落排版");
  fireEvent.mouseEnter(trigger.closest(".context-menu-item")!);
}

function dispatchChanges(view: EditorView) {
  const call = (view.dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
  return call.changes as { from: number; to: number; insert: string }[];
}

describe("right-click 段落居中 / 取消居中 transforms", () => {
  it("段落居中 appends the marker to the selection's last non-blank line", () => {
    const src = "第一段\n第二段";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("段落居中"));
    const result = docAfter(src, dispatchChanges(view));
    expect(result).toBe(`第一段\n第二段 ${ALIGN_CENTER_MARKER}`);
  });

  it("段落居中 on a single cursor line (no selection) centers that line", () => {
    const src = "只有一行";
    const view = createView(src, 1, 1);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("段落居中"));
    expect(docAfter(src, dispatchChanges(view))).toBe(`只有一行 ${ALIGN_CENTER_MARKER}`);
  });

  it("取消居中 strips the marker from every centered line in the span", () => {
    const src = `甲 ${ALIGN_CENTER_MARKER}\n乙\n丙 ${ALIGN_CENTER_MARKER}`;
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("取消居中"));
    expect(docAfter(src, dispatchChanges(view))).toBe("甲\n乙\n丙");
  });

  it("居中 on an already-centered span removes it (whole-span toggle)", () => {
    const src = `已经居中 ${ALIGN_CENTER_MARKER}`;
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("段落居中"));
    expect(docAfter(src, dispatchChanges(view))).toBe("已经居中");
  });

  it("居中 on an empty input is a no-op (no dispatch)", () => {
    const src = "   ";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("段落居中"));
    expect(view.dispatch).not.toHaveBeenCalled();
    cleanup();
  });
});
