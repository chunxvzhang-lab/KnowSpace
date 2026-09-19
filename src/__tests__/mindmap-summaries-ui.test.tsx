import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import { addSummary, emptySidecar, parseSidecar, serializeSidecar } from "../services/mindmapSidecar";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { layoutMindmap } from "../services/mindmapLayout";

/**
 * Summaries, through the view.
 *
 * The geometry is checked in mindmap-groups.test.ts and the storage in
 * mindmap-sidecar.test.ts. What is checked here is the gesture and the drawing:
 * a group of selected topics becomes a bracket, its label renames, picking it
 * makes it removable, and it travels into an export dressed rather than black.
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

const brackets = () => document.querySelectorAll(".mindmap-summary-bracket");
const labels = () => document.querySelectorAll(".mindmap-summary-label");

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

describe("概要", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("选中两个主题就能加概要，写进文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    select("子节点甲");
    select("子节点乙", true);
    openCanvasMenu();

    const row = screen.getByRole("button", { name: /为本组加概要/ }) as HTMLButtonElement;
    expect(row.disabled).toBe(false);
    fireEvent.click(row);

    expect(brackets().length).toBe(1);

    await settle();

    expect(lastWritten(api)?.summaries["summary-1"]?.nodeIds).toEqual([
      nodeIdOf("子节点甲"),
      nodeIdOf("子节点乙"),
    ]);
  });

  it("只选一个主题时那一行不可点，并说明为什么", () => {
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    select("父节点");
    openCanvasMenu();

    const row = screen.getByRole("button", { name: /为本组加概要/ }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.getAttribute("title")).toContain("先选中两个或更多");
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("打开文档时读出概要：括号与标签都在", async () => {
    const api = installBridge();
    const { sidecar } = addSummary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "两种走法"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(brackets().length).toBe(1));
    expect(labels()[0].textContent).toBe("两种走法");
    // Beside the group it spans, at the group's own vertical centre.
    const box = document.querySelector(".mindmap-summary") as SVGElement;
    expect(box).toBeTruthy();
  });

  it("双击标签改名，文字进了文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addSummary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "原名"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.doubleClick(document.querySelector(".mindmap-summary") as Element);

    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    expect(input.value).toBe("原名");

    fireEvent.change(input, { target: { value: "改过的说明" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(labels()[0].textContent).toBe("改过的说明");
    expect(lastWritten(api)?.summaries["summary-1"]?.text).toBe("改过的说明");
  });

  it("选中之后，画布菜单里能删掉它", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const { sidecar } = addSummary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "要删掉的"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    // Not offered until a summary has been picked.
    openCanvasMenu();
    expect(screen.queryByRole("button", { name: /删除概要/ })).toBeNull();
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(document.querySelector(".mindmap-summary") as Element, {
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.mouseUp(window);

    openCanvasMenu();
    const remove = screen.getByRole("button", { name: /删除概要/ });
    expect(remove.getAttribute("title")).toContain("要删掉的");
    fireEvent.click(remove);

    expect(brackets().length).toBe(0);
    await settle();
    expect(lastWritten(api)?.summaries).toEqual({});
  });

  it("导出带上括号与标签，却不带选中框", async () => {
    const api = installBridge();
    const { sidecar } = addSummary(
      emptySidecar(),
      [nodeIdOf("子节点甲"), nodeIdOf("子节点乙")],
      "两种走法"
    );
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(sidecar),
    });
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(brackets().length).toBe(1));

    fireEvent.mouseDown(document.querySelector(".mindmap-summary") as Element, {
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.mouseUp(window);
    expect(document.querySelector(".mindmap-summary-selection")).toBeTruthy();

    const built = buildStandaloneMindmapSvg(
      document.querySelector(".mindmap-svg-canvas") as SVGSVGElement,
      { bounds: layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试")).bounds, dark: true }
    )!;
    const doc = new DOMParser().parseFromString(built.svg, "image/svg+xml");

    expect(doc.querySelector(".mindmap-summary-bracket")?.getAttribute("stroke")).toBe("#f0b429");
    expect(doc.querySelector(".mindmap-summary-bracket")?.getAttribute("fill")).toBe("none");
    expect(doc.querySelector(".mindmap-summary-label")?.textContent).toBe("两种走法");
    expect(doc.querySelector(".mindmap-summary-label")?.getAttribute("fill")).toBe("#fcd34d");
    // A selection is a control, not part of the picture.
    expect(doc.querySelector(".mindmap-summary-selection")).toBeNull();
  });
});
