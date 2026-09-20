import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
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
});
