import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  addBoundary,
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setBoundaryColor,
} from "../services/mindmapSidecar";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { layoutMindmap } from "../services/mindmapLayout";

/**
 * Boundaries, through the view.
 *
 * The geometry is in mindmap-groups.test.ts and the storage in
 * mindmap-sidecar.test.ts. Here: the gesture (one topic is enough), the drawing,
 * the title and the colour, and that the box keeps its colour on the way out —
 * which it does by being written on the elements rather than left to a stylesheet.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

function nodeIdOf(text: string): string {
  let found: string | null = null;
  const walk = (node: MindmapNode) => {
    if (found) return;
    if (node.text === text) found = node.id;
    node.children.forEach(walk);
  };
  walk(parseMarkdownToMindmapTree(SOURCE, "测试"));
  if (!found) throw new Error(`测试文档里没有名为「${text}」的节点`);
  return found;
}

function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

const boxes = () => document.querySelectorAll(".mindmap-boundary-box");
const titles = () => document.querySelectorAll(".mindmap-boundary-title");

function openCanvasMenu() {
  fireEvent.contextMenu(document.querySelector(".mindmap-svg-canvas") as Element, {
    clientX: 400,
    clientY: 300,
  });
}

function select(text: string, additive = false) {
  fireEvent.click(screen.getByText(text), { ctrlKey: additive, metaKey: additive });
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

describe("边界", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("选中一个主题就能加边界，写进文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    // One topic is enough, unlike a summary: a box around a single topic is a
    // statement a bracket cannot make.
    select("子节点甲");
    openCanvasMenu();
    fireEvent.click(screen.getByRole("button", { name: /为本组加边界/ }));

    expect(boxes().length).toBe(1);
    await settle();

    expect(lastWritten(api)?.boundaries["boundary-1"]?.nodeIds).toEqual([nodeIdOf("子节点甲")]);
  });

  it("同一个选中下：边界可以加，概要不行", () => {
    // The map opens with the root selected, and that one topic is the whole
    // difference between the two features — a box around one topic says "this one
    // is its own thing"; a bracket over one topic is a line beside it.
    installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    openCanvasMenu();

    const boundaryRow = screen.getByRole("button", {
      name: /为本组加边界/,
    }) as HTMLButtonElement;
    const summaryRow = screen.getByRole("button", {
      name: /为本组加概要/,
    }) as HTMLButtonElement;

    expect(boundaryRow.disabled).toBe(false);
    expect(summaryRow.disabled).toBe(true);
  });

  it("打开文档时读出边界：方框与标题都在", async () => {
    const api = installBridge();
    const { sidecar } = addBoundary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "这两种走法"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(boxes().length).toBe(1));
    expect(titles()[0].textContent).toBe("这两种走法");
    // Colour and fill are on the elements, which is what lets an export keep them.
    expect(boxes()[0].getAttribute("stroke")).toBe("#94a3b8");
    expect(boxes()[0].getAttribute("fill-opacity")).toBe("0.08");
  });

  it("双击标题改名，文字进了文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addBoundary(emptySidecar(), [nodeIdOf("父节点")], "原名");
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.doubleClick(document.querySelector(".mindmap-boundary") as Element);

    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    expect(input.value).toBe("原名");

    fireEvent.change(input, { target: { value: "改过的标题" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(titles()[0].textContent).toBe("改过的标题");
    expect(lastWritten(api)?.boundaries["boundary-1"]?.text).toBe("改过的标题");
  });

  it("配色行只在这一条被选中时出现，点了就写进去", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addBoundary(emptySidecar(), [nodeIdOf("父节点")], "一组");
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    openCanvasMenu();
    expect(screen.queryByLabelText(/边界颜色/)).toBeNull();
    fireEvent.mouseUp(window);

    // Picked by its title, the same handle the summary has.
    fireEvent.mouseDown(document.querySelector(".mindmap-boundary-title") as Element, {
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.mouseUp(window);

    openCanvasMenu();
    fireEvent.click(screen.getByLabelText("边界颜色 绿"));
    await settle();

    expect(lastWritten(api)?.boundaries["boundary-1"]?.color).toBe("emerald");
  });

  it("选中之后能删掉它", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addBoundary(emptySidecar(), [nodeIdOf("父节点")], "要删的");
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.mouseDown(document.querySelector(".mindmap-boundary-title") as Element, {
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.mouseUp(window);

    openCanvasMenu();
    fireEvent.click(screen.getByRole("button", { name: /删除边界/ }));

    expect(boxes().length).toBe(0);
    await settle();
    expect(lastWritten(api)?.boundaries).toEqual({});
  });

  it("导出保住颜色，剥掉选中框", async () => {
    const api = installBridge();
    const { sidecar, id } = addBoundary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "这两种走法"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(setBoundaryColor(sidecar, id, "emerald")),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(boxes().length).toBe(1));

    fireEvent.mouseDown(document.querySelector(".mindmap-boundary-title") as Element, {
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.mouseUp(window);
    expect(document.querySelector(".mindmap-boundary-selection")).toBeTruthy();

    const built = buildStandaloneMindmapSvg(
      document.querySelector(".mindmap-svg-canvas") as SVGSVGElement,
      { bounds: layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试")).bounds, dark: false }
    )!;
    const doc = new DOMParser().parseFromString(built.svg, "image/svg+xml");
    const box = doc.querySelector(".mindmap-boundary-box");

    // Written on the elements, so cloning the canvas carries it — no rule needed.
    expect(box?.getAttribute("stroke")).toBe("#34d399");
    expect(box?.getAttribute("fill")).toBe("#34d399");
    expect(doc.querySelector(".mindmap-boundary-title")?.getAttribute("fill")).toBe("#34d399");
    expect(doc.querySelector(".mindmap-boundary-title")?.textContent).toBe("这两种走法");
    expect(doc.querySelector(".mindmap-boundary-selection")).toBeNull();
  });
});


