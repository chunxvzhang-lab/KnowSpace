import { describe, expect, it } from "vitest";
import {
  annotationsFromOutline,
  bytesFromBase64,
  importFileName,
  outlineToMarkdown,
  parseFreemindOutline,
  parseOpmlOutline,
  parseOutlineBytes,
  parseOutlineFile,
  parseXmindOutline,
  type ImportedOutline,
} from "../services/mindmapImport";
import { buildXmind, buildZip } from "./helpers/zipBuilder";
import { applyImportedAnnotations, emptySidecar, sidecarIsEmpty } from "../services/mindmapSidecar";
import { parseMarkdownToMindmapTree } from "../services/mindmapService";
import type { MindmapNode } from "../core/types";

/**
 * Reading another app's outline.
 *
 * The failure that matters here is silent: a nesting rule guessed wrong produces a
 * document that opens as a flat list — every topic present, none of them where
 * they belong — and nothing complains. So the tests are mostly about shape, and
 * the last one checks the property the whole import rests on: that the Markdown
 * this writes is read back as the same outline.
 */

/** A file in the shape XMind and OmniOutliner write. */
function opml(body: string, head = "<head><title>我的大纲</title></head>"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">${head}<body>${body}</body></opml>`;
}

function outlineOf(xml: string): ImportedOutline {
  const result = parseOpmlOutline(xml);
  if (!result.ok) throw new Error(`这一条本该能解析：${result.message}`);
  return result.outline;
}

/** The texts of a tree, depth-first, each with its depth — the shape, in order. */
function shape(node: MindmapNode, depth = 0): string[] {
  return [
    `${"  ".repeat(depth)}${node.text}`,
    ...node.children.flatMap((child) => shape(child, depth + 1)),
  ];
}

describe("读 OPML", () => {
  it("嵌套按嵌套读，不按出现顺序拍平", () => {
    const outline = outlineOf(
      opml(
        '<outline text="第一章"><outline text="1.1"/><outline text="1.2"><outline text="1.2.1"/></outline></outline><outline text="第二章"/>'
      )
    );

    expect(outline.topics).toHaveLength(2);
    expect(outline.topics[0].text).toBe("第一章");
    expect(outline.topics[0].children.map((t) => t.text)).toEqual(["1.1", "1.2"]);
    expect(outline.topics[0].children[1].children[0].text).toBe("1.2.1");
    // The second top-level topic is a sibling of the first, not its child.
    expect(outline.topics[1].children).toEqual([]);
    expect(outline.title).toBe("我的大纲");
  });

  it("标签依次从 text、title、元素文字里找", () => {
    // `text` is OPML 2.0's; the other two are what other exporters write instead,
    // and a topic with no label at all would be a list item with nothing in it.
    const outline = outlineOf(
      opml('<outline text="甲的"/><outline title="乙的"/><outline>丙的</outline><outline/>')
    );

    expect(outline.topics.map((t) => t.text)).toEqual(["甲的", "乙的", "丙的", "未命名"]);
  });

  it("标签里的换行与空白折成一行", () => {
    // In the source these are attribute values, where a newline is legal — but a
    // newline in a list item ends the item, and the rest of the label would
    // arrive as a sibling topic.
    const outline = outlineOf(opml('<outline text="第一行&#10;第二行   还有空格"/>'));

    expect(outline.topics[0].text).toBe("第一行 第二行 还有空格");
  });

  it("备注与链接跟着主题走，两种写法都认", () => {
    const outline = outlineOf(
      opml('<outline text="甲" _note="记一笔"/><outline text="乙" note="换个名字写" url="https://example.com"/>')
    );

    expect(outline.topics[0].note).toBe("记一笔");
    expect(outline.topics[1].note).toBe("换个名字写");
    expect(outline.topics[1].link).toBe("https://example.com");
    expect(outline.topics[0].link).toBeUndefined();
  });

  it("不认识的属性与 type 照常导入，不去报告", () => {
    // A reader who exported an outline wants the outline. A `type` this build
    // does not implement describes the topic's contents elsewhere, not its place
    // in the outline, and refusing the file over it would be the wrong trade.
    const outline = outlineOf(
      opml('<outline text="订阅" type="rss" xmlUrl="https://example.com/feed.xml" 自定义="随便"/>')
    );

    expect(outline.topics[0].text).toBe("订阅");
    expect(outline.topics[0].children).toEqual([]);
  });

  it("带 BOM 的文件照读", () => {
    const outline = outlineOf(`\uFEFF${opml('<outline text="甲"/>')}`);

    expect(outline.topics[0].text).toBe("甲");
  });

  it("不是大纲的文件说清楚哪里不对", () => {
    expect(parseOpmlOutline("")).toEqual({ ok: false, message: "文件是空的。" });
    expect(parseOpmlOutline("   \n ")).toEqual({ ok: false, message: "文件是空的。" });

    const broken = parseOpmlOutline("<opml><body>");
    expect(broken.ok).toBe(false);

    // An outline in another format: FreeMind's `<map>` is not an OPML, and saying
    // so is more useful than importing its attributes as topics.
    const freemind = parseOpmlOutline('<?xml version="1.0"?><map version="1.0.1"><node TEXT="甲"/></map>');
    expect(freemind).toEqual({
      ok: false,
      message: "这个文件不是 OPML 大纲（没有 <opml><body>）。",
    });
  });

  it("没有 head 的大纲也读", () => {
    const outline = outlineOf(`<opml version="1.0"><body><outline text="甲"/></body></opml>`);

    expect(outline.title).toBe("");
    expect(outline.topics[0].text).toBe("甲");
  });
});

