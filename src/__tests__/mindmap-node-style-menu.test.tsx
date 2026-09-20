import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";

/**
 * The node style panel: the biggest piece of MindmapView's markup and, until
 * this file, the only part of it with no test at all.
 *
 * It exists as the precondition for moving that panel into its own component.
 * Three hundred lines of untested UI moved in one go would put any mistake it
 * makes in front of a reader instead of in front of a test, and the suite's
 * mindmap-ctx matches all belong to the canvas context menu, which shares a
 * class prefix with this one and nothing else.
 *
 * The path under test is the whole one: open the panel, change a style, sync it
 * back to the document, and look at the comment that ends up in the markdown.
 * That last part is what makes it worth doing — a style that is set on screen
 * and never written back is the failure mode that matters here.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

describe("节点样式菜单", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("打开后能看到样式的分组", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));

    expect(screen.getByText("节点背景颜色")).toBeTruthy();
    expect(screen.getByText("节点形状")).toBeTruthy();
    expect(screen.getByText("文字对齐")).toBeTruthy();
  });

  it("改一项背景色，同步回文档时写进样式注释", () => {
    const onSourceChange = vi.fn();
    render(<MindmapView title="测试" source={SOURCE} onSourceChange={onSourceChange} />);

    // Select a list item rather than leaving the root selected: the root is the
    // document's title and has no line of its own to carry a style comment.
    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
    fireEvent.click(screen.getByTitle("背景: 天蓝"));

    // The toolbar says so once the tree differs from the document.
    fireEvent.click(screen.getByRole("button", { name: /同步到文档/ }));

    expect(onSourceChange).toHaveBeenCalledTimes(1);
    const written = onSourceChange.mock.calls[0][0] as string;
    expect(written).toContain("<!-- style:");
    expect(written).toContain("color=#38bdf8");
    expect(written).toContain("父节点");
  });

  it("改形状也同样落到文档里", () => {
    const onSourceChange = vi.fn();
    render(<MindmapView title="测试" source={SOURCE} onSourceChange={onSourceChange} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
    fireEvent.click(screen.getByRole("button", { name: "胶囊" }));
    fireEvent.click(screen.getByRole("button", { name: /同步到文档/ }));

    expect(onSourceChange).toHaveBeenCalledTimes(1);
    expect(onSourceChange.mock.calls[0][0]).toContain("shape=capsule");
  });

  it("固化当前主题：取消什么都不做，确认后写进样式注释", () => {
    const onSourceChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MindmapView title="测试" source={SOURCE} onSourceChange={onSourceChange} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));

    fireEvent.click(screen.getByRole("button", { name: "固化当前主题" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Cancelled: the tree still matches the document, so there is nothing to sync.
    expect(screen.getByRole("button", { name: "已同步" })).toBeTruthy();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "固化当前主题" }));
    fireEvent.click(screen.getByRole("button", { name: /同步到文档/ }));

    expect(onSourceChange).toHaveBeenCalledTimes(1);
    const written = onSourceChange.mock.calls[0][0] as string;
    // The classic theme's own answers for a non-root node.
    expect(written).toContain("shape=rounded");
    expect(written).toContain("color=#1e293b");
  });

  it("没有改动时同步按钮说的是已同步", () => {
    render(<MindmapView title="测试" source={SOURCE} onSourceChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "已同步" })).toBeTruthy();
  });

  it("菜单写明它作用于什么：一句总说明、三条分支操作、以及连带子主题的删除", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));

    expect(screen.getByRole("button", { name: /复制整个主题/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /剪切整个主题/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /删除整个主题及其子主题/ })).toBeTruthy();

    // 还没复制过，粘贴那行是灰的 —— 灰着并给出原因，比不出现好。
    const paste = screen.getByRole("button", { name: /粘贴为子主题/ }) as HTMLButtonElement;
    expect(paste.disabled).toBe(true);
  });

  it("点顶栏：右键菜单收起", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
    expect(document.querySelector(".mindmap-context-menu")).toBeTruthy();

    const selectionBefore = document
      .querySelector(".mindmap-node-interactive.is-selected")
      ?.getAttribute("transform");

    // 顶栏上的一次按下：菜单收起来，而这次点击不算"落在画布上"，
    // 所以选择也不会被顺手清掉。
    fireEvent.mouseDown(screen.getByRole("button", { name: "同级主题" }));

    expect(document.querySelector(".mindmap-context-menu")).toBeNull();
    expect(
      document.querySelector(".mindmap-node-interactive.is-selected")?.getAttribute("transform")
    ).toBe(selectionBefore);
  });

  it("在菜单里复制再粘贴：贴成当前主题的子主题，粘贴行随之可用", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));

    fireEvent.click(screen.getByRole("button", { name: /复制整个主题/ }));

    // 复制之后菜单不关（它什么都没改），粘贴那行必须立刻能用：靠 ref 判断可用性时它
    // 会一直灰着，直到某次无关的交互顺手重渲染。
    const paste = screen.getByRole("button", { name: /粘贴为子主题/ }) as HTMLButtonElement;
    expect(paste.disabled).toBe(false);

    fireEvent.click(paste);

    // 「父节点」那一支有三个主题，原来的五个加上它们。
    expect(screen.getByText("8 节点")).toBeTruthy();
  });
});
