import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setRelationFields,
  toggleRelation,
} from "../services/mindmapSidecar";
import { buildStandaloneMindmapSvg } from "../services/mindmapSvgExport";
import { layoutMindmap } from "../services/mindmapLayout";

/**
 * A line's label, arrows, line style and colour, through the view.
 *
 * The geometry is in mindmap-relations.test.ts and the storage in
 * mindmap-sidecar.test.ts. Here: that a line is reachable at all with a pointer,
 * that its settings are written and drawn, and that a chosen colour is the one an
 * export keeps.
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

function installBridge(content?: string) {
  const api = {
    readMindmapSidecar: vi
      .fn()
      .mockResolvedValue(
        content ? { success: true, exists: true, content } : { success: true, exists: false }
      ),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

const lines = () => document.querySelectorAll(".mindmap-relation");
const hitPaths = () => document.querySelectorAll(".mindmap-relation-hit");
const linePath = () => document.querySelector(".mindmap-relation-line") as SVGPathElement;

function openCanvasMenu(clientX = 400, clientY = 300) {
  fireEvent.contextMenu(document.querySelector(".mindmap-svg-canvas") as Element, {
    clientX,
    clientY,
  });
}

function clickLine() {
  fireEvent.mouseDown(hitPaths()[0], { clientX: 200, clientY: 200, button: 0 });
  fireEvent.mouseUp(window);
}

function rightClickLine() {
  fireEvent.contextMenu(hitPaths()[0], { clientX: 250, clientY: 220 });
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

/** A sidecar with one line between two named topics. */
function withRelation(textA: string, textB: string, patch: Record<string, string> = {}) {
  const joined = toggleRelation(emptySidecar(), nodeIdOf(textA), nodeIdOf(textB));
  return {
    sidecar: Object.keys(patch).length
      ? setRelationFields(joined, nodeIdOf(textA), nodeIdOf(textB), patch)
      : joined,
  };
}