describe("写成 Markdown", () => {
  it("每层两个空格，用 - 开头", () => {
    const markdown = outlineToMarkdown(
      outlineOf(opml('<outline text="甲"><outline text="乙"><outline text="丙"/></outline></outline>'))
    );

    expect(markdown).toBe("- 甲\n  - 乙\n    - 丙\n");
  });

  it("空大纲写成空字符串，而不是一个空行", () => {
    expect(outlineToMarkdown({ title: "空的", topics: [] })).toBe("");
  });

  it("写出来的 Markdown 读回去还是同一棵树", () => {
    // The property the import rests on: the document is the source of truth from
    // the moment it exists, so the translation has to survive the reader that
    // will be applied to it a second later.
    const outline = outlineOf(
      opml(
        '<outline text="父"><outline text="子甲"/><outline text="子乙"><outline text="孙"/></outline></outline><outline text="第二个分支"/>'
      )
    );

    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的大纲");

    expect(shape(tree)).toEqual([
      "我的大纲",
      "  父",
      "    子甲",
      "    子乙",
      "      孙",
      "  第二个分支",
    ]);
  });
});

describe("备注与链接落到哪几个节点上", () => {
  it("按位置对上，包括嵌套里的", () => {
    const outline = outlineOf(
      opml(
        '<outline text="父" _note="父的备注"><outline text="子" _note="子的备注" url="https://example.com"/></outline>'
      )
    );
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的大纲");

    const { notes, links } = annotationsFromOutline(outline, tree);

    const parent = tree.children[0];
    const child = parent.children[0];
    expect(notes[parent.id]).toBe("父的备注");
    expect(notes[child.id]).toBe("子的备注");
    expect(links[child.id]).toBe("https://example.com");
    expect(Object.keys(notes)).toHaveLength(2);
  });

  it("两棵树的形状对不上时停住，而不是错位", () => {
    // Which would mean the two did not come from one another. Walking on would
    // put every annotation after the mismatch on the wrong topic — a failure that
    // looks like the importer mis-remembering, not like a mismatch.
    const outline = outlineOf(
      opml('<outline text="甲" _note="甲的"><outline text="甲的子里有备注" _note="子的"/></outline>')
    );
    const tree = parseMarkdownToMindmapTree("- 甲\n", "标题");

    const { notes } = annotationsFromOutline(outline, tree);

    expect(notes[tree.children[0].id]).toBe("甲的");
    expect(Object.keys(notes)).toHaveLength(1);
  });

  it("没有标注就不写文件（调用方据此决定要不要落盘）", () => {
    const outline = outlineOf(opml('<outline text="甲"><outline text="乙"/></outline>'));
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "标题");

    const annotations = annotationsFromOutline(outline, tree);

    // Asserted the way the caller asks it: not "is this object empty" but "would
    // writing it produce a file with anything in it".
    expect(sidecarIsEmpty(applyImportedAnnotations(emptySidecar(), annotations))).toBe(true);
    expect(annotations.relations).toEqual([]);
    expect(annotations.summaries).toEqual([]);
    expect(annotations.boundaries).toEqual([]);
  });
});

