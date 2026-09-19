import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import {
  addFloatingTopic,
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setNodeIcon,
  setNodeNote,
  setNodePriority,
} from "../services/mindmapSidecar";

/**
 * A floating topic carrying annotations.
 *
 * The sections themselves are tested against a node (mindmap-notes,
 * mindmap-icons-ui and the rest), and this is not a second copy of those: what is
 * only true of a floating topic is here — that a right click on one opens a panel
 * of its own, that its annotations go in the same file under its own id, that
 * they are drawn on the box, and that deleting the topic takes them with it.
 */

const SOURCE = ["- 父节点", "  - 子节点"].join("\n");
const DOC = "/vault/notes/a.md";

function installBridge(read?: { exists?: boolean; content?: string }) {
  const api = {
    readMindmapSidecar: vi
      .fn()
      .mockResolvedValue(
        read?.content
          ? { success: true, exists: true, content: read.content }
          : { success: true, exists: read?.exists ?? false }
      ),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

const topics = () => document.querySelectorAll(".mindmap-floating-topic");
const topicTitle = () => document.querySelector(".mindmap-ctx-title")?.textContent ?? "";

function openCanvasMenu(clientX = 400, clientY = 300) {
  fireEvent.contextMenu(document.querySelector(".mindmap-svg-canvas") as Element, {
    clientX,
    clientY,
  });
}

function rightClickTopic() {
  fireEvent.contextMenu(document.querySelector(".mindmap-floating-topic") as Element, {
    clientX: 200,
    clientY: 200,
  });
}

function lastWritten(api: ReturnType<typeof installBridge>) {
  const call = api.saveMindmapSidecar.mock.calls.at(-1);
  return call ? parseSidecar(call[0].content as string) : null;
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

describe("自由主题的标注", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("右键自由主题，打开的是它自己的面板", async () => {
    vi.useFakeTimers();
    const { sidecar } = addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80);
    const api = installBridge({ content: serializeSidecar(sidecar) });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    rightClickTopic();

    // Its own panel, titled with the topic, not the node style panel: half of
    // that panel describes things a floating topic does not have.
    expect(topicTitle()).toContain("画布上的想法");
    expect(screen.queryByText("节点背景颜色")).toBeNull();
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("在面板里写备注，落在同一个文件的同一个 id 下", async () => {
    vi.useFakeTimers();
    const { sidecar } = addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80);
    const api = installBridge({ content: serializeSidecar(sidecar) });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    rightClickTopic();
    const note = document.querySelector(".mindmap-note-input") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "只留在导图里的想法" } });
    await settle();

    expect(lastWritten(api)?.notes["floating-1"]).toBe("只留在导图里的想法");
    // Under its own id in the same section a node's note goes in: the file does
    // not distinguish them, and nothing downstream has to know.
    expect(lastWritten(api)?.floating["floating-1"]?.text).toBe("画布上的想法");
  });

  it("标注画在框上，与节点用的是同一套装饰", async () => {
    let sidecar = addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80).sidecar;
    sidecar = setNodePriority(sidecar, "floating-1", 2);
    sidecar = setNodeIcon(sidecar, "floating-1", "star");
    sidecar = setNodeNote(sidecar, "floating-1", "只看一眼");
    installBridge({ content: serializeSidecar(sidecar) });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(topics().length).toBe(1));

    const box = document.querySelector(".mindmap-floating-topic") as Element;
    expect(box.querySelector(".mindmap-node-icon")).toBeTruthy();
    expect(box.querySelector(".mindmap-note-marker")).toBeTruthy();
    expect(box.querySelector(".mindmap-node-marks")).toBeTruthy();
    // Being in the DOM is what makes them travel into an export, which clones
    // the canvas rather than redrawing it from the layout.
    expect(box.querySelector(".mindmap-priority-text")?.textContent).toBe("2");
  });

  it("从面板删除：主题与写在它上面的标注一起走", async () => {
    vi.useFakeTimers();
    const sidecar = setNodeNote(
      addFloatingTopic(emptySidecar(), "要删掉的", 100, 100).sidecar,
      "floating-1",
      "写过的"
    );
    const api = installBridge({ content: serializeSidecar(sidecar) });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    rightClickTopic();
    fireEvent.click(screen.getByRole("button", { name: /删除自由主题/ }));
    await settle();

    expect(topics().length).toBe(0);
    const written = lastWritten(api);
    expect(written?.floating).toEqual({});
    // A floating topic's id is handed out by a counter and never comes back, so
    // its note could never be claimed again — keeping it would be keeping a file
    // that says it has content when what it has is orphans.
    expect(written?.notes).toEqual({});
    expect(written?.icons).toEqual({});
    expect(written?.markers).toEqual({});
    expect(written?.tags).toEqual({});
    expect(written?.links).toEqual({});
  });

  it("改名成空，与删除是同一条路，标注也跟着走", async () => {
    vi.useFakeTimers();
    const sidecar = setNodeNote(
      addFloatingTopic(emptySidecar(), "原名", 100, 100).sidecar,
      "floating-1",
      "写过的"
    );
    const api = installBridge({ content: serializeSidecar(sidecar) });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    // The two ways to empty a topic are one function in the service, so they
    // cannot disagree about what an empty topic is — or about what happens to
    // what was written on it.
    fireEvent.doubleClick(document.querySelector(".mindmap-floating-topic") as Element);
    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(topics().length).toBe(0);
    expect(lastWritten(api)?.notes).toEqual({});
  });

  it("自由主题的 #标题 链接打不开，面板会说明", async () => {
    const sidecar = {
      ...addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80).sidecar,
      links: { "floating-1": "#父节点" },
    };
    installBridge({ content: serializeSidecar(sidecar) });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(topics().length).toBe(1));

    rightClickTopic();

    // `#标题` is followed by looking the heading up in the outline, and a topic
    // that is not in the outline has no heading to find.
    const open = screen.getByRole("button", { name: "打开" }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    expect(open.getAttribute("title")).toContain("没有能打开它的通道");
  });

  it("画布菜单里的删除仍然可用", async () => {
    vi.useFakeTimers();
    const { sidecar } = addFloatingTopic(emptySidecar(), "要删掉的", 100, 100);
    installBridge({ content: serializeSidecar(sidecar) });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    // Two entry points to one action is not two models: the panel is the topic's
    // own surface, and this is the row that was here before it existed.
    fireEvent.mouseDown(document.querySelector(".mindmap-floating-topic") as Element, {
      clientX: 120,
      clientY: 120,
      button: 0,
    });
    fireEvent.mouseUp(window);
    openCanvasMenu();

    expect(screen.getByRole("button", { name: /删除自由主题/ })).toBeTruthy();
  });
});
