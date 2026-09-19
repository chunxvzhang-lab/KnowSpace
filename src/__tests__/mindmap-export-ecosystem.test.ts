import { describe, it, expect } from "vitest";
import type { MindmapNode } from "../core/types";
import {
  escapeXml,
  exportMindmapToOpml,
  exportMindmapToFreeMind,
  exportMindmapToMarkdownOutline,
} from "../services/mindmapExport";
import {
  annotationsFromOutline,
  outlineToMarkdown,
  parseFreemindOutline,
  parseOpmlOutline,
} from "../services/mindmapImport";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import { emptySidecar, setNodeLink, setNodeNote } from "../services/mindmapSidecar";

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

  /**
   * Notes and links, which used to fall out of these two formats on the way out.
   *
   * The asymmetry was the whole problem: both importers read exactly these two
   * things, so "export to OPML and open it again" quietly lost the reader's notes
   * while looking like it had worked. Checked by doing precisely that, with the
   * importers this app already has.
   */
  describe("备注与链接：出去再回来还在", () => {
    const withAnnotations = () => {
      let sidecar = emptySidecar();
      sidecar = setNodeNote(sidecar, "node-1", "第一行\n第二行");
      sidecar = setNodeLink(sidecar, "node-1-1", "https://example.com/notes");
      return sidecar;
    };

    /** Which node of a freshly parsed tree carries what, by the text of the topic. */
    function annotationsByText(xml: string, format: "opml" | "freemind") {
      const parsed =
        format === "opml" ? parseOpmlOutline(xml) : parseFreemindOutline(xml);
      if (!parsed.ok) throw new Error(parsed.message);

      const tree = parseMarkdownToMindmapTree(outlineToMarkdown(parsed.outline), "root");
      const annotations = annotationsFromOutline(parsed.outline, tree);
      const byText = new Map<string, { note?: string; link?: string }>();

      const walk = (node: MindmapNode) => {
        byText.set(node.text, { note: annotations.notes[node.id], link: annotations.links[node.id] });
        node.children.forEach(walk);
      };
      walk(tree);

      return byText;
    }

    it("OPML：_note 与 url 写出来，读回去还是那两条", () => {
      const xml = exportMindmapToOpml(sampleTree, "测试", withAnnotations());

      expect(xml).toContain('_note="第一行&#10;第二行"');
      expect(xml).toContain('url="https://example.com/notes"');

      const byText = annotationsByText(xml, "opml");
      // The newline survives because it is written as a character reference: a
      // literal one would be whitespace to an XML parser and come back as a space.
      expect(byText.get("前端架构 <Web>")?.note).toBe("第一行\n第二行");
      expect(byText.get("React 19 & TypeScript")?.link).toBe("https://example.com/notes");
    });

    it("FreeMind：richcontent 与 LINK 写出来，读回去还是那两条", () => {
      const xml = exportMindmapToFreeMind(sampleTree, undefined, withAnnotations());

      expect(xml).toContain('<richcontent TYPE="NOTE">');
      expect(xml).toContain('LINK="https://example.com/notes"');

      const byText = annotationsByText(xml, "freemind");
      expect(byText.get("前端架构 <Web>")?.note).toBe("第一行\n第二行");
      expect(byText.get("React 19 & TypeScript")?.link).toBe("https://example.com/notes");
    });

    it("没有标注时，文件里不多出这两个属性", () => {
      // The shape a reader without notes has always seen, unchanged — the two
      // attributes appear because there is something to put in them.
      const opml = exportMindmapToOpml(sampleTree, "测试");
      const freemind = exportMindmapToFreeMind(sampleTree);

      expect(opml).not.toContain("_note=");
      expect(opml).not.toContain("url=");
      expect(freemind).not.toContain("richcontent");
      expect(freemind).not.toContain("LINK=");
    });

    it("备注里的特殊字符仍然被转义", () => {
      const sidecar = setNodeNote(emptySidecar(), "node-2", '小于号 < 与 & 和 "引号"');
      const xml = exportMindmapToFreeMind(sampleTree, undefined, sidecar);

      expect(xml).toContain("&lt;");
      expect(xml).toContain("&amp;");
      expect(annotationsByText(xml, "freemind").get("存储引擎")?.note).toBe(
        '小于号 < 与 & 和 "引号"'
      );
    });
  });

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

    describe("FreeMind FOLDED attribute", () => {
      it("omits FOLDED entirely when nothing is collapsed", () => {
        expect(exportMindmapToFreeMind(sampleTree)).not.toContain("FOLDED");
      });

      it("writes FOLDED for a node in the collapsed set", () => {
        const xml = exportMindmapToFreeMind(sampleTree, new Set(["node-1"]));

        // The set is the only place the collapse state actually lives — the
        // model's own `collapsed` field is never written by anything — so
        // without being passed in, this attribute was always absent.
        expect(xml).toContain('FOLDED="true"');
        expect(xml).toMatch(/TEXT="前端架构 &lt;Web&gt;"[^>]*FOLDED="true"/);
      });

      it("never folds a leaf, even when its id is in the set", () => {
        // Folding a childless node means nothing; FreeMind ignores it, and
        // emitting it would be noise in the file.
        const xml = exportMindmapToFreeMind(sampleTree, new Set(["node-1-1"]));

        expect(xml).not.toContain("FOLDED");
      });

      it("still honours the model's own collapsed field", () => {
        // Kept as a fallback for a caller that sets the field directly, which
        // is what the original implementation assumed everyone did.
        const withFlag: MindmapNode = {
          ...sampleTree,
          collapsed: true,
        };

        expect(exportMindmapToFreeMind(withFlag)).toContain('FOLDED="true"');
      });

      it("marks only the collapsed nodes when several are open", () => {
        const xml = exportMindmapToFreeMind(sampleTree, new Set(["node-1"]));

        // One FOLDED for one collapsed branch — the rest of the tree stays
        // expanded so the file opens showing the structure.
        expect(xml.match(/FOLDED="true"/g)).toHaveLength(1);
      });
    });
  });