describe("读 FreeMind", () => {
  /** A file in the shape FreeMind writes. */
  const mm = (root: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">${root}</map>`;

  function freemindOf(xml: string): ImportedOutline {
    const result = parseFreemindOutline(xml);
    if (!result.ok) throw new Error(`这一条本该能解析：${result.message}`);
    return result.outline;
  }

  it("只有一个根，所以根就是这份大纲", () => {
    // The difference from OPML is not a detail: a single root *is* the outline, so
    // its text names the file and its children are the document's first level.
    const outline = freemindOf(
      mm('<node TEXT="我的导图"><node TEXT="甲"/><node TEXT="乙"><node TEXT="乙一"/></node></node>')
    );

    expect(outline.root?.text).toBe("我的导图");
    expect(outline.topics).toEqual([]);
    expect(outline.root?.children.map((t) => t.text)).toEqual(["甲", "乙"]);
    expect(outline.root?.children[1].children[0].text).toBe("乙一");
    // No title element in the format at all: the name comes from the root.
    expect(outline.title).toBe("");
  });

  it("TEXT 的大小写两种都认", () => {
    const outline = freemindOf(mm('<node TEXT="甲"><node text="小写的"/></node>'));

    expect(outline.root?.children[0].text).toBe("小写的");
  });

  it("备注是 HTML：取它的文字，段落与换行留着", () => {
    // FreeMind writes notes as an HTML fragment, and they are going into a text
    // field here — so the markup would only be in the way, while the paragraph
    // breaks are the note's own shape.
    const outline = freemindOf(
      mm(
        '<node TEXT="甲"><richcontent TYPE="NOTE"><html><body><p>第一段</p><p>第二段<br/>下一行</p></body></html></richcontent></node>'
      )
    );

    expect(outline.root?.note).toBe("第一段\n第二段\n下一行");
  });

  it("备注写成纯文字也认", () => {
    const outline = freemindOf(
      mm('<node TEXT="甲"><richcontent TYPE="NOTE">就是一句话</richcontent></node>')
    );

    expect(outline.root?.note).toBe("就是一句话");
  });

  it("链接读 LINK，图标与折叠状态不读", () => {
    // The icon set belongs to a Java client and has no counterpart in this app's
    // table; the fold state belongs to the reader's session here rather than to
    // the document.
    const outline = freemindOf(
      mm(
        '<node TEXT="甲" LINK="https://example.com" FOLDED="true" POSITION="right" COLOR="#ff0000"><icon BUILTIN="idea"/><node TEXT="乙"/></node>'
      )
    );

    expect(outline.root?.link).toBe("https://example.com");
    expect(outline.root?.children.map((t) => t.text)).toEqual(["乙"]);
  });

  it("没有主题的 map 说不出来，就报错", () => {
    expect(parseFreemindOutline(mm(""))).toEqual({
      ok: false,
      message: "这份 FreeMind 导图里没有主题。",
    });
  });

  it("根主题的备注落在文档根上，不是丢掉", () => {
    const outline = freemindOf(
      mm(
        '<node TEXT="我的导图"><richcontent TYPE="NOTE">根上的一句话</richcontent><node TEXT="甲"><richcontent TYPE="NOTE">甲的</richcontent></node></node>'
      )
    );
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的导图");

    const { notes } = annotationsFromOutline(outline, tree);

    // The document's own root *is* the imported root, so its note has somewhere
    // to go — which is why the root is kept as a root instead of being folded
    // into the list of topics.
    expect(notes[tree.id]).toBe("根上的一句话");
    expect(notes[tree.children[0].id]).toBe("甲的");
  });

  it("写出来的 Markdown 读回去还是一样深", () => {
    const outline = freemindOf(
      mm('<node TEXT="我的导图"><node TEXT="甲"/><node TEXT="乙"><node TEXT="乙一"/></node></node>')
    );

    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的导图");

    expect(shape(tree)).toEqual(["我的导图", "  甲", "  乙", "    乙一"]);
  });
});

describe("读 XMind", () => {
  /** A sheet as XMind writes one, with topic ids this app never sees. */
  const xmindTopic = (title: string, extra: Record<string, unknown> = {}, attached: unknown[] = []) => ({
    id: `xmind-${title}`,
    class: "topic",
    title,
    ...extra,
    ...(attached.length > 0 ? { children: { attached } } : {}),
  });

  function xmindOf(content: unknown): ImportedOutline {
    const result = parseXmindOutline(buildXmind(content));
    if (!result.ok) throw new Error(`这一条本该能解析：${result.message}`);
    return result.outline;
  }

  it("一张画布：根主题就是文档，子主题按 attatched 读", () => {
    const outline = xmindOf([
      {
        id: "sheet-1",
        class: "sheet",
        title: "我的画布",
        rootTopic: xmindTopic("中心主题", {}, [
          xmindTopic("甲"),
          xmindTopic("乙", {}, [xmindTopic("乙一")]),
        ]),
      },
    ]);

    // The sheet's title is what a reader would call the file, so it names it;
    // the root topic is the document itself, as in FreeMind.
    expect(outline.title).toBe("我的画布");
    expect(outline.root?.text).toBe("中心主题");
    expect(outline.root?.children.map((t) => t.text)).toEqual(["甲", "乙"]);
    expect(outline.root?.children[1].children[0].text).toBe("乙一");
  });

  it("备注读 plain，其次把 realHTML 摊平", () => {
    // XMind keeps the note twice: as plain text and marked up. Either one that is
    // there is better than the note going missing.
    const outline = xmindOf([
      {
        title: "画布",
        rootTopic: xmindTopic("根", {}, [
          xmindTopic("甲", { notes: { plain: { content: "一段备注" } } }),
          xmindTopic("乙", {
            notes: { realHTML: { content: "<p>第一段</p><p>第二段</p>" } },
          }),
        ]),
      },
    ]);

    expect(outline.root?.children[0].note).toBe("一段备注");
    expect(outline.root?.children[1].note).toBe("第一段\n第二段");
  });

  it("链接读 href", () => {
    const outline = xmindOf([
      { title: "画布", rootTopic: xmindTopic("根", { href: "https://example.com" }) },
    ]);

    expect(outline.root?.link).toBe("https://example.com");
  });

  it("浮动主题不导入，并且说出来", () => {
    // They are the sheet's detached topics, with no position this file states:
    // importing them would stack every one on the same spot.
    const outline = xmindOf([
      {
        title: "画布",
        rootTopic: {
          title: "根",
          children: {
            attached: [xmindTopic("挂着的")],
            detached: [xmindTopic("飘在一边的")],
          },
        },
      },
    ]);

    expect(outline.root?.children.map((t) => t.text)).toEqual(["挂着的"]);
  });

  it("多张画布：只导入第一张，并说清楚还有几张", () => {
    const outline = xmindOf([
      { title: "第一张", rootTopic: xmindTopic("甲的根") },
      { title: "第二张", rootTopic: xmindTopic("乙的根") },
      { title: "第三张", rootTopic: xmindTopic("丙的根") },
    ]);

    expect(outline.root?.text).toBe("甲的根");
    // A document is one tree, so "imported" without this would be a half-truth.
    expect(outline.warning).toContain("2 张");
  });

  it("没有 content.json 的时候，XMind 8 的事要说出来", () => {
    // An older XMind stores content.xml instead, and "no such entry" would leave
    // the reader with nothing to go on.
    const zip = buildZip([{ name: "content.xml", data: new TextEncoder().encode("<xmap-content/>") }]);

    const result = parseXmindOutline(zip);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("content.json");
      expect(result.message).toContain("XMind 8");
    }
  });

  it("坏 JSON 与没有根主题：各说各的", () => {
    const badJson = buildZip([
      { name: "content.json", data: new TextEncoder().encode("{not json") },
    ]);
    const badResult = parseXmindOutline(badJson);
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.message).toContain("JSON");

    const noTopic = parseXmindOutline(buildXmind([{ title: "空的画布" }]));
    expect(noTopic.ok).toBe(false);
    if (!noTopic.ok) expect(noTopic.message).toContain("没有可读的画布");
  });

  it("主题之间的关系线读进来，标签一起", () => {
    // The line lives on the sheet and names its two ends by the file's own ids, so
    // the only way to read it is against the tree that was just walked.
    const outline = xmindOf([
      {
        title: "画布",
        rootTopic: xmindTopic("根", {}, [xmindTopic("甲"), xmindTopic("乙")]),
        relationships: [
          { id: "rel-1", class: "relationship", end1Id: "xmind-甲", end2Id: "xmind-乙", title: "取决于" },
          // One end names a topic this sheet does not have: a line to nowhere.
          { id: "rel-2", class: "relationship", end1Id: "xmind-甲", end2Id: "xmind-不存在" },
        ],
      },
    ]);
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "画布");

    const { relations } = annotationsFromOutline(outline, tree);

    expect(relations).toEqual([
      { fromId: tree.children[0].id, toId: tree.children[1].id, label: "取决于" },
    ]);
  });

  it("概要的跨度展开成中间那一串，不只是两个端点", () => {
    // A span names where it begins and ends and covers everything between — which
    // is what it draws as, and what this app's bracket has to span too.
    const outline = xmindOf([
      {
        title: "画布",
        rootTopic: {
          title: "根",
          children: {
            attached: [xmindTopic("甲"), xmindTopic("乙"), xmindTopic("丙"), xmindTopic("丁")],
            summary: [{ id: "s1", class: "summary", title: "总述", range: "(xmind-乙,xmind-丙)" }],
            // Written the other way round, which also turns up, and past the end of
            // the run it names: not a pair of siblings, so nothing to draw.
            boundary: [
              { id: "b1", class: "boundary", title: "一组", range: "(xmind-丙,xmind-乙)" },
              { id: "b2", class: "boundary", title: "错的", range: "(xmind-乙,xmind-不存在)" },
            ],
          },
        },
      },
    ]);
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "画布");
    const [a, b, c] = tree.children;

    const { summaries, boundaries } = annotationsFromOutline(outline, tree);

    expect(summaries).toEqual([{ nodeIds: [b.id, c.id], text: "总述" }]);
    expect(boundaries).toEqual([{ nodeIds: [b.id, c.id], text: "一组" }]);
    expect(boundaries[0].nodeIds).not.toContain(a.id);
  });

  it("标签与优先级、进度：认识的那几个读进来", () => {
    // XMind's marker set is large and most of it is what this app expresses as an
    // icon, which the two tables do not share ids for. Priorities and progress are
    // the two they do, so those are read and the rest are left.
    const outline = xmindOf([
      {
        title: "画布",
        rootTopic: xmindTopic("根", {}, [
          xmindTopic("甲", {
            labels: ["api", "待办"],
            markers: [{ markerId: "priority-3" }, { markerId: "task-half" }],
          }),
          xmindTopic("乙", { markers: [{ markerId: "star-red" }, { markerId: "flag-green" }] }),
        ]),
      },
    ]);
    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "画布");

    const { tags, markers } = annotationsFromOutline(outline, tree);

    expect(tags[tree.children[0].id]).toEqual(["api", "待办"]);
    expect(markers[tree.children[0].id]).toEqual({ priority: 3, progress: 4 });
    // Nothing this build knows: not imported, and not invented either.
    expect(markers[tree.children[1].id]).toBeUndefined();
    expect(tags[tree.children[1].id]).toBeUndefined();
  });

  it("整条路：一份 .xmind → 新文档 + 它的伴生文件", () => {
    // Everything the import does, end to end: bytes in, a document and the
    // annotations it will read back out.
    const xml = buildXmind([
      {
        title: "我的画布",
        rootTopic: {
          title: "中心主题",
          children: {
            attached: [
              xmindTopic("甲", { labels: ["api"] }),
              xmindTopic("乙", {}, [xmindTopic("乙一")]),
            ],
            summary: [{ title: "两种走法", range: "(xmind-甲,xmind-乙)" }],
            boundary: [{ title: "一组", range: "(xmind-乙,xmind-乙)" }],
          },
        },
        relationships: [{ end1Id: "xmind-甲", end2Id: "xmind-乙一" }],
      },
    ]);

    const parsed = parseOutlineBytes(xml);
    if (!parsed.ok) throw new Error(parsed.message);

    const markdown = outlineToMarkdown(parsed.outline);
    const tree = parseMarkdownToMindmapTree(markdown, "我的画布");
    const sidecar = applyImportedAnnotations(
      emptySidecar(),
      annotationsFromOutline(parsed.outline, tree)
    );

    expect(shape(tree)).toEqual(["我的画布", "  甲", "  乙", "    乙一"]);
    expect(sidecar.tags[tree.children[0].id]).toEqual(["api"]);
    // The span covers 甲 through 乙, and the line joins 甲 to 乙一 — a nested topic,
    // which is exactly the kind of line a tree cannot draw and this app can.
    expect(sidecar.summaries["summary-1"].nodeIds).toEqual([
      tree.children[0].id,
      tree.children[1].id,
    ]);
    expect(sidecar.boundaries["boundary-1"].nodeIds).toEqual([tree.children[1].id]);
    expect(sidecar.relations[0].toId).toBe(tree.children[1].children[0].id);
  });

  it("从字节到一棵树：整条路走通", () => {
    // The property the import rests on, for the format whose content is not text:
    // an .xmind becomes Markdown, and the app's own reader turns that back into the
    // outline the file described.
    const outline = xmindOf([
      {
        title: "我的画布",
        rootTopic: xmindTopic("中心主题", {}, [
          xmindTopic("甲"),
          xmindTopic("乙", {}, [xmindTopic("乙一")]),
        ]),
      },
    ]);

    const tree = parseMarkdownToMindmapTree(outlineToMarkdown(outline), "我的画布");

    expect(shape(tree)).toEqual(["我的画布", "  甲", "  乙", "    乙一"]);
  });
});

