import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";

/**
 * 快捷键的作用对象。
 *
 * 导图的快捷键挂在 window 上，而原来的保护只问一句"是不是正在编辑节点文字"。插入符停在面板
 * 自己的输入框里时它答不上来，于是那些键还是被当成对导图的命令：在备注框里按 Delete，被删掉
 * 的是这条备注所属的整个主题；在标签或链接框里按 Ctrl+V，贴进来的是一整个分支。读者在编辑
 * 文字，导图在背后自己动 —— 这一条钉住的是：**有插入符的地方，键属于那个框**。
 *
 * 最后一条同样重要：保护不能把导图本身弄哑。焦点不在输入框里时，快捷键照旧。
 */
const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");

/** 主题数取自工具栏的徽章 —— 它本来就是给读者看的那个数字。 */
const nodeCount = () => screen.getByText(/^\d+ 节点$/).textContent;

describe("快捷键的作用对象", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const openPanelForFirstBranch = () => {
    fireEvent.click(screen.getByText("父节点"));
    fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
  };

  it("在备注框里按 Delete：删的是字，不是主题", () => {
    render(<MindmapView title="测试" source={SOURCE} />);
    openPanelForFirstBranch();

    const note = screen.getByPlaceholderText("写点什么，只留在导图里");
    fireEvent.change(note, { target: { value: "一段备注" } });
    fireEvent.keyDown(note, { key: "Delete" });

    // 主题还在 —— 这个键没有冒到导图上去。这里的断言不用 node 里的文字：面板打开后
    // "父节点"在标题和图上各有一处，按文字查会拿到多个。
    expect(document.querySelectorAll(".mindmap-node-interactive").length).toBe(5);
    expect(nodeCount()).toBe("5 节点");
  });

  it("在标签框里按 Ctrl+V：贴的是字，不会多出一个主题", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    // 先复制一个分支。焦点不在任何输入框里，这一下本来就该生效。
    fireEvent.click(screen.getByText("父节点"));
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });

    openPanelForFirstBranch();
    const tags = screen.getByPlaceholderText("空格或逗号分隔，# 可省");
    tags.focus();
    fireEvent.keyDown(tags, { key: "v", ctrlKey: true });

    // 复制的是「父节点」那一支（三个主题），贴进来就会是 8；仍是 5 说明键留在了框里。
    expect(nodeCount()).toBe("5 节点");
  });

  it("焦点不在输入框里时，快捷键照旧：复制一个分支能贴出来", () => {
    render(<MindmapView title="测试" source={SOURCE} />);

    fireEvent.click(screen.getByText("父节点"));
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });

    expect(nodeCount()).toBe("8 节点");
  });
});
