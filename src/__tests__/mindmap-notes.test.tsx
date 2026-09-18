import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { parseSidecar, serializeSidecar } from "../services/mindmapSidecar";

/**
 * Node notes, end to end through the view.
 *
 * The file's rules are checked in mindmap-sidecar.test.ts and its disk behaviour
 * in markdown-files.test.ts. What can only be checked here is the wiring: a
 * stored note reaching the panel, a note on a node being visible on the canvas,
 * and an edit arriving at the right document's file — after a pause, which is
 * the part with a decision in it.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

/** A stored companion carrying one note on the first branch. */
function sidecarWithNote(nodeId: string, text: string): string {
  return serializeSidecar({ version: 1, notes: { [nodeId]: text } });
}

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

/** Opens the style panel for a node by selecting it and pressing the button. */
function openPanelFor(text: string) {
  fireEvent.click(screen.getByText(text));
  fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
}

const noteField = () => document.querySelector(".mindmap-note-input") as HTMLTextAreaElement;
const markers = () => document.querySelectorAll(".mindmap-note-marker");

describe("节点备注", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("打开文档时读出备注，节点上有标记，面板里能看到全文", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithNote(firstBranchId(), "记得跟产品确认口径"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(markers().length).toBe(1));

    openPanelFor("父节点");

    expect(noteField().value).toBe("记得跟产品确认口径");
  });

  it("只打开文档不会写盘", async () => {
    // The rule that keeps the file worth trusting: it says what the reader
    // wrote, so nothing that only reads may write.
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithNote(firstBranchId(), "已存在的备注"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(markers().length).toBe(1));
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("改完停一下才写，写的是这份文档的伴生文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    fireEvent.change(noteField(), { target: { value: "先别写" } });
    // Immediate on screen...
    expect(noteField().value).toBe("先别写");

    await vi.advanceTimersByTimeAsync(300);
    // ...and not yet on disk: a write per keystroke would be a write per character.
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(api.saveMindmapSidecar).toHaveBeenCalledTimes(1);
    expect(api.saveMindmapSidecar).toHaveBeenCalledWith({
      documentPath: DOC,
      content: expect.stringContaining("先别写"),
    });

    // And what was written is a file this app can read back.
    const written = api.saveMindmapSidecar.mock.calls[0][0].content as string;
    expect(parseSidecar(written)?.notes[firstBranchId()]).toBe("先别写");
  });

  it("连着打字只写一次", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    for (const text of ["记", "记得", "记得改"]) {
      fireEvent.change(noteField(), { target: { value: text } });
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(700);

    expect(api.saveMindmapSidecar).toHaveBeenCalledTimes(1);
    expect(api.saveMindmapSidecar.mock.calls[0][0].content).toContain("记得改");
  });

  it("清空备注后标记消失，文件里也不再留着空条目", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithNote(firstBranchId(), "要删掉的"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    // Wrapped because the load settles outside the test's own action.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(markers().length).toBe(1);

    openPanelFor("父节点");
    fireEvent.change(noteField(), { target: { value: "" } });
    await vi.advanceTimersByTimeAsync(700);

    expect(markers().length).toBe(0);
    expect(parseSidecar(api.saveMindmapSidecar.mock.calls[0][0].content)?.notes).toEqual({});
  });

  it("没有文档键的预览：能看能改，只是不落盘", () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} />);
    openPanelFor("父节点");

    fireEvent.change(noteField(), { target: { value: "临时写点" } });

    expect(noteField().value).toBe("临时写点");
    expect(api.readMindmapSidecar).not.toHaveBeenCalled();
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("伴生文件坏了：按纯树渲染，备注栏是空的", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: '{ "version": 1, "notes": { 坏掉了',
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());

    // The tree is the document's, so it is unaffected either way.
    expect(screen.getByText("父节点")).toBeTruthy();
    expect(markers().length).toBe(0);

    openPanelFor("父节点");
    expect(noteField().value).toBe("");
  });
});
