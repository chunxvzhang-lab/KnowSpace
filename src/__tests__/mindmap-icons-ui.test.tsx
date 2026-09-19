import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { emptySidecar, parseSidecar, serializeSidecar, setNodeIcon } from "../services/mindmapSidecar";

/** A stored companion carrying one icon — built by the service, not by hand. */
function sidecarWithIcon(nodeId: string, iconId: string): string {
  return serializeSidecar(setNodeIcon(emptySidecar(), nodeId, iconId));
}

/**
 * Icons on nodes, through the view.
 *
 * The table is checked in mindmap-icon-table.test.ts and the storage rules in
 * mindmap-sidecar.test.ts. What is checked here is the wiring that neither of
 * those can see: a stored icon reaching the canvas, a click in the picker
 * reaching the file, and the two ways an icon can be wrong — an id this build
 * does not know, and a file that will not parse — degrading rather than
 * breaking the map.
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
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

function openPanelFor(text: string) {
  fireEvent.click(screen.getByText(text));
  fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
}

const nodeIcons = () => document.querySelectorAll(".mindmap-node-icon");

/** What the last write asked the bridge to store. */
function lastWritten(api: ReturnType<typeof installBridge>) {
  const call = api.saveMindmapSidecar.mock.calls.at(-1);
  return call ? parseSidecar(call[0].content as string) : null;
}

describe("节点图标", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("打开文档时读出图标，画在节点上", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithIcon(firstBranchId(), "star"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(nodeIcons().length).toBe(1));
  });

  it("面板里点一个图标：先看到，随即落到文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    // The picker offers the table, grouped.
    expect(screen.getByText("重点")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "旗标" }));

    // On the canvas at once...
    expect(nodeIcons().length).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    // ...and in the file a pause later, under this document.
    expect(api.saveMindmapSidecar).toHaveBeenCalledTimes(1);
    expect(api.saveMindmapSidecar.mock.calls[0][0].documentPath).toBe(DOC);
    expect(lastWritten(api)?.icons[firstBranchId()]).toBe("flag");
  });

  it("再点同一个图标就摘掉", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    const starButton = screen.getByRole("button", { name: "星标" });
    fireEvent.click(starButton);

    expect(nodeIcons().length).toBe(1);

    fireEvent.click(starButton);

    expect(nodeIcons().length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(lastWritten(api)?.icons).toEqual({});
  });

  it("面板上的清除按钮做同一件事", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithIcon(firstBranchId(), "star"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    openPanelFor("父节点");

    fireEvent.click(screen.getByRole("button", { name: "清除" }));

    expect(nodeIcons().length).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(lastWritten(api)?.icons).toEqual({});
  });

  it("文件里的图标 id 不认识：不画，也不报错，id 还留着", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithIcon(firstBranchId(), "未来的图标"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());
    // The tree is the document's and is unaffected either way.
    expect(screen.getByText("父节点")).toBeTruthy();
    expect(nodeIcons().length).toBe(0);
    // Nothing is written back for merely opening it, so the unknown id survives.
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("伴生文件坏了：按纯树渲染，图标区空着", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: "{ 这不是 json",
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());

    expect(screen.getByText("父节点")).toBeTruthy();
    expect(nodeIcons().length).toBe(0);

    openPanelFor("父节点");
    // The picker is there, with nothing marked active.
    expect(document.querySelectorAll(".mindmap-icon-btn.is-active").length).toBe(0);
  });
});
