import { describe, it, expect } from "vitest";
import type { MindmapNode } from "../core/types";
import {
  escapeXml,
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToMarkdownOutline,
} from "../services/mindmapExport";

describe("Mindmap Format Ecosystem Exporters", () => {
  const sampleTree: MindmapNode = {
    id: "root-1",
    text: "软件架构 & 设计规范",
    level: 0,
    children: [
      {
        id: "node-1",
        text: "前端架构 <Web>",
        level: 1,
        color: "#38bdf8",
        children: [
          {
            id: "node-1-1",
            text: "React 19 & TypeScript",
            level: 2,
            children: [],
          },
          {
            id: "node-1-2",
            text: "Cytoscape 知识图谱",
            level: 2,
            children: [],
          },
        ],
      },
      {
        id: "node-2",
        text: "存储引擎",
        level: 1,
        children: [
          {
            id: "node-2-1",
            text: "本地优先 (Local-First) & 原子落盘",
            level: 2,
            children: [],
          },
        ],
      },
    ],
  };

  it("escapes XML special characters correctly", () => {
    expect(escapeXml("Hello & <World> \"Quotes\" 'Single'")).toBe(
      "Hello &amp; &lt;World&gt; &quot;Quotes&quot; &apos;Single&apos;"
    );
    expect(escapeXml("")).toBe("");
  });

  it("exports valid standard OPML 2.0 structure with nested outlines", () => {
    const opml = exportMindmapToOpml(sampleTree, "工程架构导图");

    expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain("<title>工程架构导图</title>");
    expect(opml).toContain("<ownerName>KnowSpace</ownerName>");
    expect(opml).toContain('text="软件架构 &amp; 设计规范"');
    expect(opml).toContain('text="前端架构 &lt;Web&gt;"');
    expect(opml).toContain('color="#38bdf8"');
    expect(opml).toContain('text="React 19 &amp; TypeScript"');
    expect(opml).toContain('text="Cytoscape 知识图谱"');
    expect(opml).toContain('text="本地优先 (Local-First) &amp; 原子落盘"');
    expect(opml).toContain("</outline>");
    expect(opml).toContain("</opml>");
  });

  it("exports valid FreeMind 1.0.1 (.mm) XML format for XMind and FreeMind compatibility", () => {
    const mm = exportMindmapToFreeMind(sampleTree);

    expect(mm).toContain('<map version="1.0.1">');
    expect(mm).toContain('TEXT="软件架构 &amp; 设计规范"');
    expect(mm).toContain('TEXT="前端架构 &lt;Web&gt;"');
    expect(mm).toContain('COLOR="#38bdf8"');
    expect(mm).toContain('TEXT="React 19 &amp; TypeScript"');
    expect(mm).toContain('TEXT="本地优先 (Local-First) &amp; 原子落盘"');
    expect(mm).toContain("</map>");
  });

  it("exports clean structured Markdown outline with indented lists", () => {
    const md = exportMindmapToMarkdownOutline(sampleTree);

    expect(md).toContain("# 软件架构 & 设计规范");
    expect(md).toContain("- 前端架构 <Web>");
    expect(md).toContain("  - React 19 & TypeScript");
    expect(md).toContain("  - Cytoscape 知识图谱");
    expect(md).toContain("- 存储引擎");
    expect(md).toContain("  - 本地优先 (Local-First) & 原子落盘");
  });
});
