/**
 * Superscript `^text^` and subscript `~text~` (Pandoc / Obsidian inline
 * notation) rendered through the production pipeline, plus the editor
 * right-click ribbon buttons that insert them.
 *
 * Pair-asserted (rule 5): every notation that must render is paired with the
 * look-alike that must stay literal - `~~strikethrough~~` keeps the built-in
 * rule, an unresolved footnote `[^1^]` keeps its literal text (the `[^`
 * guard), a block anchor ` ^block-id` (no closing caret) keeps working, and
 * unclosed / space-padded input never becomes a tag.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderMarkdown, renderCardMarkdown } from "../services/markdown";
import { EditorContextMenu } from "../components/EditorContextMenu";
import type { EditorView } from "@codemirror/view";

const htmlOf = async (source: string): Promise<string> => {
  const chapter = await renderMarkdown(source);
  return chapter.html;
};

describe("superscript and subscript rendering", () => {
  it("renders ^text^ as <sup> and ~text~ as <sub>", async () => {
    const html = await htmlOf("质能方程 E = mc^2^ 与水的分子式 H~2~O。\n");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).not.toContain("^2^");
    expect(html).not.toContain("~2~");
  });

  it("keeps ~~double tilde~~ as the built-in strikethrough", async () => {
    const html = await htmlOf("~~划线~~ 和 ~下标~ 同段共存。\n");
    expect(html).toContain("<s>划线</s>");
    expect(html).toContain("<sub>下标</sub>");
  });

  it("keeps an unresolved footnote [^1^] fully literal (the [^ guard)", async () => {
    const html = await htmlOf("没有定义的引用 [^1^] 保持原样。\n");
    expect(html).toContain("[^1^]");
    expect(html).not.toContain("<sup>");
  });

  it("does not steal the paragraph-trailing block anchor", async () => {
    const html = await htmlOf("这是一个可被引用的段落 ^anchor-id\n");
    expect(html).toContain('data-block-id="anchor-id"');
    expect(html).not.toContain("<sup>");
  });

  it("leaves unclosed or space-padded input literal (negative pair)", async () => {
    const html = await htmlOf("未闭合 x^2 与带空格 a ^ b^ 还有 ^ 开头。\n");
    expect(html).not.toContain("<sup>");
    expect(html).toContain("x^2");
  });

  it("survives the production sanitizer", async () => {
    const html = await htmlOf("化合物 H~2~O 与 E=mc^2^。\n");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
  });

  it("also renders inside infinite-canvas text cards (shared pipeline)", () => {
    // Canvas cards reuse the module-wide MarkdownIt instance, so every inline
    // notation the main reader gained is automatically available there - the
    // card sanitize config allows mark/sup/sub through the html profile.
    const html = renderCardMarkdown("==高亮== 与 mc^2^ 和 H~2~O");
    expect(html).toContain("<mark>高亮</mark>");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<sub>2</sub>");
  });

  it("renders ==highlight== that the ribbon button always inserted", async () => {
    const html = await htmlOf("这段==重点内容==要高亮。\n");
    expect(html).toContain("<mark>重点内容</mark>");
    expect(html).not.toContain("==重点内容==");
  });

  it("keeps spacing runs and setext-like input literal (highlight negative)", async () => {
    const html = await htmlOf("等于号 a == b 与三连 a === b 原样。\n");
    expect(html).not.toContain("<mark>");
    expect(html).toContain("a == b");
  });
});

function createView(text: string, selFrom: number, selTo: number) {
  return {
    state: {
      doc: {
        toString: () => text,
        length: text.length,
        sliceString: (from: number, to: number) => text.slice(from, to),
        lineAt: () => ({ text, from: 0, to: text.length, number: 1 }),
        line: () => ({ text, from: 0, to: text.length, number: 1 }),
      },
      selection: { main: { from: selFrom, to: selTo, empty: selFrom === selTo } },
      sliceDoc: (from: number, to: number) => text.slice(from, to),
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn> };
}

describe("editor ribbon sup/sub buttons", () => {
  it("wrap the selection in ^ / ~ and toggle off when already wrapped", () => {
    const view = createView(" speeds ", 1, 7); // selection = "speeds"
    render(<EditorContextMenu x={100} y={100} onClose={vi.fn()} view={view} />);
    fireEvent.click(screen.getByTitle("上标 (^)"));
    expect((view.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0].changes.insert).toBe(
      "^speeds^",
    );

    cleanup();
    // Toggle-off: selection already carries the markers -> unwrap.
    const view2 = createView("x^speeds^y", 1, 9); // selection = "^speeds^"
    render(<EditorContextMenu x={100} y={100} onClose={vi.fn()} view={view2} />);
    fireEvent.click(screen.getByTitle("上标 (^)"));
    expect((view2.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0].changes.insert).toBe(
      "speeds",
    );

    cleanup();
    const view3 = createView(" H2O ", 2, 3); // selection = "2"
    render(<EditorContextMenu x={100} y={100} onClose={vi.fn()} view={view3} />);
    fireEvent.click(screen.getByTitle("下标 (~)"));
    expect((view3.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0].changes.insert).toBe(
      "~2~",
    );
  });
});
