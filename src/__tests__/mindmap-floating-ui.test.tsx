import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  addFloatingTopic,
  emptySidecar,
  parseSidecar,
  serializeSidecar,
} from "../services/mindmapSidecar";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { layoutMindmap } from "../services/mindmapLayout";

/**
 * Free topics, through the view.
 *
 * The storage rules are checked in mindmap-sidecar.test.ts and the framing
 * arithmetic in mindmap-bounds.test.ts. What is checked here is the gesture:
 * right-clicking empty canvas makes a topic there, dragging moves it, the box
 * renames and disappears, and the whole thing travels into an export — without
 * the selection ring, which is a control rather than part of the picture.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

const boxes = () => document.querySelectorAll(".mindmap-floating-topic");
const boxText = () => document.querySelector(".mindmap-floating-text")?.textContent;

function openCanvasMenu(clientX = 400, clientY = 300) {
  fireEvent.contextMenu(document.querySelector(".mindmap-svg-canvas") as Element, {
    clientX,
    clientY,
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

describe("自由主题", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("在右键的地方新建一个，停一下落到文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    openCanvasMenu(400, 300);
    fireEvent.click(screen.getByRole("button", { name: /新建自由主题/ }));

    expect(boxes().length).toBe(1);
    expect(boxText()).toBe("新主题");

    await settle();

    const written = lastWritten(api)?.floating ?? {};
    const id = Object.keys(written)[0];
    expect(id).toBe("floating-1");
    expect(typeof written[id].x).toBe("number");
    expect(typeof written[id].y).toBe("number");
  });

  it("打开文档时它在原处", async () => {
    const api = installBridge();
    const { sidecar } = addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80);
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(boxes().length).toBe(1));
    expect(boxText()).toBe("画布上的想法");
    // Drawn at the coordinates it was stored with, in the viewport's own space.
    expect(boxes()[0].getAttribute("transform")).toBe("translate(250, 80)");
  });

  it("拖动改的是坐标，方向与幅度都在", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    openCanvasMenu(400, 300);
    fireEvent.click(screen.getByRole("button", { name: /新建自由主题/ }));
    await settle();

    const before = Object.values(lastWritten(api)?.floating ?? {})[0];

    const box = boxes()[0];
    fireEvent.mouseDown(box, { clientX: 400, clientY: 300, button: 0 });
    fireEvent.mouseMove(window, { clientX: 460, clientY: 340 });
    fireEvent.mouseUp(window);

    await settle();

    const after = Object.values(lastWritten(api)?.floating ?? {})[0];
    expect(after.x, "横向应当移动了").not.toBe(before.x);
    // Compared as a ratio rather than as absolute numbers: the canvas may be
    // zoomed, and the point of the assertion is that the pointer's movement
    // arrives intact, not what the zoom was.
    expect((after.x - before.x) / (after.y - before.y)).toBeCloseTo(60 / 40, 3);
  });

  it("双击改名，文字进了文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addFloatingTopic(emptySidecar(), "原名", 100, 100);
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.doubleClick(boxes()[0]);

    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    expect(input.value).toBe("原名");

    fireEvent.change(input, { target: { value: "改过的名字" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(boxText()).toBe("改过的名字");
    expect(Object.values(lastWritten(api)?.floating ?? {})[0].text).toBe("改过的名字");
  });

  it("把文字清空，主题就没了", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addFloatingTopic(emptySidecar(), "要删掉的", 100, 100);
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.doubleClick(boxes()[0]);
    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(boxes().length).toBe(0);
    expect(lastWritten(api)?.floating).toEqual({});
  });

  it("选中之后，画布菜单里能删掉它", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addFloatingTopic(emptySidecar(), "要删掉的", 100, 100);
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    // The row only appears once a topic has been picked, and it names it.
    openCanvasMenu();
    expect(screen.queryByRole("button", { name: /删除自由主题/ })).toBeNull();
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(boxes()[0], { clientX: 120, clientY: 120, button: 0 });
    fireEvent.mouseUp(window);

    openCanvasMenu();
    const remove = screen.getByRole("button", { name: /删除自由主题/ });
    expect(remove.getAttribute("title")).toContain("要删掉的");
    fireEvent.click(remove);

    expect(boxes().length).toBe(0);
    await settle();
    expect(lastWritten(api)?.floating).toEqual({});
  });

  it("导出带上它，却不带它的选中圈", async () => {
    const api = installBridge();
    const { sidecar } = addFloatingTopic(emptySidecar(), "画布上的想法", 250, 80);
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(boxes().length).toBe(1));

    // Selected, so the ring is on screen when the file is built.
    fireEvent.mouseDown(boxes()[0], { clientX: 260, clientY: 90, button: 0 });
    fireEvent.mouseUp(window);
    expect(document.querySelector(".mindmap-floating-selection")).toBeTruthy();

    const built = buildStandaloneMindmapSvg(
      document.querySelector(".mindmap-svg-canvas") as SVGSVGElement,
      { bounds: layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试")).bounds, dark: true }
    )!;
    const doc = new DOMParser().parseFromString(built.svg, "image/svg+xml");

    expect(doc.querySelector(".mindmap-floating-topic")).toBeTruthy();
    expect(doc.querySelector(".mindmap-floating-text")?.textContent).toBe("画布上的想法");
    // Dressed, not left to the default fill a stylesheet-less file would give it.
    expect(doc.querySelector(".mindmap-floating-rect")?.getAttribute("fill")).toBe("#1e293b");
    expect(doc.querySelector(".mindmap-floating-text")?.getAttribute("font-size")).toBe("13px");
    // And no selection: a ring is a control, not part of the picture.
    expect(doc.querySelector(".mindmap-floating-selection")).toBeNull();
  });
});
