import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { writeZip, readZipEntry } from "../core/zip";
import { exportMindmapToXmind } from "../services/mindmapExport";
import { MindmapExportMenu } from "../components/MindmapExportMenu";
import { parseOutlineBytes, outlineToMarkdown, annotationsFromOutline } from "../services/mindmapImport";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import {
  addBoundary,
  addSummary,
  emptySidecar,
  setNodeLink,
  setNodeNote,
  setNodePriority,
  setNodeTags,
  toggleRelation,
  type MindmapSidecar,
} from "../services/mindmapSidecar";
import type { MindmapNode } from "../core/types";

/**
 * Writing an `.xmind`.
 *
 * There is no XMind on this machine to open the file with, so the verification is
 * the other half of this project: **the importer reads what the exporter wrote**,
 * and the two are checked against each other. What that cannot tell me is whether
 * XMind itself is happy — which is stated in the record rather than implied here.
 */

const encoder = new TextEncoder();

/** A map with something of everything on it, which is what has to survive. */
function build() {
  const tree: MindmapNode = {
    id: "root",
    text: "中心主题",
    level: 0,
    children: [
      { id: "a", text: "甲", level: 1, children: [] },
      {
        id: "b",
        text: "乙",
        level: 1,
        children: [{ id: "b1", text: "乙一", level: 2, children: [] }],
      },
      { id: "c", text: "丙", level: 1, children: [] },
    ],
  };

  let sidecar: MindmapSidecar = emptySidecar();
  sidecar = setNodeNote(sidecar, "a", "甲的一段备注");
  sidecar = setNodeLink(sidecar, "b1", "https://example.com");
  sidecar = setNodeTags(sidecar, "a", ["api", "待办"]);
  sidecar = setNodePriority(sidecar, "c", 2);
  sidecar = toggleRelation(sidecar, "a", "b1");
  sidecar = addSummary(sidecar, ["b", "c"], "两种走法").sidecar;
  sidecar = addBoundary(sidecar, ["c"], "单独一组").sidecar;

  return { tree, sidecar };
}

/** The `content.json` inside an exported file, as it was written. */
function contentOf(bytes: Uint8Array): { sheets: any[]; raw: string } {
  const entry = readZipEntry(bytes, (name) => name === "content.json", "content.json");
  if (!entry.ok) throw new Error(`导出的包里没有 content.json：${entry.message}`);
  const raw = new TextDecoder().decode(entry.bytes);
  return { sheets: JSON.parse(raw), raw };
}

describe("写一个 ZIP", () => {
  it("自己写的包，自己的读取器读得回来（含 CRC）", () => {
    // The two halves check each other: a wrong CRC table on either side, or an
    // offset counted wrong, shows up here as a failed read rather than as a file
    // that opens somewhere else.
    const zip = writeZip([
      { name: "content.json", bytes: encoder.encode('{"你好":"世界"}') },
      { name: "metadata.json", bytes: encoder.encode("{}") },
    ]);

    const content = readZipEntry(zip, (name) => name === "content.json", "content.json");
    expect(content.ok).toBe(true);
    if (content.ok) expect(new TextDecoder().decode(content.bytes)).toBe('{"你好":"世界"}');

    const metadata = readZipEntry(zip, (name) => name === "metadata.json", "metadata.json");
    expect(metadata.ok).toBe(true);
  });

  it("大一些的条目也对得上：偏移不是算一次就完的", () => {
    const big = "重复的内容".repeat(8000);
    const zip = writeZip([
      { name: "a.json", bytes: encoder.encode("小的") },
      { name: "b.json", bytes: encoder.encode(big) },
      { name: "c.json", bytes: encoder.encode("最后") },
    ]);

    const middle = readZipEntry(zip, (name) => name === "b.json", "b.json");
    expect(middle.ok).toBe(true);
    if (middle.ok) expect(new TextDecoder().decode(middle.bytes)).toBe(big);

    const last = readZipEntry(zip, (name) => name === "c.json", "c.json");
    expect(last.ok).toBe(true);
    if (last.ok) expect(new TextDecoder().decode(last.bytes)).toBe("最后");
  });
});

describe("导出为 .xmind", () => {
  it("树按 XMind 的形状写：标题、嵌套、备注、链接、标签、标记", () => {
    const { tree, sidecar } = build();

    const { sheets } = contentOf(exportMindmapToXmind(tree, { sidecar }));

    const rootTopic = sheets[0].rootTopic;
    expect(sheets[0].class).toBe("sheet");
    expect(rootTopic.title).toBe("中心主题");

    const [a, b] = rootTopic.children.attached;
    expect(a.title).toBe("甲");
    expect(a.notes.plain.content).toBe("甲的一段备注");
    expect(a.labels).toEqual(["api", "待办"]);

    // Nested, not flattened: the grandchild is under 乙 and nowhere else.
    expect(b.children.attached[0].title).toBe("乙一");
    expect(b.children.attached[0].href).toBe("https://example.com");
  });

  it("跨越一组主题的概要写成 range，挂在那个父主题下面", () => {
    // Which is where XMind keeps them, and where the importer looks for them —
    // a span is not a topic, so it has no place in the attached list.
    const { tree, sidecar } = build();

    const rootTopic = contentOf(exportMindmapToXmind(tree, { sidecar })).sheets[0].rootTopic;
    const [a, b, c] = rootTopic.children.attached;

    expect(rootTopic.children.summary).toHaveLength(1);
    expect(rootTopic.children.summary[0]).toMatchObject({ class: "summary", title: "两种走法" });
    expect(rootTopic.children.summary[0].range).toBe(`(${b.id},${c.id})`);

    expect(rootTopic.children.boundary[0].range).toBe(`(${c.id},${c.id})`);
    // Not hung off a topic that merely happens to be first in the run.
    expect(a.children?.summary).toBeUndefined();
  });

  it("线写在画布上，标签一起", () => {
    const { tree, sidecar } = build();

    const sheet = contentOf(exportMindmapToXmind(tree, { sidecar })).sheets[0];

    expect(sheet.relationships).toHaveLength(1);
    const relation = sheet.relationships[0];
    expect(relation.class).toBe("relationship");
    // One end is a grandchild: a line to a nested topic, which is the point of
    // having them at all.
    expect([relation.end1Id, relation.end2Id]).toHaveLength(2);
    expect(sheet.rootTopic.children.attached[1].children.attached[0].id).toBe(relation.end2Id);
  });

  it("metadata.json 也在，且不用压缩就能读", () => {
    const { tree, sidecar } = build();

    const bytes = exportMindmapToXmind(tree, { sidecar });
    const entry = readZipEntry(bytes, (name) => name === "metadata.json", "metadata.json");

    expect(entry.ok).toBe(true);
  });
});

