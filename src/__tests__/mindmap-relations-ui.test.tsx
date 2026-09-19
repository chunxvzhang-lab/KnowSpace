import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  toggleRelation,
} from "../services/mindmapSidecar";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { layoutMindmap } from "../services/mindmapLayout";

/**
 * Relations between topics, through the view.
 *
 * The geometry is checked in mindmap-relations.test.ts and the storage in
 * mindmap-sidecar.test.ts. What is checked here is the gesture and the drawing:
 * two selected topics are what a relation needs, a line that is drawn appears,
 * a line whose topic is folded away does not, and the line travels with an
 * export because it is part of the canvas rather than a decoration added later.
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

const lines = () => document.querySelectorAll(".mindmap-relation");

/** Opens the canvas menu by right-clicking empty space, as a reader would. */
function openCanvasMenu() {
  fireEvent.contextMenu(document.querySelector(".mindmap-svg-canvas") as Element, {
    clientX: 10,
    clientY: 10,
  });
}

/** Selects a node, adding it to the selection when asked. */
function select(text: string, additive = false) {
  fireEvent.click(screen.getByText(text), { ctrlKey: additive, metaKey: additive });
}

/**
 * The collapse toggle of one node.
 *
 * Found through the node's own group rather than by index: the toggles are `<g>`
 * elements inside the canvas, so there is no role to ask for, and counting them
 * would make this test depend on the layout's node order.
 */
function collapseToggleOf(text: string): Element {
  const group = [...document.querySelectorAll(".mindmap-node-interactive")].find((el) =>
    el.textContent?.includes(text)
  );
  const toggle = group?.querySelector(".mindmap-collapse-btn");
  if (!toggle) throw new Error(`「${text}」没有折叠按钮`);
  return toggle;
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

describe("关系线", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("打开文档时读出关系，画在节点之下", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(
        toggleRelation(emptySidecar(), nodeIdOf("父节点"), nodeIdOf("第二个分支"))
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(lines().length).toBe(1));
    // The dashed line is drawn before the edges and the nodes, so it passes
    // under them rather than across their labels.
    const before = document.querySelector(".mindmap-relations") as Element;
    expect(before.compareDocumentPosition(document.querySelector(".mindmap-edges-group") as Node))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("选中两个主题就能连上：菜单里一行，点了就存", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    select("父节点");
    select("子节点甲", true);
    openCanvasMenu();

    const row = screen.getByRole("button", { name: /连接这两个主题/ });
    expect((row as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(row);

    expect(lines().length).toBe(1);

    await settle();

    expect(lastWritten(api)?.relations).toEqual([
      { fromId: nodeIdOf("父节点"), toId: nodeIdOf("子节点甲") },
    ]);
  });

  it("已连上的两个主题，菜单里那一行是取消", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    select("父节点");
    select("子节点甲", true);
    openCanvasMenu();
    const connect = screen.getByRole("button", { name: /连接这两个主题/ }) as HTMLButtonElement;
    expect(connect.disabled, "两个主题都选中了，这一行应当可用").toBe(false);
    fireEvent.click(connect);

    // Immediately: the click turned into a line on the canvas.
    expect(lines().length, "点完就该有线").toBe(1);

    await settle();

    // The write carried it: if this is the assertion that fails, the state lost
    // the relation; if it passes and the line is gone, the state has it and the
    // drawing no longer finds both ends.
    expect(lastWritten(api)?.relations, "写入的内容里应当有这条关系").toHaveLength(1);
    expect(lines().length, "落盘之后仍然有线").toBe(1);

    openCanvasMenu();
    const removal = screen.getByRole("button", { name: /取消关系线/ });
    fireEvent.click(removal);

    expect(lines().length).toBe(0);
    await settle();

    expect(lastWritten(api)?.relations).toEqual([]);
  });

  it("只选一个主题时那一行不可点，并说明为什么", async () => {
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    select("父节点");
    openCanvasMenu();

    const row = screen.getByRole("button", { name: /连接这两个主题/ }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.getAttribute("title")).toContain("先选中两个主题");
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("一端被折叠时线不画 —— 但关系本身还在", async () => {
    // The line needs both boxes, and a folded branch keeps its children off the
    // canvas. The relation is not the thing that should be lost over that.
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(
        toggleRelation(emptySidecar(), nodeIdOf("父节点"), nodeIdOf("子节点甲"))
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    // Fold the branch that holds one end of the line.
    fireEvent.click(collapseToggleOf("父节点"));

    expect(lines().length).toBe(0);
    // Nothing was written: hiding a node is not a decision about the relation.
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("关系线跟着导出出门，并且带着它的虚线", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: serializeSidecar(
        toggleRelation(emptySidecar(), nodeIdOf("父节点"), nodeIdOf("第二个分支"))
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    const built = buildStandaloneMindmapSvg(
      document.querySelector(".mindmap-svg-canvas") as SVGSVGElement,
      { bounds: layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试")).bounds, dark: true }
    )!;
    const doc = new DOMParser().parseFromString(built.svg, "image/svg+xml");
    const line = doc.querySelector(".mindmap-relation");

    // Without these the file would draw a black filled shape where a line should
    // be: the stylesheet that paints it does not travel with the file.
    expect(line?.getAttribute("fill")).toBe("none");
    expect(line?.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(line?.getAttribute("stroke")).toBe("#b28ae0");
  });
});
