import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { parseMindmapLink } from "../core/mindmapLinks";
import { emptySidecar, serializeSidecar, setNodeLink } from "../services/mindmapSidecar";

/**
 * 节点上那个链接徽章。
 *
 * 它原来只是个记号 —— 说明写着"跟着链接走是在面板里做的事"。可它标的既然是一个去处，
 * 看得见的地方就该走得到：读者点它，链接就该打开（外链走系统浏览器，笔记链接与
 * `#标题` 走阅读器自己的两条通道，都在 handleOpenLink 里）。
 *
 * 这里钉三件事：点外链会请外壳打开它；点徽章**不会**把主题选中、也不会开始拖拽
 * （同一个盒子上还挂着这两件事，而"去一个链接"不该顺手把主题挪走）；以及没有链接的
 * 主题上根本不画这个徽章。
 */
const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

function firstBranchId(): string {
  return parseMarkdownToMindmapTree(SOURCE, "测试").children[0].id;
}

function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
    openExternal: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

const badge = () => document.querySelector(".mindmap-link-marker");

describe("节点上的链接徽章", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("点它就把外链交给系统浏览器打开", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(
        setNodeLink(emptySidecar(), firstBranchId(), "https://example.com/docs")
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(badge()).toBeTruthy());

    await act(async () => {
      fireEvent.click(badge() as Element);
    });

    expect(api.openExternal).toHaveBeenCalledTimes(1);
    expect(api.openExternal.mock.calls[0][0]).toBe("https://example.com/docs");
  });

  it("点徽章不会把主题选中，也不会开始拖拽", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(
        setNodeLink(emptySidecar(), firstBranchId(), "https://example.com/docs")
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(badge()).toBeTruthy());

    // 挂载时选中的是中心主题，用它的坐标当作"选中没变"的凭据。
    const selectionBefore = document
      .querySelector(".mindmap-node-interactive.is-selected")
      ?.getAttribute("transform");

    // 按下与松开都发给徽章本身：它把 mousedown 吞掉，所以节点那一侧的选中与拖拽起始
    // 都收不到这一下。
    fireEvent.mouseDown(badge() as Element);
    fireEvent.click(badge() as Element);

    const selectionAfter = document
      .querySelector(".mindmap-node-interactive.is-selected")
      ?.getAttribute("transform");
    expect(selectionAfter).toBe(selectionBefore);
  });

  it("没有链接的主题上不画徽章", async () => {
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(badge()).toBeNull();
    expect(api.openExternal).not.toHaveBeenCalled();
  });

  it("样式表把可点的那枚徽章的指针事件重新打开", () => {
    // 这一条读的是 CSS，而它之所以存在，是因为上面两条测试都能通过、真实窗口里却点不动：
    // `.mindmap-link-marker` 关掉了 pointer-events（它原本只是个记号，不该偷走节点的点击），
    // 而 pointer-events 是**继承**的 —— 子元素那个透明命中圆同样收不到事件。jsdom 不做命中
    // 测试，所以没有任何行为断言能发现它；能发现的只有"这一条规则还在不在"。
    // 相对工作目录读：vitest + jsdom 下 `import.meta.url` 是 http 起始的地址，
    // `new URL(..., import.meta.url)` 交给 readFileSync 会报"URL 必须是 file 协议"。
    const css = readFileSync("src/styles.css", "utf8");
    const actionRule = css.match(/\.mindmap-link-marker\.is-action\s*\{[^}]*\}/)?.[0] ?? "";

    expect(actionRule).toContain("pointer-events: auto");
  });

  it("没写协议的域名也是链接：仍是外链，只是打开时补上 https", () => {
    // 人们往"链接"里填的就是这个形状，而它此前什么都不是：不画徽章、点也没反应，
    // 看起来和功能坏掉一模一样。存进文件里的仍然是原样，补协议只发生在打开的那一份。
    expect(parseMindmapLink("www.example.com")).toEqual({
      kind: "external",
      target: "https://www.example.com",
    });
    expect(parseMindmapLink("example.com/docs")?.target).toBe("https://example.com/docs");

    // 而"不是链接"的文字仍然是文字：版本号与带空格的句子都不该被当成网址。
    expect(parseMindmapLink("v2.6.1")).toBeNull();
    expect(parseMindmapLink("见 1.2 节")).toBeNull();
    expect(parseMindmapLink("随便写点什么")).toBeNull();
  });
});
