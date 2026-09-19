import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setNodePriority,
  setNodeProgress,
} from "../services/mindmapSidecar";

/**
 * Priority and progress marks, through the view.
 *
 * The tables and the dial's geometry are checked in mindmap-marker-table.test.ts,
 * the storage rules in mindmap-sidecar.test.ts. What is checked here is that the
 * two ends meet: a stored mark drawn on the node, a click in the panel reaching
 * the file, and a value the map cannot draw being left exactly where it was.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

function firstBranchId(): string {
  return parseMarkdownToMindmapTree(SOURCE, "测试").children[0].id;
}

/** A stored companion carrying one node's marks, built by the service. */
function sidecarWithMarks(priority: number | null, progress: number | null): string {
  const nodeId = firstBranchId();
  let sidecar = emptySidecar();
  if (priority !== null) sidecar = setNodePriority(sidecar, nodeId, priority);
  if (progress !== null) sidecar = setNodeProgress(sidecar, nodeId, progress);
  return serializeSidecar(sidecar);
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

const marks = () => document.querySelectorAll(".mindmap-node-marks");
const badges = () => document.querySelectorAll(".mindmap-priority-badge");
const dials = () => document.querySelectorAll(".mindmap-node-progress");

function lastWritten(api: ReturnType<typeof installBridge>) {
  const call = api.saveMindmapSidecar.mock.calls.at(-1);
  return call ? parseSidecar(call[0].content as string) : null;
}

/** Lets the pause elapse, and the load settle with it. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

describe("优先级与进度标记", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("打开文档时读出两个标记，各画各的", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithMarks(2, 5),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(marks().length).toBe(1));
    expect(badges().length).toBe(1);
    expect(badges()[0].getAttribute("fill")).toBeTruthy();
    expect(dials().length).toBe(1);
    // The numeral is the whole point of a priority badge.
    expect(document.querySelector(".mindmap-priority-text")?.textContent).toBe("2");
  });

  it("只设优先级就不画表盘，只设进度就不画角标", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithMarks(6, null),
    });

    const { unmount } = render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(badges().length).toBe(1));
    expect(dials().length).toBe(0);
    unmount();

    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithMarks(null, 7),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(dials().length).toBe(1));
    expect(badges().length).toBe(0);
  });

  it("面板上点一个优先级：先看到，随即落到文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    // The panel says what is set in words as well as in colour.
    expect(screen.getAllByText("未设").length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "优先级 3" }));

    expect(badges().length).toBe(1);
    expect(document.querySelector(".mindmap-priority-text")?.textContent).toBe("3");

    await settle();

    expect(lastWritten(api)?.markers[firstBranchId()]).toEqual({ priority: 3 });
  });

  it("再点同一个优先级就摘掉，进度不受影响", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    fireEvent.click(screen.getByRole("button", { name: "优先级 3" }));
    fireEvent.click(screen.getByRole("button", { name: "进度 5/8" }));
    expect(marks().length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "优先级 3" }));
    expect(badges().length).toBe(0);
    expect(dials().length).toBe(1);

    await settle();

    expect(lastWritten(api)?.markers[firstBranchId()]).toEqual({ progress: 5 });
  });

  it("地图画不出的值：不画、不报错、打开时也不擦", async () => {
    // A file edited by hand, or written by a version with a wider scale. Finding
    // it and quietly rewriting it would be this build deciding the reader's "12"
    // was really a "9".
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: JSON.stringify({ version: 1, markers: { [firstBranchId()]: { priority: 12 } } }),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());

    expect(screen.getByText("父节点")).toBeTruthy();
    expect(marks().length).toBe(0);
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("伴生文件坏了：面板照常，两处都显示未设", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: "坏掉的内容",
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());

    openPanelFor("父节点");

    expect(screen.getAllByText("未设").length).toBe(2);
    expect(document.querySelectorAll(".mindmap-priority-btn.is-active").length).toBe(0);
    expect(document.querySelectorAll(".mindmap-progress-btn.is-active").length).toBe(0);
  });
});
