import { describe, expect, it } from "vitest";
import {
  captureAiTarget,
  creationContent,
  applyAiEdits,
  inferAiCreationMode,
  planAiInsertion,
} from "../services/aiCreation";
import type { DocumentSession } from "../core/types";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";

const session: DocumentSession = {
  chapterId: "a",
  absolutePath: "C:/notes/a.md",
  fileName: "a.md",
  baseUrl: "",
  source: "# 原文\n\n已有事实。",
  savedSource: "",
  sourceRevision: 2,
  savedRevision: 1,
  diskVersion: null,
  writable: true,
};

describe("conversation creation", () => {
  it("preserves untouched mixed line endings and BOM while matching a normalized multiline passage", () => {
    const original = "\ufeff# 标题\r\n\r\n旧段\r\n第二行\n\n尾段\r\n";
    expect(
      applyAiEdits(
        original,
        JSON.stringify({ edits: [{ before: "旧段\n第二行", after: "新段" }] }),
      ),
    ).toBe("\ufeff# 标题\r\n\r\n新段\n\n尾段\r\n");
  });
  it("applies multiple nonoverlapping edits against the original and supports deletion", () => {
    expect(
      applyAiEdits(
        "# 标题\n\n旧段落\n\n尾段",
        JSON.stringify({
          edits: [
            { before: "尾段", after: "" },
            { before: "旧段落", after: "新段落" },
          ],
        }),
      ),
    ).toBe("# 标题\n\n新段落\n\n");
  });
  it.each([
    "## 修订说明\n标题应改为测试。",
    JSON.stringify({ edits: [] }),
    JSON.stringify({ edits: [{ before: "不存在", after: "测试" }] }),
    JSON.stringify({
      edits: [
        { before: "标题", after: "甲" },
        { before: "# 标题", after: "乙" },
      ],
    }),
    JSON.stringify({ edits: [{ before: "", after: "测试" }] }),
    JSON.stringify({ edits: [{ before: "# 标题", after: "# 标题" }] }),
  ])("refuses unsafe or explanatory edit output without changing the document", (text) => {
    expect(() => applyAiEdits("# 标题\n\n正文", text)).toThrow();
  });
  it("refuses ambiguous repeated text and requires exact original context", () => {
    expect(() =>
      applyAiEdits("甲\n甲", JSON.stringify({ edits: [{ before: "甲", after: "乙" }] })),
    ).toThrow("未唯一匹配");
  });
  it("changes the existing first heading instead of appending revision instructions", () => {
    const current = { ...session, source: "# 未命名\r\n\r\n保留原文。\r\n" };
    expect(inferAiCreationMode("文件一级标题改为测试")).toBe("edit");
    expect(
      planAiInsertion(
        current,
        captureAiTarget(current, null),
        JSON.stringify({ edits: [{ before: "# 未命名", after: "# 测试" }] }),
        "edit",
        "append",
      ),
    ).toBe("# 测试\r\n\r\n保留原文。\r\n");
  });
  it.each([
    ["补充一段结论", "create"],
    ["生成思维导图", "mindmap"],
    ["把它做成白板卡片", "canvas"],
  ] as const)("recognizes %s", (prompt, mode) => {
    expect(inferAiCreationMode(prompt)).toBe(mode);
  });
  it.each([
    "将思维导图中的准备分支改为需求调研",
    "把白板卡片的预算改成20万元",
    "删除白板中的执行验收卡片",
    "在脑图的准备分支下添加一个子节点",
    "在思维导图中新增一个分支",
    "给预算卡片补充负责人",
    "add a child node to the mind map",
    "将思维导图的准备阶段重命名为需求分析",
  ])("routes existing diagram changes to exact editing: %s", (prompt) => {
    expect(inferAiCreationMode(prompt)).toBe("edit");
  });
  it("updates a mindmap branch without duplicating the map or losing body and annotations", () => {
    const current = {
      ...session,
      source:
        "# 计划\r\n\r\n保留正文。\r\n\r\n- 准备 <!-- style: color=#10b981 -->\r\n  - 调研\r\n- 实施\r\n",
    };
    const next = planAiInsertion(
      current,
      captureAiTarget(current, null),
      JSON.stringify({
        edits: [
          { before: "- 准备", after: "- 需求分析" },
          { before: "  - 调研", after: "  - 调研\n  - 访谈" },
        ],
      }),
      "edit",
      "append",
    );
    expect(next).toBe(
      current.source.replace("- 准备", "- 需求分析").replace("  - 调研", "  - 调研\r\n  - 访谈"),
    );
  });
  it("modifies only the identified card and preserves all board structure", () => {
    const board = {
      nodes: [
        {
          id: "a",
          type: "text",
          text: "## 预算\n\n10万元",
          x: 1,
          y: 2,
          width: 340,
          height: 220,
          color: "3",
          custom: { keep: true },
        },
        { id: "b", type: "text", text: "## 预算\n\n10万元", x: 500, y: 2, width: 340, height: 220 },
        { id: "image", type: "file", file: "image.png", x: 900, y: 2, width: 320, height: 240 },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "b", custom: "edge" }],
      custom: { keep: true },
    };
    const current = { ...session, fileName: "a.canvas", source: JSON.stringify(board) };
    const next = JSON.parse(
      planAiInsertion(
        current,
        captureAiTarget(current, null),
        JSON.stringify({
          edits: [{ nodeId: "b", before: "10万元", after: "20万元" }],
        }),
        "edit",
        "append",
      ),
    );
    expect(next).toEqual({
      ...board,
      nodes: board.nodes.map((n) =>
        n.id === "b" ? { ...n, text: n.text!.replace("10万元", "20万元") } : n,
      ),
    });
    const deleted = JSON.parse(
      planAiInsertion(
        current,
        captureAiTarget(current, null),
        JSON.stringify({
          edits: [{ nodeId: "a", before: board.nodes[0].text, after: "" }],
        }),
        "edit",
        "append",
      ),
    );
    expect(deleted).toEqual({ ...board, nodes: board.nodes.slice(1), edges: [] });
    for (const edits of [
      [{ before: "10万元", after: "20万元" }],
      [{ nodeId: "missing", before: "10万元", after: "20万元" }],
      [{ nodeId: "image", before: "image.png", after: "other.png" }],
      [{ nodeId: "a", before: "不存在", after: "20万元" }],
    ])
      expect(() =>
        planAiInsertion(
          current,
          captureAiTarget(current, null),
          JSON.stringify({ edits }),
          "edit",
          "append",
        ),
      ).toThrow();
    expect(current.source).toBe(JSON.stringify(board));
  });
  it("appends to an existing document without removing any content", () => {
    const target = captureAiTarget(session, null);
    expect(planAiInsertion(session, target, "## 结论\n\n下一步。", "create", "append")).toBe(
      session.source + "\n\n## 结论\n\n下一步。",
    );
  });
  it("inserts at the captured cursor without replacing text on either side", () => {
    const target = { ...captureAiTarget(session, null), cursor: 5 };
    const result = planAiInsertion(session, target, "新增", "create", "cursor");
    expect(result.startsWith(session.source.slice(0, 5))).toBe(true);
    expect(result.endsWith(session.source.slice(5))).toBe(true);
    expect(result).toContain("新增");
  });
  it("accepts an empty document and preserves CRLF in an existing one", () => {
    const blank = { ...session, source: "" };
    expect(planAiInsertion(blank, captureAiTarget(blank, null), "正文", "create", "append")).toBe(
      "正文",
    );
    const crlf = { ...session, source: "# 标题\r\n" };
    expect(
      planAiInsertion(crlf, captureAiTarget(crlf, null), "## 分支\n正文", "create", "append"),
    ).toBe("# 标题\r\n\r\n## 分支\r\n正文");
  });
  it("refuses changes, file switches, read-only documents and blank results", () => {
    const target = captureAiTarget(session, null);
    for (const changed of [
      { ...session, sourceRevision: 3 },
      { ...session, source: "changed" },
      { ...session, absolutePath: "C:/other/a.md" },
      { ...session, chapterId: "b" },
      { ...session, writable: false },
    ]) {
      expect(() => planAiInsertion(changed, target, "新内容", "create", "append")).toThrow(
        /变化|切换/,
      );
    }
    expect(() => planAiInsertion(session, target, "  ", "create", "append")).toThrow(/为空/);
    expect(() => planAiInsertion(session, target, "```md\n\n```", "create", "append")).toThrow(
      /为空/,
    );
  });
  it("validates mind map branches and unwraps a complete Markdown fence", () => {
    expect(
      creationContent("mindmap", "```markdown\n# 计划\n\n- 准备\n  - 调研\n- 实施\n```"),
    ).toContain("- 准备");
    expect(() => creationContent("mindmap", "只是一句说明")).toThrow(/脑图|导图/);
  });
  it.each([session.source, "# 现有脑图\n\n- 原分支\n  - 原子节点"])(
    "keeps generated branches visible when appended to %s",
    (source) => {
      const current = { ...session, source };
      const next = planAiInsertion(
        current,
        captureAiTarget(current, null),
        "# 新脑图\n\n- 准备\n  - 调研\n- 实施",
        "mindmap",
        "append",
      );
      const tree = parseMarkdownToMindmapTree(next);
      const text = JSON.stringify(tree);
      expect(next.startsWith(source)).toBe(true);
      for (const label of ["新脑图", "准备", "调研", "实施"]) expect(text).toContain(label);
      if (source.includes("原分支")) expect(text).toContain("原子节点");
    },
  );
  it("builds unique, nonoverlapping editable whiteboard text cards", () => {
    const board = JSON.parse(
      creationContent(
        "canvas",
        JSON.stringify({
          cards: [
            { title: "准备", content: "完成调研" },
            { title: "实施", content: "验证结果" },
          ],
        }),
      ),
    );
    expect(board.nodes).toHaveLength(2);
    expect(board.nodes[0]).toMatchObject({ type: "text", text: "## 准备\n\n完成调研" });
    expect(board.nodes[1].x).toBeGreaterThanOrEqual(board.nodes[0].x + board.nodes[0].width);
    expect(new Set(board.nodes.map((node: { id: string }) => node.id)).size).toBe(2);
  });
  it.each([
    "oops",
    "{",
    '{"cards":[]}',
    '{"cards":[{"title":"A","content":42}]}',
    JSON.stringify({ cards: Array.from({ length: 25 }, () => ({ title: "A", content: "B" })) }),
  ])("refuses malformed card output %s", (text) => {
    expect(() => creationContent("canvas", text)).toThrow();
  });
  it("appends cards without overwriting original nodes, edges or extension fields", () => {
    const source = JSON.stringify({
      nodes: [
        {
          id: "original",
          type: "text",
          text: "旧卡片",
          x: 600,
          y: 200,
          width: 300,
          height: 200,
          custom: 1,
        },
      ],
      edges: [],
      customField: "keep",
    });
    const canvas = { ...session, source, fileName: "a.canvas" };
    const result = JSON.parse(
      planAiInsertion(
        canvas,
        captureAiTarget(canvas, null),
        '{"cards":[{"title":"新卡片","content":"内容"}]}',
        "canvas",
        "append",
      ),
    );
    expect(result.nodes[0]).toEqual(JSON.parse(source).nodes[0]);
    expect(result.customField).toBe("keep");
    expect(result.nodes[1].x).toBeGreaterThan(900);
    expect(() =>
      planAiInsertion(
        session,
        captureAiTarget(session, null),
        '{"cards":[{"title":"A","content":"B"}]}',
        "canvas",
        "append",
      ),
    ).toThrow(/新白板/);
    expect(() =>
      planAiInsertion(
        { ...canvas, source: "damaged" },
        captureAiTarget({ ...canvas, source: "damaged" }, null),
        '{"cards":[{"title":"A","content":"B"}]}',
        "canvas",
        "append",
      ),
    ).toThrow(/白板/);
  });
});
