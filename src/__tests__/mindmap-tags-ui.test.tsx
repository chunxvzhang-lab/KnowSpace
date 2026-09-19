import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MindmapView } from "../components/MindmapView";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setNodeTags,
} from "../services/mindmapSidecar";

/**
 * Tags, through the view.
 *
 * The rules for reading and writing them are checked in mindmap-sidecar.test.ts.
 * What is checked here is the two places they meet a person: chips under the
 * node, and a field whose value is a parse of what is stored — which is why the
 * field keeps its own text while it is being typed, and why that text must not
 * follow the reader to another node.
 */

const SOURCE = ["- 父节点", "  - 子节点甲", "  - 子节点乙", "- 第二个分支"].join("\n");
const DOC = "/vault/notes/a.md";

/**
 * The id of the node with this text, anywhere in the document.
 *
 * Searches the whole tree, and throws when the text is not there. An earlier
 * version looked only at the first level and fell back to the first child when
 * it found nothing — which quietly pointed two different tags at the same node,
 * and made a failing expectation look like a passing one.
 */
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

function sidecarWithTags(text: string, tags: string[]): string {
  return serializeSidecar(setNodeTags(emptySidecar(), nodeIdOf(text), tags));
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

const chipRows = () => document.querySelectorAll(".mindmap-node-tags");
const chips = () => document.querySelectorAll(".mindmap-tag-chip");

/**
 * How many chips one node wears.
 *
 * Counted per node rather than across the map: with tags on two nodes, a
 * document-wide count says "2" for reasons that have nothing to do with the node
 * being tested, and a wrong expectation then reads as a right one.
 */
function chipsOf(text: string): number {
  const group = [...document.querySelectorAll(".mindmap-node-interactive")].find((el) =>
    el.textContent?.includes(text)
  );
  return group ? group.querySelectorAll(".mindmap-tag-chip").length : 0;
}
const tagField = () => document.querySelector(".mindmap-tag-input") as HTMLInputElement;
/**
 * The suggestion chip for a tag.
 *
 * Selected by its own class rather than by accessible name: the name would be
 * "#api 1" — the chip carries its count — and an assertion that has to guess at
 * that is an assertion about the name computation, not about the chip.
 */
function suggestion(tag: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".mindmap-tag-suggestion")].find((el) =>
    el.textContent?.startsWith(`#${tag}`)
  );
  if (!found) throw new Error(`没有 #${tag} 的建议芯片`);
  return found;
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

describe("节点标签", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).knowSpaceDesktop;
    delete (window as unknown as Record<string, unknown>).bookMDDesktop;
  });

  it("打开文档时读出标签，画在节点下方", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithTags("父节点", ["api", "紧急"]),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(chipRows().length).toBe(1));
    expect(chips().length).toBe(2);
    expect(document.querySelector(".mindmap-tag-chip-text")?.textContent).toBe("#api");
  });

  it("标签多于三枚时收成「+n」", async () => {
    // A map is not a tag cloud: a node wearing twenty tags is a wall of text
    // with a node somewhere in it.
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: sidecarWithTags("父节点", ["a", "b", "c", "d", "e"]),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);

    await waitFor(() => expect(chips().length).toBe(4));
    const texts = [...document.querySelectorAll(".mindmap-tag-chip-text")].map((el) => el.textContent);
    expect(texts).toEqual(["#a", "#b", "#c", "+2"]);
  });

  it("在字段里写一串，离开时按规则存下", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    fireEvent.change(tagField(), { target: { value: "#api, 紧急 、api" } });
    // Still being typed: nothing has been stored yet, and the field keeps the
    // separators a controlled-from-the-parse field would have eaten.
    expect(tagField().value).toBe("#api, 紧急 、api");

    fireEvent.blur(tagField());

    // Committed: normalised on screen and in the file.
    expect(tagField().value).toBe("api 紧急");
    expect(chips().length).toBe(2);

    await settle();

    expect(lastWritten(api)?.tags[nodeIdOf("父节点")]).toEqual(["api", "紧急"]);
  });

  it("回车上报，和离开字段一样", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    fireEvent.change(tagField(), { target: { value: "api" } });
    fireEvent.keyDown(tagField(), { key: "Enter" });

    await settle();

    expect(lastWritten(api)?.tags[nodeIdOf("父节点")]).toEqual(["api"]);
  });

  it("半途写的字不会跟到另一个节点上", async () => {
    vi.useFakeTimers();
    const api = installBridge();
    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    openPanelFor("父节点");

    // Typed but never committed.
    fireEvent.change(tagField(), { target: { value: "还没写完" } });

    openPanelFor("子节点甲");

    // The other node's field shows the other node's tags — nothing at all...
    expect(tagField().value).toBe("");
    // ...and nothing was stored for either of them.
    await settle();
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });

  it("点一下建议就把标签加上，再点一下去掉", async () => {
    // Real timers, because the chips come from the loaded companion and the
    // write is meant to land on its own: with the clock faked, React's pending
    // updates from that load never flush, and the test would be asserting about
    // a panel that has not been told anything yet.
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      // 父节点 already wears one; 子节点甲 wears the other, which is what makes
      // it worth offering as a chip at all.
      content: serializeSidecar(
        setNodeTags(setNodeTags(emptySidecar(), nodeIdOf("父节点"), ["api"]), nodeIdOf("子节点甲"), ["紧急"])
      ),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(chipsOf("父节点")).toBe(1));
    expect(chipsOf("子节点甲")).toBe(1);

    openPanelFor("父节点");

    // Both of the document's tags are offered: the one this node wears and the
    // one the other node does.
    expect(document.querySelectorAll(".mindmap-tag-suggestion").length).toBe(2);

    // The one already on this node reads as active, the other does not.
    expect(suggestion("api").className).toContain("is-active");
    expect(suggestion("紧急").className).not.toContain("is-active");

    fireEvent.click(suggestion("紧急"));
    expect(suggestion("紧急").className).toContain("is-active");
    expect(chipsOf("父节点")).toBe(2);
    // The other node is untouched: the chips edit this node's list, not the map's.
    expect(chipsOf("子节点甲")).toBe(1);

    fireEvent.click(suggestion("api"));
    expect(chipsOf("父节点")).toBe(1);

    // ...and `api` is now used nowhere in the document, so it stops being
    // offered: the chips are the document's own vocabulary, not a fixed list.
    expect(document.querySelectorAll(".mindmap-tag-suggestion").length).toBe(1);

    await waitFor(() =>
      expect(lastWritten(api)?.tags[nodeIdOf("父节点")]).toEqual(["紧急"])
    );
  });

  it("文件里的标签不像样：不画、不报错，也不擦", async () => {
    const api = installBridge();
    api.readMindmapSidecar.mockResolvedValueOnce({
      success: true,
      exists: true,
      content: JSON.stringify({ version: 1, tags: { [nodeIdOf("父节点")]: "不是列表" } }),
    });

    render(<MindmapView title="测试" source={SOURCE} documentKey={DOC} />);
    await waitFor(() => expect(api.readMindmapSidecar).toHaveBeenCalled());

    expect(screen.getByText("父节点")).toBeTruthy();
    expect(chipRows().length).toBe(0);
    expect(api.saveMindmapSidecar).not.toHaveBeenCalled();
  });
});
