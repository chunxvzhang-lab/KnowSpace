import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setNodeLink,
} from "../services/mindmapSidecar";

/**
 * Links on nodes, through the view.
 *
 * The forms are checked in mindmap-link-parse.test.ts and the storing in
 * mindmap-sidecar.test.ts. What is checked here is the part with no equivalent
 * elsewhere: that each form reaches the channel the rest of the app already uses
 * for it, and that a form this build cannot follow is shown as such rather than
 * accepted and quietly ignored.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

/** The id of the node with this text, anywhere in the tree; throws if absent. */
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

function sidecarWithLink(text: string, link: string): string {
  return serializeSidecar(setNodeLink(emptySidecar(), nodeIdOf(text), link));
}

function installBridge() {
  const api = {
    readMindmapSidecar: vi.fn().mockResolvedValue({ success: true, exists: false }),
    saveMindmapSidecar: vi.fn().mockResolvedValue({ success: true }),
    openExternal: vi.fn().mockResolvedValue(true),
  };
  (window as unknown as Record<string, unknown>).knowSpaceDesktop = api;
  return api;
}

function openPanelFor(text: string) {
  fireEvent.click(screen.getByText(text));
  fireEvent.click(screen.getByRole("button", { name: "外观样式" }));
}

const markers = () => document.querySelectorAll(".mindmap-link-marker");
const linkField = () => document.querySelector(".mindmap-link-input") as HTMLInputElement;
const openButton = () => screen.queryByRole("button", { name: "打开" }) as HTMLButtonElement | null;

function lastWritten(api: ReturnType<typeof installBridge>) {
  const call = api.saveMindmapSidecar.mock.calls.at(-1);
  return call ? parseSidecar(call[0].content as string) : null;
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

describe("节点链接", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("外链：画布上有标记，面板说去哪儿，「打开」交给系统", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "https://example.com/spec"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(markers().length).toBe(1));

    openPanelFor("父节点");

    expect(linkField().value).toBe("https://example.com/spec");
    expect(screen.getByText("外部链接")).toBeTruthy();

    fireEvent.click(openButton()!);

    expect(api.openExternal).toHaveBeenCalledWith("https://example.com/spec");
  });

  it("本文档标题：走既有的跳转通道，并且真的找到了那个节点", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const onJumpToHeading = vi.fn();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "#子节点甲"),
    });

    render(
      <MindmapView
        title="测试"
        source={SOURCE}
        documentKey={DOC}
        onJumpToHeading={onJumpToHeading}
      />
    );
    await settle();
    openPanelFor("父节点");

    expect(screen.getByText("本文档的 #子节点甲")).toBeTruthy();
    fireEvent.click(openButton()!);

    // The id, not the text: the map jumps the way the reader's outline does.
    expect(onJumpToHeading).toHaveBeenCalledWith(nodeIdOf("子节点甲"), expect.anything());
  });

  it("标题写错了就什么都不做 —— 落在附近比不跳更糟", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const onJumpToHeading = vi.fn();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "#不存在的标题"),
    });

    render(
      <MindmapView title="测试" source={SOURCE} documentKey={DOC} onJumpToHeading={onJumpToHeading} />
    );
    await settle();
    openPanelFor("父节点");

    fireEvent.click(openButton()!);

    expect(onJumpToHeading).not.toHaveBeenCalled();
  });

  it("内部文档：交给和阅读器同一个解析器，锚点一起带上", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    const onWikiLinkClick = vi.fn();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "[[产品设计#验收标准]]"),
    });

    render(
      <MindmapView title="测试" source={SOURCE} documentKey={DOC} onWikiLinkClick={onWikiLinkClick} />
    );
    await settle();
    openPanelFor("父节点");

    expect(screen.getByText("文档「产品设计」的 #验收标准")).toBeTruthy();
    fireEvent.click(openButton()!);

    // Whole, with the anchor: resolving `doc#heading` is the reader's business.
    expect(onWikiLinkClick).toHaveBeenCalledWith("产品设计#验收标准");
  });

  it("调用方没能打开另一篇文档时，「打开」是禁用的并说明原因", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "[[产品设计]]"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();
    openPanelFor("父节点");

    // Offered but disabled, rather than hidden: a control that vanishes teaches
    // nothing about why the link cannot be followed.
    expect(openButton()?.disabled).toBe(true);
    expect(openButton()?.getAttribute("title")).toContain("通道");
  });

  it("写进字段就存原文，停一下落到文件", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    fireEvent.change(linkField(), { target: { value: "[[产品设计|别名]]" } });

    // Stored as typed, including a form this build cannot follow: throwing it
    // away is not this version's decision to make.
    expect(screen.getByText("不是可识别的链接")).toBeTruthy();
    expect(markers().length).toBe(0);

    await settle();

    expect(lastWritten(api)?.links[nodeIdOf("父节点")]).toBe("[[产品设计|别名]]");
  });

  it("清除后标记消失，文件里也不再留着", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithLink("父节点", "https://example.com"),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await settle();
    expect(markers().length).toBe(1);

    openPanelFor("父节点");
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(markers().length).toBe(0);

    await settle();

    expect(lastWritten(api)?.links).toEqual({});
  });
});
