import { describe, it, expect } from "vitest";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { layoutMindmap } from "../services/mindmapLayout";
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setNodeSide,
  sideFor,
} from "../services/mindmapSidecar";
import type { MindmapSide } from "../core/mindmapSides";

/**
 * 双向布局里「哪一支在哪一边」。
 *
 * 布局自己的规则是"哪边矮放哪边"（见 mindmapLayout 里的说明）：它把画面配平得很好，却让
 * 读者无从表达「先做的一半放左边」。这个文件钉住两件事 —— 没人指定时平衡规则照旧，有人
 * 指定时按指定；以及这份指定在 sidecar 里往返之后还在。
 */
const SOURCE = ["- 分支一", "  - 一甲", "  - 一乙", "- 分支二", "- 分支三"].join("\n");

function layoutWith(sides: Record<string, MindmapSide>) {
  const parsed = parseMarkdownToMindmapTree(SOURCE, "根");
  const layout = layoutMindmap(parsed, new Set(), "bidirectional", sides);
  const sideOf = (nodeId: string) => layout.nodes.find((node) => node.id === nodeId)?.side;
  return { parsed, sideOf };
}

describe("双向布局的左右", () => {
  it("没人指定时，仍按高度平衡：高的一支占一边，其余去另一边", () => {
    const { parsed, sideOf } = layoutWith({});

    // 第一支最高，而两侧都是空的 —— 平局按规则去右侧；之后两支都去更矮的左侧。
    expect(sideOf(parsed.children[0].id)).toBe("right");
    expect(sideOf(parsed.children[1].id)).toBe("left");
    expect(sideOf(parsed.children[2].id)).toBe("left");
  });

  it("指定了侧的分支，按指定放", () => {
    const { parsed, sideOf } = layoutWith({});

    // 先看没人指定时它在哪一边，再把另一边填进 sides，断言它真的过去了。
    const before = sideOf(parsed.children[0].id);
    const wanted: MindmapSide = before === "left" ? "right" : "left";

    const forced = layoutWith({ [parsed.children[0].id]: wanted });
    expect(forced.sideOf(parsed.children[0].id)).toBe(wanted);
  });

  it("被指定的分支计入平衡：其余分支避开它", () => {
    const { parsed } = layoutWith({});

    // 把最高的一支钉在左侧，右侧就空着 —— 于是后面几支都该去右侧。
    const forced = layoutWith({ [parsed.children[0].id]: "left" });
    expect(forced.sideOf(parsed.children[0].id)).toBe("left");
    expect(forced.sideOf(parsed.children[1].id)).toBe("right");
    expect(forced.sideOf(parsed.children[2].id)).toBe("right");
  });

  it("更深层的节点跟着自己那一支走，各自不单独分侧", () => {
    const { parsed, sideOf } = layoutWith({});

    // 分支一 的子树与它同侧，无论它在左还是在右。
    const branch = parsed.children[0];
    const branchSide = sideOf(branch.id);
    expect(branchSide).toBeTruthy();
    expect(sideOf(branch.children[0].id)).toBe(branchSide);
  });
});

describe("侧在伴生文件里的往返", () => {
  it("写出去再读回来，sides 还在", () => {
    const sidecar = setNodeSide(setNodeSide(emptySidecar(), "a", "left"), "b", "right");

    const read = parseSidecar(serializeSidecar(sidecar));

    expect(read?.sides).toEqual({ a: "left", b: "right" });
  });

  it("不认识的值不留：那不是一个能画出来的位置", () => {
    // 其它段落里，不认识的值要**保留**（那是更新版本写的东西，丢掉会让回去用新版本有损）。
    // 侧不一样：它没有第三种，读不懂就退回平衡规则 —— 也就是它本来会待的地方。
    const read = parseSidecar('{\n  "version": 1,\n  "sides": { "a": "middle", "b": "left" }\n}\n');

    expect(read?.sides).toEqual({ b: "left" });
  });

  it("setNodeSide(null) 把分支交还给布局", () => {
    const placed = setNodeSide(emptySidecar(), "a", "left");
    expect(sideFor(placed, "a")).toBe("left");

    const cleared = setNodeSide(placed, "a", null);
    expect(sideFor(cleared, "a")).toBeNull();
    // 交还之后这个段落是空的，于是不写进文件 —— 空的段落在文件里像是一个决定。
    expect(serializeSidecar(cleared)).not.toContain("sides");
  });
});
