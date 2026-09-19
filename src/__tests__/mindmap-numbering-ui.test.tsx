import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { loadMindmapNumbering, saveMindmapNumbering } from "../services/storage";

/**
 * Outline numbering, through the view.
 *
 * The rules are checked in mindmap-numbering.test.ts. What can only be checked
 * here is the promise the whole feature rests on: **the numbers are drawn and
 * never written**. That is the last test in this file, and it is the one that
 * would catch the tempting shortcut of numbering the tree instead of the canvas.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

const numbers = () =>
  [...document.querySelectorAll(".mindmap-node-number")].map((el) => el.textContent);
const numberingButton = () => screen.getByRole("button", { name: "编号" });

describe("分支编号", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("默认不显示", () => {
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    expect(numbers()).toEqual([]);
    expect(numberingButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("按文档记住：打开时就画出来", () => {
    saveMindmapNumbering(DOC, true);

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    // In the order the nodes are laid out: the root is the title and has no
    // number, so the first thing drawn is the first branch.
    expect(numbers()).toEqual(["1", "1.1", "1.2", "2"]);
    expect(numberingButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("点一下就开，再点一下就关，并且写回这篇文档", () => {
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    fireEvent.click(numberingButton());
    expect(numbers()).toEqual(["1", "1.1", "1.2", "2"]);
    expect(loadMindmapNumbering(DOC)).toBe(true);

    fireEvent.click(numberingButton());
    expect(numbers()).toEqual([]);
    expect(loadMindmapNumbering(DOC)).toBe(false);
  });

  it("另一篇文档不跟着变", () => {
    saveMindmapNumbering("/vault/notes/b.md", true);

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    expect(numbers()).toEqual([]);
    // ...and the other document's choice is still there.
    expect(loadMindmapNumbering("/vault/notes/b.md")).toBe(true);
  });

  it("切换布局不会重排编号 —— 编号认的是文档结构", () => {
    saveMindmapNumbering(DOC, true);
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    fireEvent.change(screen.getByLabelText("导图布局"), { target: { value: "bidirectional" } });

    expect([...numbers()].sort()).toEqual(["1", "1.1", "1.2", "2"]);
  });

  it("同步回文档时，文字里没有编号", async () => {
    // The reason the numbers live beside the text instead of in it: the tree is
    // what gets written back, and a number in the tree would end up in the
    // reader's Markdown, prefixed to prose they typed themselves.
    saveMindmapNumbering(DOC, true);
    const onSourceChange = vi.fn();
    render(
      <MindmapView title="测试" source={SOURCE} documentKey={DOC} onSourceChange={onSourceChange} />
    );

    expect(numbers().length).toBe(4);

    // Rename a node so there is something to sync, then write it back. The
    // rename action lives in the style panel, so the node is selected and the
    // panel opened first — the same two steps a reader takes.
    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
    fireEvent.click(screen.getByRole("button", { name: "重命名 (F2)" }));
    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "改过的父节点" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /同步到文档/ }));

    await waitFor(() => expect(onSourceChange).toHaveBeenCalledTimes(1));
    const written = onSourceChange.mock.calls[0][0] as string;

    expect(written).toContain("改过的父节点");
    // No number was written into the document, in any of the forms it could take.
    expect(written).not.toMatch(/^\s*(#+\s*)?1(\.\d+)*\s/m);
    expect(written).not.toContain("1 父节点");
    expect(written).not.toContain("1.1 子节点甲");
  });
});