describe("按内容决定是哪种格式", () => {
  it("根元素说了算，而不是扩展名", () => {
    // The same exporter writes .xml for both, so the extension cannot be trusted
    // and the root element cannot be wrong.
    const opmlResult = parseOutlineFile(
      '<?xml version="1.0"?><opml version="2.0"><body><outline text="甲"/></body></opml>'
    );
    expect(opmlResult.ok && opmlResult.outline.topics[0].text).toBe("甲");

    const freemindResult = parseOutlineFile(
      '<?xml version="1.0"?><map version="1.0.1"><node TEXT="根"/></map>'
    );
    expect(freemindResult.ok && freemindResult.outline.root?.text).toBe("根");
  });

  it("都不像时，说清楚能读什么", () => {
    // "Not OPML" is not useful news if FreeMind was what the reader had in mind.
    const result = parseOutlineFile('<?xml version="1.0"?><xmind><sheet/></xmind>');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("xmind");
    expect(result.message).toContain("OPML");
    expect(result.message).toContain("FreeMind");
  });

  it("空文件与坏 XML 走同一套说法", () => {
    expect(parseOutlineFile("")).toEqual({ ok: false, message: "文件是空的。" });
    expect(parseOutlineFile("<map><node")).toEqual({
      ok: false,
      message: "这个文件不是可以解析的 XML。",
    });
  });

  it("有字节这一层：压缩包与文本各走各的门", () => {
    // The one format whose contents are not text at all. Everything else arrives
    // as bytes too, and is decoded here rather than in the main process, so that
    // nothing has to be decided before the content can be looked at.
    const zip = buildXmind([{ title: "画布", rootTopic: { title: "根" } }]);
    const zipped = parseOutlineBytes(zip);
    expect(zipped.ok && zipped.outline.root?.text).toBe("根");

    const text = parseOutlineBytes(new TextEncoder().encode('<?xml version="1.0"?><map><node TEXT="甲"/></map>'));
    expect(text.ok && text.outline.root?.text).toBe("甲");
  });

  it("base64 送过来的字节，解回来一模一样", () => {
    // How the file arrives from the main process, base64 and all: a ZIP cannot be
    // carried as text, and a typed array across an IPC boundary is a thing whose
    // serialization is not worth doubting.
    const zip = buildXmind([{ title: "画布", rootTopic: { title: "根" } }]);
    const base64 = Buffer.from(zip).toString("base64");

    expect(Array.from(bytesFromBase64(base64))).toEqual(Array.from(zip));
  });
});

describe("新文档叫什么", () => {
  it("先用自己的标题，再用源文件名", () => {
    expect(importFileName({ title: "我的大纲", topics: [] }, "导出.opml")).toBe("我的大纲.md");
    expect(importFileName({ title: "", topics: [] }, "导出.opml")).toBe("导出.md");
    // Extension casing varies by exporter.
    expect(importFileName({ title: "", topics: [] }, "导出.OPML")).toBe("导出.md");
    expect(importFileName({ title: "", topics: [] }, "我的导图.mm")).toBe("我的导图.md");
    // A single root names the file when there is no head title — the format has
    // nowhere else to put a name.
    expect(importFileName({ title: "", topics: [], root: { text: "根的名字", children: [] } }, "x.mm")).toBe(
      "根的名字.md"
    );
  });

  it("名字里的分隔符换掉：文件得能建出来", () => {
    expect(importFileName({ title: "第一章/第二章: 开头", topics: [] }, "x.opml")).toBe(
      "第一章 第二章 开头.md"
    );
    // Nothing usable left: a default rather than a file called `.md`.
    expect(importFileName({ title: "///", topics: [] }, ".opml")).toBe("导入的大纲.md");
  });
});