describe("导出再读回来：同一个导图", () => {
  it("树、备注、链接、标签、优先级、线、概要、边界都对得上", () => {
    // The property this feature rests on, and the only verification available for a
    // format whose own application is not here: what was written, read back, is the
    // map it was written from.
    const { tree, sidecar } = build();

    const parsed = parseOutlineBytes(exportMindmapToXmind(tree, { sidecar }));
    if (!parsed.ok) throw new Error(parsed.message);

    const back = parseMarkdownToMindmapTree(outlineToMarkdown(parsed.outline), "中心主题");

    const texts = (node: MindmapNode): string[] => [
      node.text,
      ...node.children.flatMap(texts),
    ];
    expect(texts(back)).toEqual(texts(tree));

    const annotations = annotationsFromOutline(parsed.outline, back);
    const [a, b, c] = back.children;

    expect(annotations.notes[a.id]).toBe("甲的一段备注");
    expect(annotations.tags[a.id]).toEqual(["api", "待办"]);
    expect(annotations.links[b.children[0].id]).toBe("https://example.com");
    expect(annotations.markers[c.id]).toEqual({ priority: 2 });

    // The span covers the same run, and the line joins the same two topics.
    expect(annotations.summaries[0].nodeIds).toEqual([b.id, c.id]);
    expect(annotations.summaries[0].text).toBe("两种走法");
    expect(annotations.boundaries[0].nodeIds).toEqual([c.id]);
    expect(annotations.relations[0]).toMatchObject({ fromId: a.id, toId: b.children[0].id });
  });

  it("读到的东西写进伴生文件，与原文件一致（按位置比）", () => {
    const { tree, sidecar } = build();

    const parsed = parseOutlineBytes(exportMindmapToXmind(tree, { sidecar }));
    if (!parsed.ok) throw new Error(parsed.message);
    const back = parseMarkdownToMindmapTree(outlineToMarkdown(parsed.outline), "中心主题");
    const annotations = annotationsFromOutline(parsed.outline, back);

    // Compared by what each annotation *says*, since the two maps name their nodes
    // differently by design — the ids are the document's own, not the file's.
    expect(Object.values(annotations.notes)).toEqual(Object.values(sidecar.notes));
    expect(Object.values(annotations.tags)).toEqual(Object.values(sidecar.tags));
    expect(annotations.markers[back.children[2].id]).toEqual(
      sidecar.markers[tree.children[2].id]
    );
    expect(annotations.summaries).toHaveLength(Object.keys(sidecar.summaries).length);
    expect(annotations.boundaries).toHaveLength(Object.keys(sidecar.boundaries).length);
    expect(annotations.relations).toHaveLength(sidecar.relations.length);
  });

  it("浮动主题不在文件里，谁也不假装它在", () => {
    // This app can draw a line to a topic the outline does not own; XMind's line
    // points at a topic, and there is no topic. So neither the topic nor the line
    // is written, and that is a stated limit rather than an oversight.
    const { tree, sidecar } = build();
    const withFloating: MindmapSidecar = {
      ...sidecar,
      floating: { "floating-1": { text: "飘着的", x: 10, y: 10 } },
      relations: [...sidecar.relations, { fromId: "a", toId: "floating-1" }],
    };

    const sheet = contentOf(exportMindmapToXmind(tree, { sidecar: withFloating })).sheets[0];

    expect(sheet.relationships).toHaveLength(1);
    expect(JSON.stringify(sheet)).not.toContain("飘着的");
  });
});

describe("导出菜单里的这一行", () => {
  it("在菜单里，点了会走到那个处理函数", () => {
    const onExportXmind = vi.fn();
    render(
      <MindmapExportMenu
        menuRef={createRef<HTMLDivElement>()}
        isOpen
        onToggle={() => {}}
        onExportPng={() => {}}
        onExportSvg={() => {}}
        onPrintPdf={() => {}}
        onExportXmind={onExportXmind}
        onExportOpml={() => {}}
        onExportFreeMind={() => {}}
        onExportMarkdownOutline={() => {}}
      />
    );

    const row = screen.getByText("导出 XMind (.xmind)");
    // The description is where the honest bit lives: it says the file carries more
    // than the tree, and that this app can read it back.
    expect(row.parentElement?.textContent).toContain("关系线与概要边界");
    fireEvent.click(row);
    expect(onExportXmind).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
