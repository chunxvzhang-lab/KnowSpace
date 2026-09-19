import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";

/**
 * 双向布局里「新建的一支放哪边」。
 *
 * 布局自己的规则是"哪边矮放哪边"（那份规则有它自己的测试，见 mindmap-sides.test.ts）。这个
 * 文件测的是**问与不问**：双向布局里、给根新建子节点时要先问一句，别的布局里不该出现这个
 * 问题 —— 那边根本没有左右这回事。以及事后能从节点菜单里把一支换到另一侧。
 */
const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

/** 工具栏上的布局选择器，按它的无障碍名字找。 */
function switchToBidirectional() {
  fireEvent.change(screen.getByLabelText("导图布局"), { target: { value: "bidirectional" } });
}

describe("双向布局里新建分支先问放哪边", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("先问一句，而且此刻还没建出来", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    switchToBidirectional();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.getByText("这一支放哪边？")).toBeTruthy();
    // 问在先、建在后：先出现再跳到另一边，比等一句话再画更糟。
    expect(screen.queryByDisplayValue("新建子主题")).toBeNull();
  });

  it("选了左边就把分支建出来", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    switchToBidirectional();
    fireEvent.keyDown(window, { key: "Tab" });

    fireEvent.click(screen.getByText("放到左侧"));

    expect(screen.getByDisplayValue("新建子主题")).toBeTruthy();
    expect(screen.queryByText("这一支放哪边？")).toBeNull();
  });

  it("别的布局不问 —— 那边没有左右这回事", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.queryByText("这一支放哪边？")).toBeNull();
    expect(screen.getByDisplayValue("新建子主题")).toBeTruthy();
  });
});

describe("换到另一侧", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("双向布局里，一级分支有这一行", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    switchToBidirectional();

    fireEvent.contextMenu(screen.getByText("父节点"));

    expect(screen.getByText("换到另一侧")).toBeTruthy();
  });

  it("别的布局里没有 —— 没有侧可换", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.contextMenu(screen.getByText("父节点"));

    expect(screen.queryByText("换到另一侧")).toBeNull();
  });

  it("更深层的节点没有 —— 它跟着自己那一支走", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    switchToBidirectional();

    fireEvent.contextMenu(screen.getByText("子节点甲"));

    expect(screen.queryByText("换到另一侧")).toBeNull();
  });
});