describe("关系线的标签、箭头、形态与颜色", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
  });

  it("线上有一条宽的无形命中区，点得到", async () => {
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    // A one-pixel curve is not something anyone hits on purpose: the target is the
    // same curve, drawn wide and invisible by the stylesheet.
    expect(hitPaths().length).toBe(1);
    expect(hitPaths()[0].classList.contains("mindmap-relation-hit")).toBe(true);
    expect(hitPaths()[0].getAttribute("d")).toBe(linePath().getAttribute("d"));

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const css = await fs.readFile(path.resolve(__dirname, "../styles.css"), "utf8");
    const hitRule = css.slice(css.indexOf(".mindmap-relation-hit"), css.indexOf("}", css.indexOf(".mindmap-relation-hit")));
    expect(hitRule).toContain("stroke-width: 14");
    expect(hitRule).toContain("stroke: transparent");

    clickLine();
    expect(document.querySelector(".mindmap-relation.is-selected")).toBeTruthy();
  });

  it("右键线打开菜单，箭头按主题名字说方向", async () => {
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    rightClickLine();

    // `forward` and `backward` are relative to the stored pair, whose order is an
    // accident of how the ids are spelled — so the menu names the topics.
    const forward = screen.getByRole("button", { name: "子节点甲 → 子节点乙" });
    const backward = screen.getByRole("button", { name: "子节点乙 → 子节点甲" });
    expect(forward.getAttribute("title")).toContain("子节点甲");
    expect(backward.getAttribute("title")).toContain("子节点乙");
  });

  it("选一个有方向的箭头：文件里记下，画上真有箭头", async () => {
    vi.useFakeTimers();
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    const api = installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    rightClickLine();
    fireEvent.click(screen.getByRole("button", { name: "子节点甲 → 子节点乙" }));

    expect(document.querySelectorAll(".mindmap-relation-arrow").length).toBe(1);
    await settle();

    expect(lastWritten(api)?.relations[0].arrow).toBe("forward");
  });

  it("双向就是两端各一个箭头", async () => {
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    const framed = setRelationFields(sidecar, nodeIdOf("子节点甲"), nodeIdOf("子节点乙"), {
      arrow: "both",
    });
    installBridge(serializeSidecar(framed));

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    expect(document.querySelectorAll(".mindmap-relation-arrow").length).toBe(2);
  });

  it("双击线写标签：文字进了文件，也画在线上", async () => {
    vi.useFakeTimers();
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    const api = installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    fireEvent.doubleClick(hitPaths()[0], { clientX: 200, clientY: 200 });

    const input = document.querySelector(".mindmap-inline-edit-input") as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "取决于环境" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();

    expect(document.querySelector(".mindmap-relation-label")?.textContent).toBe("取决于环境");
    expect(lastWritten(api)?.relations[0].label).toBe("取决于环境");
  });

  it("线条形态与颜色：选了写进元素，颜色不选就跟随主题", async () => {
    vi.useFakeTimers();
    const { sidecar } = withRelation("子节点甲", "子节点乙");
    const api = installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    // The default dash is written out, so a file that has no stylesheet still
    // arrives dashed rather than solid.
    expect(linePath().getAttribute("stroke-dasharray")).toBe("5 4");
    // No colour of its own: the line follows the theme.
    expect(linePath().getAttribute("stroke")).toBeNull();

    clickLine();
    openCanvasMenu();
    fireEvent.click(screen.getByLabelText("线条颜色 绿"));
    await settle();

    expect(linePath().getAttribute("stroke")).toBe("#34d399");
    expect(linePath().getAttribute("stroke-dasharray")).toBe("5 4");
    expect(lastWritten(api)?.relations[0].color).toBe("emerald");

    openCanvasMenu();
    fireEvent.click(screen.getByRole("button", { name: "线条 点线" }));
    await settle();

    expect(linePath().getAttribute("stroke-dasharray")).toBe("1.5 5");
    // The colour chosen a moment ago survives the next change, which is what a
    // patch is for.
    expect(lastWritten(api)?.relations[0].color).toBe("emerald");
    expect(lastWritten(api)?.relations[0].style).toBe("dotted");
  });

  it("导出：选过的颜色保住，被选中这件事不带走", async () => {
    const { sidecar } = withRelation("子节点甲", "子节点乙", { color: "rose" });
    installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(lines().length).toBe(1));

    clickLine();
    expect(document.querySelector(".mindmap-relation.is-selected")).toBeTruthy();

    const built = buildStandaloneMindmapSvg(
      document.querySelector(".mindmap-svg-canvas") as SVGSVGElement,
      { bounds: layoutMindmap(parseMarkdownToMindmapTree(SOURCE, "测试")).bounds, dark: true }
    )!;
    const doc = new DOMParser().parseFromString(built.svg, "image/svg+xml");

    // The reader's colour beats the rule table's default, on screen and in the
    // file: the rule paints what the element does not already say.
    expect(doc.querySelector(".mindmap-relation-line")?.getAttribute("stroke")).toBe("#fb7185");
    expect(doc.querySelector(".mindmap-relation-line")?.getAttribute("stroke-dasharray")).toBe("5 4");
    // A picked line is drawn heavier; that is a state of the editor, not of the
    // picture.
    expect(doc.querySelector(".mindmap-relation.is-selected")).toBeNull();
    expect(doc.querySelector(".mindmap-relation")).toBeTruthy();
  });

  it("断开：线与它的标签一起走", async () => {
    vi.useFakeTimers();
    const { sidecar } = withRelation("子节点甲", "子节点乙", { label: "写字" });
    const api = installBridge(serializeSidecar(sidecar));
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();

    clickLine();
    openCanvasMenu();
    fireEvent.click(screen.getByRole("button", { name: /断开/ }));

    expect(lines().length).toBe(0);
    await settle();
    expect(lastWritten(api)?.relations).toEqual([]);
  });
});
